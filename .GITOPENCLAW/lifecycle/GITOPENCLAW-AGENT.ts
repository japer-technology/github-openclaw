/**
 * GITOPENCLAW-AGENT.ts — Core agent orchestrator for GitOpenClaw.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the main entry point for the GitOpenClaw AI agent.  It receives
 * a GitHub issue (or issue comment) event, runs the OpenClaw agent against the
 * user's prompt, and posts the result back as an issue comment.  It also
 * manages all session state so that multi-turn conversations across multiple
 * workflow runs are seamlessly resumed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LIFECYCLE POSITION
 * ─────────────────────────────────────────────────────────────────────────────
 * Workflow step order:
 *   1. Guard       (GITOPENCLAW-ENABLED.ts)   — verify opt-in sentinel exists
 *   2. Preinstall  (GITOPENCLAW-INDICATOR.ts) — add 👀 reaction indicator
 *   3. Install     (bun install)               — install npm/bun dependencies
 *   4. Run         (GITOPENCLAW-AGENT.ts)     ← YOU ARE HERE
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AGENT EXECUTION PIPELINE
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. Fetch issue title/body from GitHub via the `gh` CLI.
 *   2. Resolve (or create) a conversation session for this issue number.
 *      - New issue  → create a fresh session; record the mapping in state/.
 *      - Follow-up  → load the existing session file for conversation context.
 *   3. Build a prompt string from the event payload.
 *   4. Run the `openclaw agent` CLI command with the prompt (using --local for
 *      embedded execution, --json for structured output).
 *   5. Extract the assistant's final text reply from the JSON output.
 *   6. Persist the issue → session mapping so the next run can resume.
 *   7. Stage, commit, and push all changes (session log, mapping, repo edits)
 *      back to the default branch with an automatic retry-on-conflict loop.
 *   8. Post the extracted reply as a new comment on the originating issue.
 *   9. [finally] Remove the 👀 reaction that `GITOPENCLAW-INDICATOR.ts` added,
 *      guaranteeing cleanup even if the agent threw an unhandled error.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SESSION CONTINUITY
 * ─────────────────────────────────────────────────────────────────────────────
 * GitOpenClaw maintains per-issue session state in:
 *   .GITOPENCLAW/state/issues/<number>.json   — maps issue # → session ID
 *   .GITOPENCLAW/state/sessions/<id>.jsonl    — the session transcript
 *
 * On every run the agent checks for an existing mapping.  If the mapped session
 * file is still present, the run "resumes" by passing `--session-id <id>` to
 * OpenClaw, giving the agent full memory of all prior exchanges for that issue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PUSH CONFLICT RESOLUTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Multiple agents may race to push to the same branch.  To handle this gracefully
 * the script retries a failed `git push` up to 3 times, pulling with `--rebase`
 * between attempts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GITHUB COMMENT SIZE LIMIT
 * ─────────────────────────────────────────────────────────────────────────────
 * GitHub enforces a ~65 535 character limit on issue comments.  The agent reply
 * is capped at 60 000 characters to leave a comfortable safety margin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEPENDENCIES
 * ─────────────────────────────────────────────────────────────────────────────
 * - Node.js built-in `fs` module  (existsSync, readFileSync, writeFileSync, mkdirSync)
 * - Node.js built-in `path` module (resolve)
 * - GitHub CLI (`gh`)             — must be authenticated via GITHUB_TOKEN
 * - `openclaw` binary             — installed by `bun install` from package.json
 * - System tools: `git`, `bash`
 * - Bun runtime                   — for Bun.spawn and top-level await
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

// ─── Paths and event context ───────────────────────────────────────────────────
// `import.meta.dir` resolves to `.GITOPENCLAW/lifecycle/`; stepping up one level
// gives us the `.GITOPENCLAW/` directory which contains `state/` and `node_modules/`.
const gitopenclawDir = resolve(import.meta.dir, "..");
const stateDir = resolve(gitopenclawDir, "state");
const issuesDir = resolve(stateDir, "issues");
const sessionsDir = resolve(stateDir, "sessions");
const settingsPath = resolve(gitopenclawDir, "config", "settings.json");

// The sessions directory as a relative path from repo root.
const sessionsDirRelative = ".GITOPENCLAW/state/sessions";

// GitHub enforces a ~65 535 character limit on issue comments; cap at 60 000
// characters to leave a comfortable safety margin and avoid API rejections.
const MAX_COMMENT_LENGTH = 60000;

// Maximum time (in ms) to wait for the agent process to produce output.
// If the agent does not close stdout within this window, both the agent and
// the `tee` helper are forcefully killed.  5 minutes is generous enough to
// cover large prompts while still surfacing hangs quickly.
const AGENT_TIMEOUT_MS = 5 * 60 * 1000;

// After the agent's stdout closes (output fully captured), we give the
// process a short grace period to exit on its own before killing it.
// This prevents the script from hanging when the agent keeps running after
// writing its response (the exact symptom reported in the issue).
const AGENT_EXIT_GRACE_MS = 10_000;

// Parse the full GitHub Actions event payload (contains issue/comment details).
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, "utf-8"));

// "issues" for new issues, "issue_comment" for replies on existing issues.
const eventName = process.env.GITHUB_EVENT_NAME!;

// "owner/repo" format — used when calling the GitHub REST API via `gh api`.
const repo = process.env.GITHUB_REPOSITORY!;

// Fall back to "main" if the repository's default branch is not set in the event.
const defaultBranch = event.repository?.default_branch ?? "main";

// The issue number is present on both the `issues` and `issue_comment` payloads.
const issueNumber: number = event.issue.number;

// Read the committed config defaults and pass them explicitly to the runtime.
// This prevents provider/model drift from host-level config.
const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
const configuredProvider: string = settings.defaultProvider;
const configuredModel: string = settings.defaultModel;
const configuredThinkingLevel: string = settings.defaultThinkingLevel ?? "high";

if (!configuredProvider || !configuredModel) {
  throw new Error(
    `Invalid settings at ${settingsPath}: expected defaultProvider and defaultModel`
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Spawn an arbitrary subprocess, capture its stdout, and return both the
 * trimmed output and the process exit code.
 *
 * @param cmd  - Command and arguments array (e.g. ["git", "push", "origin", "main"]).
 * @param opts - Optional options; `stdin` can be piped from another process.
 * @returns    - `{ exitCode, stdout }` after the process has exited.
 */
