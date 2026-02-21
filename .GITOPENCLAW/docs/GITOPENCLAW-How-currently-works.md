# How .GITOPENCLAW Currently Works

### A fork is the installation — no install step, always up to date

---

## The Core Idea

`.GITOPENCLAW` is an AI agent that lives as a folder inside a GitHub repository. There is no installer binary, no global npm package, no hosted service. **The installation is a fork of the source repository itself.** When you fork the repo that contains `.GITOPENCLAW/`, you already have a working agent. When upstream pushes improvements, you pull them in — your agent is always current.

This design means:

- **Zero install**: fork → add an API key → open an issue → the agent responds.
- **Always up to date**: `git pull` from upstream brings new features, bug fixes, and security patches to your agent.
- **Full transparency**: every line of the agent's code is in your repository, auditable and modifiable.
- **No dependency on external services**: the agent runs entirely within GitHub Actions using your own LLM API key.

---

## System Architecture

The entire system lives inside a single directory at the repository root:

```
.GITOPENCLAW/
├── AGENTS.md                          # Agent identity and instructions
├── GITOPENCLAW-ENABLED.md             # Opt-in sentinel (delete to disable)
├── GITOPENCLAW-INSTALLER.yml          # Bootstrap workflow (bun → npm conversion)
├── config/
│   └── settings.json                  # Provider, model, thinking level
├── lifecycle/
│   ├── GITOPENCLAW-ENABLED.ts         # Fail-closed guard script
│   ├── GITOPENCLAW-INDICATOR.ts       # 👀 reaction indicator
│   └── GITOPENCLAW-AGENT.ts           # Core orchestrator
├── install/
│   ├── GITOPENCLAW-INSTALLER.ts       # One-time setup (copies workflows, templates)
│   ├── GITOPENCLAW-WORKFLOW-AGENT.yml # Workflow template
│   ├── GITOPENCLAW-TEMPLATE-HATCH.md  # Issue template for agent bootstrap
│   ├── GITOPENCLAW-AGENTS.md          # Default agent identity template
│   └── package.json                   # Runtime dependency (openclaw)
├── state/
│   ├── .gitignore                     # Excludes ephemeral runtime artifacts
│   ├── issues/                        # Issue → session mappings
│   ├── sessions/                      # Conversation transcripts (JSONL)
│   ├── memory.log                     # Append-only memory
│   └── user.md                        # User profile
├── build/                             # Build artifacts (future)
├── docs/                              # Documentation (you are here)
├── tests/
│   └── phase0.test.js                 # Structural validation tests
├── 1st-attempt/                       # Research documents from initial exploration
├── package.json                       # Root dependency declaration (openclaw)
└── LICENSE.md                         # MIT license
```

---

## How a Conversation Happens (Step by Step)

When a user creates or comments on a GitHub issue, the following chain of events fires:

### 1. GitHub Actions Trigger

The workflow file (`.github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml`) listens for two events:

- `issues.opened` — a new issue is created
- `issue_comment.created` — a comment is posted on an existing issue

The workflow immediately filters out comments from `github-actions[bot]` to prevent infinite loops.

### 2. Authorization Check

Before any code runs, the **Authorize** step verifies that the actor (the person who opened the issue or posted the comment) has `admin`, `maintain`, or `write` permission on the repository. Unauthorized users are rejected with a clear error.

### 3. Checkout and Setup

The workflow checks out the repository at the default branch with full history (`fetch-depth: 0`), then sets up both Bun and Node.js runtimes.

### 4. Fail-Closed Guard (`GITOPENCLAW-ENABLED.ts`)

The very first lifecycle script runs. It checks for the existence of `.GITOPENCLAW/GITOPENCLAW-ENABLED.md`. If this sentinel file is missing, the script exits with code 1 and the entire workflow stops. This fail-closed design guarantees the agent never activates by accident on a fresh clone.

### 5. Activity Indicator (`GITOPENCLAW-INDICATOR.ts`)

Before dependencies are installed (to give immediate feedback), this script adds a 👀 (eyes) emoji reaction to the triggering issue or comment. This tells the user the agent is processing their request. The reaction metadata is written to `/tmp/reaction-state.json` so the agent can clean it up later.

### 6. Dependency Installation

```bash
cd .GITOPENCLAW && bun install
```

This installs the single runtime dependency: the `openclaw` npm package. The `openclaw` version is pinned in `.GITOPENCLAW/package.json` to ensure reproducible behavior.

### 7. Agent Execution (`GITOPENCLAW-AGENT.ts`)

This is the core orchestrator. It performs the following pipeline:

#### a. Fetch Issue Content
The agent fetches the issue title and body from the GitHub API (not the event payload, which can be truncated for long issues).

