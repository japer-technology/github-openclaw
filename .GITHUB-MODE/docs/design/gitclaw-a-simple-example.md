# Deep Analysis: How `japer-technology/gitclaw` Works End-to-End

This document explains the full execution path of the japer-technology/gitclaw repository’s issue-driven AI agent pipeline: what triggers it, how it manages conversation memory, how it posts replies, and how it persists state back to git.

---

## 1) High-level architecture

`gitclaw` is a GitHub Actions-native agent wrapper around the `pi` coding agent CLI.

At a high level:

1. A GitHub issue is opened, or a comment is added to an issue.
2. A workflow job runs on `ubuntu-latest`.
3. A preinstall script adds an � reaction to indicate “working”.
4. The main script:
   - fetches issue data,
   - resolves whether to resume an existing session or start a new one,
   - runs `pi` in JSON streaming mode,
   - extracts the final assistant text,
   - commits any repo changes (including memory/session files),
   - pushes to `main`,
   - comments the assistant output back to the issue.
5. A final cleanup step removes the � reaction.

The repository itself is used as durable state storage (`state/issues` and `state/sessions`), which gives the agent long-term memory through committed session logs.

---

## 2) Triggering and access control

Workflow file: `.github/workflows/agent.yml`

### Events
The workflow triggers on:

- `issues` with type `opened`
- `issue_comment` with type `created`

This means:
- Opening a new issue starts a new agent interaction.
- Adding a new comment resumes/continues the issue’s conversation context.

### Authorization gating
The job has an `if:` condition that only allows:

- Issue opener must have association in: `OWNER`, `MEMBER`, or `COLLABORATOR`.
- Issue comments must be from non-`github-actions[bot]` users and also one of `OWNER`, `MEMBER`, `COLLABORATOR`.

Effectively, random outsiders on a public repository cannot trigger the agent pipeline.

### Permissions
Workflow token permissions are:

- `contents: write` (commit/push changes)
- `issues: write` (post comments/reactions)
- `actions: write`

---

## 3) Runtime boot sequence inside Actions

Job steps are intentionally ordered:

1. **Checkout** (`actions/checkout@v4`)
2. **Setup Bun** (`oven-sh/setup-bun@v2`)
3. **Preinstall** (`bun lifecycle/preinstall.ts`)
4. **Install dependencies** (`bun install --frozen-lockfile`)
5. **Run main logic** (`bun lifecycle/main.ts`)

Notably, preinstall runs before dependency installation to immediately signal activity via reaction.

---

## 4) Preinstall script: signaling “in progress”

File: `lifecycle/preinstall.ts`

### Inputs read from GitHub Actions env
- `GITHUB_EVENT_PATH` → JSON payload path for the triggering event.
- `GITHUB_EVENT_NAME` → either `issues` or `issue_comment`.
- `GITHUB_REPOSITORY` → `owner/repo` slug.

### Behavior
- Parses the event payload.
- Determines issue number and whether event is comment-driven.
- Uses `gh api` to create an `eyes` reaction:
  - On issue comment events: reaction is placed on the specific comment.
  - On issue open events: reaction is placed on the issue itself.
- Catches/logs errors but does not hard-fail workflow.

### Cross-step state handoff
Writes `/tmp/reaction-state.json` containing:

- `reactionId`
- `reactionTarget` (`comment` or `issue`)
- `commentId` (if applicable)
- `issueNumber`
- `repo`

This temp file is consumed later by `main.ts` for cleanup in a `finally` block.

---

## 5) Main script: full orchestration

File: `lifecycle/main.ts`

This is the core orchestrator.

### 5.1 Event/context initialization
Reads the same environment payloads and computes `issueNumber` from `event.issue.number`.

Defines helper wrappers:

- `run(cmd, opts?)` for spawning subprocesses with stdout capture.
- `gh(...args)` thin wrapper around `run(["gh", ...args])`.

### 5.2 Restore reaction cleanup context
If `/tmp/reaction-state.json` exists, parse it. This allows robust reaction cleanup even if downstream operations fail.

### 5.3 Fetch issue title/body
Runs:
- `gh issue view <issue> --json title --jq .title`
- `gh issue view <issue> --json body --jq .body`

These are used to build the initial prompt for issue-open events.

### 5.4 Session persistence model
Creates storage dirs if needed:

- `state/issues`
- `state/sessions`

Uses mapping file:

- `state/issues/<issueNumber>.json`

The mapping points each issue number to its latest `pi` session file path.

#### Resume/new resolution
- If mapping exists and mapped session file exists → mode `resume`, reuse session path.
- Otherwise → mode `new`.

This enables issue-thread continuity over time and across workflow runs.

### 5.5 Git identity setup
Configures bot git identity at runtime:

- `git config user.name gitclaw[bot]`
- `git config user.email gitclaw[bot]@users.noreply.github.com`