async function run(cmd: string[], opts?: { stdin?: any }): Promise<{ exitCode: number; stdout: string }> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "inherit",   // surface errors directly in the Actions log
    stdin: opts?.stdin,
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout: stdout.trim() };
}

/**
 * Convenience wrapper: run `gh <args>` and return trimmed stdout.
 * Uses the `run` helper above so that `gh` errors appear in the Actions log.
 * Throws on non-zero exit codes to fail fast on API errors.
 */
async function gh(...args: string[]): Promise<string> {
  const { exitCode, stdout } = await run(["gh", ...args]);
  if (exitCode !== 0) {
    throw new Error(`gh ${args[0]} failed with exit code ${exitCode}`);
  }
  return stdout;
}

// ─── Restore reaction state from GITOPENCLAW-INDICATOR.ts ────────────────────
// `GITOPENCLAW-INDICATOR.ts` runs before dependency installation and writes the 👀
// reaction metadata to `/tmp/reaction-state.json`.  We read it here so the
// `finally` block can delete the reaction when the agent finishes (or errors).
// If the file is absent (e.g., indicator step was skipped), we default to null.
const reactionState = existsSync("/tmp/reaction-state.json")
  ? JSON.parse(readFileSync("/tmp/reaction-state.json", "utf-8"))
  : null;