#### b. Resolve Session
Each issue maps to a conversation session via `state/issues/<number>.json`. If a mapping exists and the session file is present, the agent resumes the conversation. Otherwise, it starts fresh with a stable session ID (`issue-<number>`).

#### c. Build Prompt
- For `issue_comment` events: the comment body becomes the prompt.
- For `issues` (opened) events: the issue title and body are combined.

#### d. Validate API Key
The agent checks that the required API key for the configured provider (e.g., `ANTHROPIC_API_KEY`) is available as a GitHub Actions secret. If missing, it posts a helpful comment to the issue explaining how to add the secret.

#### e. Run OpenClaw
The agent invokes the `openclaw` CLI in embedded mode:

```bash
openclaw agent --local --json --message "<prompt>" --thinking <level> --session-id <id>
```

Key flags:
- `--local` — runs the agent without a Gateway server
- `--json` — returns structured output for parsing
- `--session-id` — links to the conversation session
- `--thinking` — sets the reasoning level (low/medium/high)

The agent process is monitored with a 5-minute timeout (`AGENT_TIMEOUT_MS`) and a 10-second grace period (`AGENT_EXIT_GRACE_MS`) after output capture.

#### f. Extract Response
The JSON output is parsed to extract the assistant's text reply. Multiple fallback strategies handle different output shapes (payloads array, text field, raw string).

#### g. Persist State
The issue → session mapping is written (or updated) to `state/issues/<number>.json`. All state changes under `.GITOPENCLAW/` are staged and committed.

#### h. Push with Retry
The commit is pushed to the default branch. If the push fails (concurrent agent runs), it retries up to 3 times with `git pull --rebase` between attempts.