### 5.6 Prompt selection
- For `issue_comment`: prompt is `event.comment.body` (latest user message).
- For `issues` opened: prompt is `"<title>\n\n<body>"`.

### 5.7 Running `pi` agent
Constructs command:

- `bunx pi --mode json --session-dir ./state/sessions -p <prompt>`
- plus `--session <existing-path>` in resume mode.

Execution model:

1. Spawn `pi` with stdout piped.
2. Pipe through `tee /tmp/agent-raw.jsonl` so output is both visible and persisted.

### 5.8 Extracting the final assistant text
Post-processes `/tmp/agent-raw.jsonl` by:

- `tac` (reverse lines)
- `jq` expression that selects most recent `message_end` and then text segments from `message.content`

Result is `agentText`, the plain text body used for issue commenting.

### 5.9 Determine latest session file
Uses shell listing:

- `ls -t state/sessions/*.jsonl | head -1`

Stores that path into the issue mapping file with timestamp.

Mapping shape:

```json
{
  "issueNumber": 123,
  "sessionPath": "state/sessions/<session>.jsonl",
  "updatedAt": "<ISO timestamp>"
}
```

### 5.10 Commit and push state changes
- `git add -A`
- checks if staged diff exists via `git diff --cached --quiet`
- if changes exist: commit message `gitclaw: work on issue #<n>`

Push strategy:

- Try `git push origin main`
- On failure, retry up to 3x with `git pull --rebase origin main` between attempts.

This is a pragmatic conflict-handling loop for concurrent workflow runs.

### 5.11 Comment back to issue
Posts `agentText` (trimmed to 60,000 chars) via:

- `gh issue comment <issue> --body <commentBody>`

This is the visible assistant response for the user.

### 5.12 Guaranteed cleanup (`finally`)
Always attempts to remove the earlier � reaction.

- Deletes from comment reaction endpoint if target is comment.
- Otherwise deletes from issue reaction endpoint.

Errors here are logged and swallowed so cleanup failures don’t crash the pipeline.

---

## 6) Data model and memory semantics

As described in README, state is git-backed:

- `state/issues/<n>.json`: pointer from issue number to latest session file.
- `state/sessions/*.jsonl`: full serialized conversation log for `pi`.

### Implications
- **Long-term memory**: persisted across runs because sessions are committed.
- **Auditability**: every conversation evolution is versioned in git history.
- **Resumability**: issue comments continue same session via mapping lookup.

This is intentionally “repo-as-database” with low operational overhead.

---

## 7) Why this design works well

### Strengths
- **Zero server infra**: only GitHub Actions + repo storage.
- **Simple auth model**: relies on GitHub association and token scopes.
- **Deterministic orchestration**: explicit step sequence and CLI tooling.
- **Built-in observability**: workflow logs + committed session artifacts.

### Tradeoffs / limitations
- **Latency** tied to Actions startup and runtime.
- **Storage growth** as session logs accumulate.
- **Branch assumption** hardcoded to push/pull `main` in `main.ts`.
- **Output extraction fragility** depends on expected `pi` JSON schema and `jq` query shape.

---

## 8) Failure paths and resilience

- Reaction add/remove failures are non-fatal (try/catch).
- Push conflicts are mitigated with rebase retry loop.
- Missing session mapping gracefully falls back to new session.
- Missing mapped session file also falls back to new session.

Potential hard failures would come from:
- absent `ANTHROPIC_API_KEY`,
- malformed or incompatible `pi` output schema,
- fatal `gh` CLI failures for issue fetch/comment,
- persistent git push failures after retries.

---

## 9) Dependency/runtime stack

- Runtime: **Bun**
- Agent: `@mariozechner/pi-coding-agent` (invoked via `bunx pi`)
- Tooling used by scripts: `gh`, `git`, `tee`, `tac`, `jq`, `bash`, standard fs APIs.

`package.json` keeps dependencies minimal; most orchestration power comes from command-line tools in the GitHub-hosted runner.

---

## 10) End-to-end sequence diagram (conceptual)

1. User opens issue/comment.
2. Workflow starts (if actor authorized).
3. `preinstall.ts` adds � reaction.
4. `main.ts` fetches issue context.
5. `main.ts` resolves/creates session mapping.
6. `main.ts` runs `pi` with prompt (+ prior session if resume).
7. `main.ts` extracts final assistant text.
8. `main.ts` commits session/mapping/other repo changes.
9. `main.ts` pushes to `main` with retry-on-conflict.
10. `main.ts` comments response to issue.
11. `main.ts` removes � reaction in `finally`.

---

## 11) Practical mental model

Think of each issue number as a stable conversation key:

- `issue #N` → `state/issues/N.json` → `state/sessions/<session>.jsonl`

When a new comment appears on issue #N, the agent loads that linked session and keeps going. The repo itself is both memory and synchronization medium.

That is the core trick that makes this project work without external databases or services.