try {
  // ── Fetch issue title and body ───────────────────────────────────────────────
  // We always fetch the issue content from the API rather than relying solely on
  // the event payload, because the payload body can be truncated for very long issues.
  const title = await gh("issue", "view", String(issueNumber), "--json", "title", "--jq", ".title");
  const body = await gh("issue", "view", String(issueNumber), "--json", "body", "--jq", ".body");

  // ── Resolve or create session mapping ───────────────────────────────────────
  // Each issue maps to exactly one session via `state/issues/<n>.json`.
  // If a mapping exists AND the referenced session file is still present, we resume
  // the conversation by passing `--session-id <id>` to OpenClaw.  Otherwise we start fresh.
  mkdirSync(issuesDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });

  let mode = "new";
  let sessionId = "";
  const mappingFile = resolve(issuesDir, `${issueNumber}.json`);

  if (existsSync(mappingFile)) {
    const mapping = JSON.parse(readFileSync(mappingFile, "utf-8"));
    if (mapping.sessionId) {
      // A prior session exists — resume it to preserve conversation context.
      mode = "resume";
      sessionId = mapping.sessionId;
      console.log(`Found existing session: ${sessionId}`);
    } else if (mapping.sessionPath && existsSync(mapping.sessionPath)) {
      // Backward compatibility: check for file-based session paths.
      mode = "resume";
      sessionId = mapping.sessionId || mapping.sessionPath;
      console.log(`Found existing session (path): ${sessionId}`);
    } else {
      // The mapping points to a session that no longer exists (e.g., cleaned up).
      console.log("Mapped session missing, starting fresh");
    }
  } else {
    console.log("No session mapping found, starting fresh");
  }

  // ── Configure git identity ───────────────────────────────────────────────────
  // Set the bot identity for all git commits made during this run.
  await run(["git", "config", "user.name", "gitopenclaw[bot]"]);
  await run(["git", "config", "user.email", "gitopenclaw[bot]@users.noreply.github.com"]);

  // ── Build prompt from event context ─────────────────────────────────────────
  // For `issue_comment` events, use the new comment body as the full prompt so
  // that follow-up instructions reach the agent verbatim.
  // For `issues` (opened) events, combine the title and body for full context.
  let prompt: string;
  if (eventName === "issue_comment") {
    prompt = event.comment.body;
  } else {
    prompt = `${title}\n\n${body}`;
  }

  // ── Validate provider API key ────────────────────────────────────────────────
  // This check is inside the try block so that the finally clause always runs
  // (removing the 👀 reaction) and a helpful comment can be posted to the issue.
  const providerKeyMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
  };
  const requiredKeyName = providerKeyMap[configuredProvider];
  if (requiredKeyName && !process.env[requiredKeyName]) {
    await gh(
      "issue", "comment", String(issueNumber),
      "--body",
      `## ⚠️ Missing API Key: \`${requiredKeyName}\`\n\n` +
      `The configured provider is \`${configuredProvider}\`, but the \`${requiredKeyName}\` secret is not available to this workflow run.\n\n` +
      `### How to fix\n\n` +
      `**Option A — Repository secret** _(simplest)_\n` +
      `1. Go to **Settings → Secrets and variables → Actions → New repository secret**\n` +
      `2. Name: \`${requiredKeyName}\`, Value: your API key\n\n` +
      `**Option B — Organization secret** _(already have one?)_\n` +
      `Organization secrets are only available to workflows if the secret has been explicitly granted to this repository:\n` +
      `1. Go to your **Organization Settings → Secrets and variables → Actions**\n` +
      `2. Click the \`${requiredKeyName}\` secret → **Repository access**\n` +
      `3. Add **this repository** to the selected repositories list\n\n` +
      `Once the secret is accessible, re-trigger this workflow by posting a new comment on this issue.`
    );
    throw new Error(
      `${requiredKeyName} is not available to this workflow run. ` +
      `If you have set it as a repository secret, verify the secret name matches exactly. ` +
      `If you have set it as an organization secret, ensure this repository has been granted access ` +
      `(Organization Settings → Secrets and variables → Actions → ${requiredKeyName} → Repository access).`
    );
  }

  // ── Run the OpenClaw agent (Approach A: CLI invocation) ─────────────────────
  // Use `openclaw agent --local` for embedded execution without a Gateway.
  // The --json flag provides structured output for response extraction.
  const openclawBin = resolve(gitopenclawDir, "node_modules", ".bin", "openclaw");
  const openclawArgs = [
    openclawBin,
    "agent",
    "--local",
    "--json",
    "--message",
    prompt,
    "--thinking",
    configuredThinkingLevel,
  ];
  // Always pass a session ID so the agent can route the conversation.
  // For resumed sessions use the prior ID; for new issues use a stable
  // identifier derived from the issue number.
  const resolvedSessionId = sessionId || `issue-${issueNumber}`;
  openclawArgs.push("--session-id", resolvedSessionId);

  // Pipe agent output through `tee` so we get:
  //   • a live stream to stdout (visible in the Actions log in real time), and
  //   • a persisted copy at `/tmp/agent-raw.json` for post-processing below.
  const agent = Bun.spawn(openclawArgs, { stdout: "pipe", stderr: "inherit" });
  const tee = Bun.spawn(["tee", "/tmp/agent-raw.json"], { stdin: agent.stdout, stdout: "inherit" });

  // ── Timeout-aware wait for output capture ──────────────────────────────────
  // `tee` exits when the agent's stdout closes (EOF).  If the agent never
  // closes stdout the race timeout fires, and we kill both processes.
  let agentTimedOut = false;
  let agentTimerId: ReturnType<typeof setTimeout> | undefined;

  const teeResult = await Promise.race([
    tee.exited.then(() => "done" as const),
    new Promise<"timeout">((resolve) => {
      agentTimerId = setTimeout(() => resolve("timeout"), AGENT_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(agentTimerId);

  if (teeResult === "timeout") {
    agentTimedOut = true;
    console.error(`Agent timed out after ${AGENT_TIMEOUT_MS / 1000}s — killing processes`);
    agent.kill();
    tee.kill();
    await Promise.allSettled([agent.exited, tee.exited]);
  }

  // ── Grace period: wait for the agent process to exit ───────────────────────
  // After `tee` exits the output has been fully captured to disk.  Give the
  // agent a short window to exit on its own; if it doesn't, kill it so the
  // script can continue with posting the reply and pushing state.
  if (!agentTimedOut) {
    let graceTimerId: ReturnType<typeof setTimeout> | undefined;
    const graceResult = await Promise.race([
      agent.exited.then(() => "exited" as const),
      new Promise<"timeout">((resolve) => {
        graceTimerId = setTimeout(() => resolve("timeout"), AGENT_EXIT_GRACE_MS);
      }),
    ]);
    clearTimeout(graceTimerId);

    if (graceResult === "timeout") {
      console.log("Agent process did not exit after output was captured — killing it");
      agent.kill();
      await agent.exited;
    }
  }

  // Check the exit code.  SIGTERM (143 = 128 + 15) is expected when we
  // killed the process ourselves after the grace period — treat it as success.
  const agentExitCode = await agent.exited;
  if (agentExitCode !== 0 && agentExitCode !== 143) {
    throw new Error(`openclaw agent exited with code ${agentExitCode}. Check the workflow logs above for details.`);
  }

  // ── Extract final assistant text ─────────────────────────────────────────────
  // The `openclaw agent --json` command outputs a JSON envelope with a `payloads`
  // array containing the response text. Extract the text from the first payload.
  let agentText = "";
  try {
    const rawOutput = readFileSync("/tmp/agent-raw.json", "utf-8").trim();
    if (rawOutput) {
      const output = JSON.parse(rawOutput);
      if (output.payloads && Array.isArray(output.payloads)) {
        agentText = output.payloads
          .map((p: { text?: string }) => p.text || "")
          .filter((t: string) => t.length > 0)
          .join("\n\n");
      } else if (typeof output.text === "string") {
        agentText = output.text;
      } else if (typeof output === "string") {
        agentText = output;
      }
    }
  } catch {
    // If JSON parsing fails, try reading the raw output as plain text.
    const rawOutput = readFileSync("/tmp/agent-raw.json", "utf-8").trim();
    agentText = rawOutput;
  }

  // ── Persist issue → session mapping ─────────────────────────────────────────
  // Write (or overwrite) the mapping file so that the next run for this issue
  // can locate the correct session and resume the conversation.
  writeFileSync(
    mappingFile,
    JSON.stringify({
      issueNumber,
      sessionId: resolvedSessionId,
      updatedAt: new Date().toISOString(),
    }, null, 2) + "\n"
  );
  console.log(`Saved mapping: issue #${issueNumber} -> ${resolvedSessionId}`);

  // ── Commit and push state changes ───────────────────────────────────────────
  // Stage all changes (session log, mapping JSON, any files the agent edited),
  // commit only if the index is dirty, then push with a retry-on-conflict loop.
  await run(["git", "add", "-A"]);
  const { exitCode } = await run(["git", "diff", "--cached", "--quiet"]);
  if (exitCode !== 0) {
    // exitCode !== 0 means there are staged changes to commit.
    await run(["git", "commit", "-m", `gitopenclaw: work on issue #${issueNumber}`]);
  }

  // Retry push up to 3 times, rebasing on each conflict to avoid force-pushing.
  for (let i = 1; i <= 3; i++) {
    const push = await run(["git", "push", "origin", `HEAD:${defaultBranch}`]);
    if (push.exitCode === 0) break;
    console.log(`Push failed, rebasing and retrying (${i}/3)...`);
    await run(["git", "pull", "--rebase", "origin", defaultBranch]);
  }

  // ── Post reply as issue comment ──────────────────────────────────────────────
  // Guard against empty/null responses — post an error message instead of silence.
  const trimmedText = agentText.trim();
  const commentBody = trimmedText.length > 0
    ? trimmedText.slice(0, MAX_COMMENT_LENGTH)
    : `✅ The agent ran successfully but did not produce a text response. Check the repository for any file changes that were made.\n\nFor full details, see the [workflow run logs](https://github.com/${repo}/actions).`;
  await gh("issue", "comment", String(issueNumber), "--body", commentBody);

} finally {
  // ── Guaranteed cleanup: remove 👀 reaction ───────────────────────────────────
  // This block always executes — even when the try block throws — ensuring the
  // 👀 activity indicator is always removed so users know the agent has stopped.
  if (reactionState?.reactionId) {
    try {
      const { reactionId, reactionTarget, commentId } = reactionState;
      if (reactionTarget === "comment" && commentId) {
        // Delete the reaction from the triggering comment.
        await gh("api", `repos/${repo}/issues/comments/${commentId}/reactions/${reactionId}`, "-X", "DELETE");
      } else {
        // Delete the reaction from the issue itself.
        await gh("api", `repos/${repo}/issues/${issueNumber}/reactions/${reactionId}`, "-X", "DELETE");
      }
    } catch (e) {
      // Log but do not re-throw — a failed cleanup should not mask the original error.
      console.error("Failed to remove reaction:", e);
    }
  }
}