#### i. Post Reply
The extracted text is posted as a comment on the originating issue, capped at 60,000 characters (below GitHub's 65,535 limit).

#### j. Cleanup
In a `finally` block (runs even on error), the 👀 reaction is removed using the metadata saved by the indicator script.

---

## Runtime Isolation: Source Stays Raw

A critical design principle: **the agent never modifies source code outside `.GITOPENCLAW/`**.

| Concern | Location | Mutability |
|---|---|---|
| **Your source code** | Repository root (outside `.GITOPENCLAW/`) | Read-only — the agent reads it as context but never edits it |
| **Conversation state** | `.GITOPENCLAW/state/` | Mutable — sessions, mappings, memory committed as audit trail |
| **OpenClaw runtime artifacts** | `.GITOPENCLAW/state/` (gitignored subdirs) | Ephemeral — caches, sqlite, sandbox regenerated each run |
| **Credentials** | GitHub Actions secrets only | Never stored in files |

The isolation is enforced at multiple levels:
- `git add .GITOPENCLAW/` — only `.GITOPENCLAW/` changes are ever staged
- `OPENCLAW_STATE_DIR` — points the OpenClaw runtime at `.GITOPENCLAW/state/`
- `OPENCLAW_CONFIG_PATH` — sets the workspace to the repo root (read-only context)
- `.GITOPENCLAW/state/.gitignore` — excludes OpenClaw internal directories (`agents/`, `cache/`, `credentials/`, `*.db`)

---

## The Fork-as-Installation Model

Traditional AI agent setups require installing a package, configuring a server, or signing up for a service. `.GITOPENCLAW` eliminates all of that:

### How to "install"

1. **Fork** the repository that contains `.GITOPENCLAW/` (or copy the folder into your own repo).
2. **Add an API key** as a GitHub Actions secret (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`).
3. **Run the installer** (optional one-time step): `bun .GITOPENCLAW/install/GITOPENCLAW-INSTALLER.ts`  
   This copies the workflow to `.github/workflows/` and issue templates to `.github/ISSUE_TEMPLATE/`.
4. **Push and open an issue.** The agent responds.

### How to stay up to date

```bash
git remote add upstream <original-repo-url>
git pull upstream main
```

That is it. When the original repository improves the agent (new features, bug fixes, better prompts, updated OpenClaw version), you pull the changes and your agent is upgraded. No migration scripts, no version bumps to manage, no breaking API changes to adapt to.

### Why this works

- The agent is **code, not configuration**. Everything is TypeScript and YAML files that `git merge` handles naturally.
- The runtime dependency (`openclaw` npm package) is version-pinned in `package.json`. Upstream bumps the version, you pull it, `bun install` updates it.
- State files (sessions, memory) are in `state/` and never conflict with code changes because they are append-only or per-issue.
- The `memory.log merge=union` git attribute ensures concurrent memory writes merge cleanly.

---

## Security Model

### Fail-Closed Guard
`GITOPENCLAW-ENABLED.md` is the master switch. If deleted, all workflows are blocked. A fresh clone or fork with this file missing will not run the agent until someone deliberately creates it.

### Authorization Gating
The workflow checks GitHub collaborator permissions before executing. Only users with `admin`, `maintain`, or `write` access can trigger the agent. This prevents random users from consuming your LLM API credits on public repos.

### Bot Comment Filtering
The workflow condition excludes `github-actions[bot]` from triggering, preventing infinite conversation loops.

### Scoped Commits
`git add .GITOPENCLAW/` ensures the agent only commits its own state. Even if the OpenClaw runtime attempted to modify files outside `.GITOPENCLAW/`, those changes would never be staged or pushed.

### Credentials in Secrets Only
API keys are stored exclusively in GitHub Actions secrets. They are injected as environment variables at workflow runtime and never written to files.

---

## Configuration

Settings are stored in `.GITOPENCLAW/config/settings.json`:

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-opus-4-6",
  "defaultThinkingLevel": "high"
}
```

| Setting | Purpose | Options |
|---|---|---|
| `defaultProvider` | LLM provider to use | `anthropic`, `openai` |
| `defaultModel` | Model identifier | Any model supported by the provider |
| `defaultThinkingLevel` | Reasoning depth per query | `low`, `medium`, `high` |

---

## The Bootstrap Workflow

The `GITOPENCLAW-INSTALLER.yml` workflow is a one-time bootstrap that automates the setup for repositories that don't use Bun natively:

1. Creates a bootstrap branch.
2. Copies workflow files from `.GITOPENCLAW/install/` to `.github/workflows/`.
3. Converts all `bun` references to `npm`/`node` equivalents (setup-bun → setup-node, bun install → npm install, etc.).
4. Merges `.gitignore` rules from `.GITOPENCLAW/` fragments.
5. Copies issue templates to `.github/ISSUE_TEMPLATE/`.
6. Marks installation complete by renaming `GITOPENCLAW-NOT-INSTALLED.md` → `GITOPENCLAW-INSTALLED.md`.
7. Opens a pull request for review.

This means even if your repository uses npm instead of Bun, the bootstrap workflow handles the conversion automatically.

---

## State Management

All mutable state is committed to git for full auditability:

### Issue Mappings (`state/issues/<number>.json`)
```json
{
  "issueNumber": 1,
  "sessionId": "issue-1",
  "updatedAt": "2026-02-21T06:00:00.000Z"
}
```

Each issue gets a stable mapping to a session ID. This is how multi-turn conversations work across separate workflow runs.

### Sessions (`state/sessions/`)
Conversation transcripts stored as JSONL files. The OpenClaw runtime manages the session content; `.GITOPENCLAW` just points it at the right directory.

### Memory (`state/memory.log`)
An append-only log file with `merge=union` git attribute to prevent merge conflicts when multiple branches update it.

### User Profile (`state/user.md`)
Agent-maintained notes about the user. Populated during the "hatching" ritual (first interaction).

### Gitignored Internals
Ephemeral OpenClaw runtime artifacts (agent caches, sqlite databases, credential files, sandbox state) are excluded from git via `state/.gitignore`.

---

## Testing

Structural tests in `tests/phase0.test.js` validate that all Phase 0 features are present and correctly wired:

```bash
node --test .GITOPENCLAW/tests/phase0.test.js
```

The tests verify:
- Workflow triggers are correct
- Authorization gating is in place
- Session persistence structures exist
- Issue-session mapping works
- Reaction indicator is properly implemented
- Commit/push retry logic is present
- Configuration files are valid
- Fail-closed guard is functional
- Install templates have correct structure
- OpenClaw integration flags are set
- Runtime isolation is enforced

---

## What OpenClaw Provides

The `openclaw` npm package (pinned in `package.json`) is the engine. It brings:

- **30+ tools** — browser automation, web search, web fetch, memory, sub-agents, and more
- **Semantic memory** — hybrid SQLite BM25 + vector embeddings with temporal decay
- **Multi-provider LLM support** — Anthropic, OpenAI, Google, and others
- **Media understanding** — images, audio, video, PDFs
- **Thinking directives** — per-query reasoning control (`@think high`, `@reason on`)
- **Plugin SDK** — full extension architecture for custom tools, hooks, and channels

`.GITOPENCLAW` invokes this as a CLI command (`openclaw agent --local`), keeping the orchestrator thin and the power delegated to the battle-tested runtime.

---

## Summary

`.GITOPENCLAW` is an AI agent that requires no installation beyond forking a repository. The agent lives as a folder, runs in GitHub Actions, stores all state in git, and stays up to date by pulling from upstream. The security model is fail-closed, the runtime is isolated, and every decision the agent makes is committed as an auditable git history.

**Fork it. Add an API key. Open an issue. Talk to your agent.**

---

_Last updated: 2026-02-21_
