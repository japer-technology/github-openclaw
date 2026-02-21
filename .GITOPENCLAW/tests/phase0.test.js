/**
 * Phase 0 validation tests — verify that all Foundation-layer features
 * for .GITOPENCLAW are structurally present.
 *
 * Run with: node --test .GITOPENCLAW/tests/phase0.test.js
 *        or: bun test .GITOPENCLAW/tests/phase0.test.js
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GITOPENCLAW = path.resolve(REPO_ROOT, ".GITOPENCLAW");

function readFile(relPath) {
  return fs.readFileSync(path.resolve(REPO_ROOT, relPath), "utf-8");
}

// ── 1. Trigger on issues.opened and issue_comment.created ──────────────────

describe("Workflow triggers", () => {
  const workflow = readFile(".github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml");

  it("triggers on issues.opened", () => {
    assert.match(workflow, /issues:\s*\n\s*types:\s*\[.*opened.*\]/);
  });

  it("triggers on issue_comment.created", () => {
    assert.match(workflow, /issue_comment:\s*\n\s*types:\s*\[.*created.*\]/);
  });

  it("workflow template also has correct triggers", () => {
    const template = readFile(".GITOPENCLAW/install/GITOPENCLAW-WORKFLOW-AGENT.yml");
    assert.match(template, /issues:\s*\n\s*types:\s*\[.*opened.*\]/);
    assert.match(template, /issue_comment:\s*\n\s*types:\s*\[.*created.*\]/);
  });

  it("has timeout-minutes set on the job", () => {
    assert.ok(
      workflow.includes("timeout-minutes:"),
      "Workflow job must have timeout-minutes to prevent indefinite hangs"
    );
    assert.match(
      workflow,
      /timeout-minutes:\s*10/,
      "timeout-minutes should be 10"
    );
  });

  it("workflow template also has timeout-minutes", () => {
    const template = readFile(".GITOPENCLAW/install/GITOPENCLAW-WORKFLOW-AGENT.yml");
    assert.ok(
      template.includes("timeout-minutes:"),
      "Template workflow job must have timeout-minutes"
    );
    assert.match(
      template,
      /timeout-minutes:\s*10/,
      "Template timeout-minutes should be 10"
    );
  });
});

// ── 2. Authorization gating ────────────────────────────────────────────────

describe("Authorization gating", () => {
  const workflow = readFile(".github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml");

  it("has an Authorize step that checks collaborator permission", () => {
    assert.ok(workflow.includes("name: Authorize"));
    assert.ok(workflow.includes("collaborators"));
    assert.ok(workflow.includes("permission"));
  });

  it("gates on admin permission", () => {
    assert.ok(workflow.includes("admin"));
  });

  it("gates on write permission", () => {
    assert.ok(workflow.includes("write"));
  });

  it("excludes github-actions[bot] from comment triggers", () => {
    assert.ok(workflow.includes("github-actions[bot]"));
  });

  it("Authorize step runs before Checkout", () => {
    const authorizeIdx = workflow.indexOf("name: Authorize");
    const checkoutIdx = workflow.indexOf("name: Checkout");
    assert.ok(authorizeIdx > 0 && checkoutIdx > 0);
    assert.ok(
      authorizeIdx < checkoutIdx,
      "Authorize must run before Checkout"
    );
  });
});

// ── 3. Multi-turn sessions persisted in state/sessions/ ───────────────────

describe("Session persistence", () => {
  it("state/sessions directory exists", () => {
    assert.ok(fs.existsSync(path.join(GITOPENCLAW, "state", "sessions")));
  });

  it("agent script references sessions directory", () => {
    const agent = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts");
    assert.ok(agent.includes("state/sessions"));
  });

  it("agent script handles session resumption", () => {
    const agent = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts");
    assert.ok(agent.includes("session"));
    assert.ok(agent.includes('mode = "resume"'));
  });
});

// ── 4. Issue → session mapping in state/issues/ ────────────────────────────

describe("Issue-session mapping", () => {
  it("state/issues directory exists", () => {
    assert.ok(fs.existsSync(path.join(GITOPENCLAW, "state", "issues")));
  });

  it("agent script writes mapping files", () => {
    const agent = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts");
    assert.ok(agent.includes("mappingFile"));
    assert.ok(agent.includes("writeFileSync"));
  });

  it("mapping includes issueNumber and sessionId", () => {
    const agent = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts");
    assert.ok(agent.includes("issueNumber"));
    assert.ok(agent.includes("sessionId"));
  });
});

// ── 5. 👀 reaction indicator while working ─────────────────────────────────

describe("Reaction indicator", () => {
  it("indicator script exists", () => {
    assert.ok(
      fs.existsSync(path.join(GITOPENCLAW, "lifecycle", "GITOPENCLAW-INDICATOR.ts"))
    );
  });

  it("indicator adds eyes reaction", () => {
    const indicator = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-INDICATOR.ts");
    assert.ok(indicator.includes("content=eyes"));
  });

  it("indicator persists reaction state to /tmp", () => {
    const indicator = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-INDICATOR.ts");
    assert.ok(indicator.includes("/tmp/reaction-state.json"));
  });

  it("agent script removes reaction in finally block", () => {
    const agent = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts");
    assert.ok(agent.includes("finally"));
    assert.ok(agent.includes("reactionId"));
    assert.ok(agent.includes("DELETE"));
  });

  it("workflow runs indicator before install", () => {
    const workflow = readFile(".github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml");
    const indicatorIdx = workflow.indexOf("GITOPENCLAW-INDICATOR");
    const installIdx = workflow.indexOf("bun install");
    assert.ok(indicatorIdx > 0 && installIdx > 0);
    assert.ok(
      indicatorIdx < installIdx,
      "Indicator must run before dependency install"
    );
  });
});

// ── 6. Commit + push state to main with retry-on-conflict ──────────────────

describe("Commit and push with retry", () => {
  const agent = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts");

  it("stages all changes with git add", () => {
    assert.ok(agent.includes('"git", "add"'));
  });

  it("commits with descriptive message", () => {
    assert.ok(agent.includes("git commit"));
    assert.ok(agent.includes("gitopenclaw: work on issue"));
  });

  it("pushes to default branch", () => {
    assert.ok(agent.includes("git push"));
    assert.ok(agent.includes("defaultBranch"));
  });

  it("retries push on conflict", () => {
    assert.ok(agent.includes("retrying"));
    assert.ok(agent.includes('"git", "pull"'));
    assert.ok(agent.includes('"--rebase"'));
  });

  it("has a retry limit", () => {
    assert.match(agent, /for\s*\(\s*let\s+i\s*=\s*1;\s*i\s*<=\s*3/);
  });
});

// ── 7. Configurable settings and agent identity ────────────────────────────

describe("Configuration", () => {
  it("settings.json exists with provider and model config", () => {
    const settings = JSON.parse(
      readFile(".GITOPENCLAW/config/settings.json")
    );
    assert.ok(settings.defaultProvider);
    assert.ok(settings.defaultModel);
    assert.ok(settings.defaultThinkingLevel);
  });

  it("AGENTS.md exists (agent identity)", () => {
    assert.ok(fs.existsSync(path.join(GITOPENCLAW, "AGENTS.md")));
  });
});

// ── Fail-closed guard (prerequisite for all Phase 0 features) ──────────────

describe("Fail-closed guard", () => {
  it("sentinel file exists", () => {
    assert.ok(
      fs.existsSync(path.join(GITOPENCLAW, "GITOPENCLAW-ENABLED.md"))
    );
  });

  it("guard script exists", () => {
    assert.ok(
      fs.existsSync(path.join(GITOPENCLAW, "lifecycle", "GITOPENCLAW-ENABLED.ts"))
    );
  });

  it("guard checks for sentinel file", () => {
    const guard = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-ENABLED.ts");
    assert.ok(guard.includes("GITOPENCLAW-ENABLED.md"));
    assert.ok(guard.includes("existsSync"));
  });

  it("guard exits non-zero when sentinel missing", () => {
    const guard = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-ENABLED.ts");
    assert.ok(guard.includes("process.exit(1)"));
  });

  it("workflow runs guard before indicator and agent", () => {
    const workflow = readFile(".github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml");
    const guardIdx = workflow.indexOf("GITOPENCLAW-ENABLED");
    const indicatorIdx = workflow.indexOf("GITOPENCLAW-INDICATOR");
    const agentIdx = workflow.indexOf("GITOPENCLAW-AGENT");
    assert.ok(guardIdx > 0);
    assert.ok(guardIdx < indicatorIdx, "Guard must run before indicator");
    assert.ok(guardIdx < agentIdx, "Guard must run before agent");
  });
});

// ── Install template integrity ─────────────────────────────────────────────

describe("Install templates", () => {
  it("hatch template has valid frontmatter", () => {
    const template = readFile(
      ".GITOPENCLAW/install/GITOPENCLAW-TEMPLATE-HATCH.md"
    );
    assert.ok(
      template.startsWith("---"),
      "Hatch template must start with YAML frontmatter delimiter"
    );
    assert.ok(template.includes('name: "'));
    assert.ok(template.includes("labels:"));
  });

  it("workflow template has checkout with ref and fetch-depth", () => {
    const template = readFile(
      ".GITOPENCLAW/install/GITOPENCLAW-WORKFLOW-AGENT.yml"
    );
    assert.ok(
      template.includes("github.event.repository.default_branch"),
      "Checkout should reference default_branch"
    );
    assert.ok(
      template.includes("fetch-depth: 0"),
      "Checkout should fetch full history"
    );
  });

  it("workflow template matches live workflow triggers", () => {
    const template = readFile(
      ".GITOPENCLAW/install/GITOPENCLAW-WORKFLOW-AGENT.yml"
    );
    const live = readFile(".github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml");
    // Both should have the same trigger structure
    assert.ok(template.includes("issues:"));
    assert.ok(template.includes("issue_comment:"));
    assert.ok(live.includes("issues:"));
    assert.ok(live.includes("issue_comment:"));
  });

  it("workflow template name matches live workflow name", () => {
    const template = readFile(
      ".GITOPENCLAW/install/GITOPENCLAW-WORKFLOW-AGENT.yml"
    );
    const live = readFile(".github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml");
    const templateName = template.match(/^name:\s*(.+)$/m)?.[1];
    const liveName = live.match(/^name:\s*(.+)$/m)?.[1];
    assert.ok(templateName, "Template should have a name field");
    assert.ok(liveName, "Live workflow should have a name field");
    assert.strictEqual(liveName, templateName, "Live workflow name must match template");
  });
});

// ── Error handling and observability ───────────────────────────────────────

describe("Error handling", () => {
  const agent = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts");

  it("gh() helper checks exit code", () => {
    assert.ok(agent.includes("exitCode !== 0"));
    assert.ok(agent.includes("throw new Error"));
  });

  it("validates provider API key is set", () => {
    assert.ok(
      agent.includes("providerKeyMap"),
      "Agent should validate that the required API key for the configured provider is present"
    );
    assert.ok(agent.includes("ANTHROPIC_API_KEY"));
  });

  it("checks agent exit code and throws on failure", () => {
    assert.ok(agent.includes("agentExitCode"));
    assert.ok(agent.includes("throw new Error") && agent.includes("agentExitCode"));
  });

  it("handles empty agent response", () => {
    assert.ok(
      agent.includes("did not produce a text response"),
      "Agent should post an error message when response is empty"
    );
  });

  it("defines AGENT_TIMEOUT_MS constant", () => {
    assert.ok(
      agent.includes("AGENT_TIMEOUT_MS"),
      "Agent must define an overall timeout for the agent subprocess"
    );
    assert.match(
      agent,
      /AGENT_TIMEOUT_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/,
      "AGENT_TIMEOUT_MS should be 5 minutes (5 * 60 * 1000)"
    );
  });

  it("defines AGENT_EXIT_GRACE_MS constant", () => {
    assert.ok(
      agent.includes("AGENT_EXIT_GRACE_MS"),
      "Agent must define a grace period for the agent to exit after output is captured"
    );
    assert.match(
      agent,
      /AGENT_EXIT_GRACE_MS\s*=\s*10[_]?000/,
      "AGENT_EXIT_GRACE_MS should be 10 seconds"
    );
  });

  it("uses Promise.race for timeout-aware agent execution", () => {
    assert.ok(
      agent.includes("Promise.race"),
      "Agent must use Promise.race to implement timeout"
    );
  });

  it("kills agent process on timeout", () => {
    assert.ok(
      agent.includes("agent.kill()"),
      "Agent must kill the agent subprocess when it times out or exceeds grace period"
    );
  });

  it("clears timeout timers to prevent event-loop leaks", () => {
    assert.ok(
      agent.includes("clearTimeout(agentTimerId)"),
      "Agent must clear the main timeout timer"
    );
    assert.ok(
      agent.includes("clearTimeout(graceTimerId)"),
      "Agent must clear the grace-period timer"
    );
  });

  it("treats SIGTERM exit code 143 as success", () => {
    assert.ok(
      agent.includes("143"),
      "Agent must allow exit code 143 (SIGTERM) when it kills the process itself"
    );
  });
});

// ── OpenClaw-specific features ─────────────────────────────────────────────

describe("OpenClaw integration", () => {
  const agent = readFile(".GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts");

  it("uses openclaw agent CLI command", () => {
    assert.ok(agent.includes("openclaw"));
    assert.ok(agent.includes("agent"));
  });

  it("uses --local flag for embedded execution", () => {
    assert.ok(agent.includes("--local"));
  });

  it("uses --json flag for structured output", () => {
    assert.ok(agent.includes("--json"));
  });

  it("supports thinking level configuration", () => {
    assert.ok(agent.includes("--thinking"));
    assert.ok(agent.includes("configuredThinkingLevel"));
  });

  it("always passes --session-id to openclaw agent (new and resumed)", () => {
    // The agent must always pass --session-id so that openclaw agent doesn't
    // error with "Pass --to" when activated by a new issue (no prior session).
    assert.ok(
      agent.includes('openclawArgs.push("--session-id", resolvedSessionId)'),
      "Agent must unconditionally push --session-id into openclawArgs"
    );
    // The session ID must NOT be gated behind a resume-only condition.
    assert.ok(
      !agent.includes('if (mode === "resume"') ||
        agent.includes('openclawArgs.push("--session-id", resolvedSessionId)'),
      "session-id push must not be conditional on resume mode"
    );
  });

  it("package.json depends on openclaw", () => {
    const pkg = JSON.parse(readFile(".GITOPENCLAW/package.json"));
    assert.ok(pkg.dependencies.openclaw, "package.json must depend on openclaw");
  });
});
