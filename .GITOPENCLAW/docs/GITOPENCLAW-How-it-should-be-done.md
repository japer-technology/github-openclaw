# How It Should Be Done

### The fork is the installation

---

## The Core Idea

There is no installation step. You fork the repository. That is the installation.

Every other AI agent framework asks you to install a CLI, pull a Docker image, sign up for a platform, or run a bootstrap script that downloads binaries you cannot inspect. `.GITOPENCLAW` rejects all of that. The entire agent — its runtime, its lifecycle scripts, its configuration, its state, its tests — lives in a single folder inside a git repository. When you fork that repository, you get everything. When the upstream repository improves, you sync your fork and your agent improves too.

This is not a convenience pattern. It is a design principle that shapes every decision in `.GITOPENCLAW`.

---

## Why Fork-as-Installation Matters

### 1. No version drift

Traditional installations pin a version at install time. Days later, the upstream project ships fixes, new tools, better prompts. Your installation is already stale. You have to remember to update, figure out the update command, hope nothing breaks.

With a fork, `git pull upstream main` is your update. The same mechanism you already use for code. The same review workflow. The same diff view. You can see exactly what changed before you accept it.

### 2. No opaque binaries

When you `npm install -g openclaw`, you get a compiled artifact. You trust that it does what it claims. With `.GITOPENCLAW`, every line of the agent orchestrator, every lifecycle script, every workflow definition is readable TypeScript and YAML sitting in your repository. You can audit it, modify it, or reject any change from upstream.

### 3. No infrastructure dependency

The agent runs on GitHub Actions. The state lives in git. The configuration lives in JSON files. The only external dependency is an LLM API key stored as a GitHub secret. There is no server to maintain, no database to back up, no platform account to manage.

### 4. Always up to date

Syncing a fork is a first-class git operation. GitHub even shows you when your fork is behind. One click (or one `git pull`) and you have the latest agent capabilities, security patches, workflow improvements, and tool surface — without changing your configuration or losing your state.

---

## The Architecture That Makes This Work

### Directory as deployment unit

```
.GITOPENCLAW/
├── AGENTS.md                          # Agent identity and instructions
├── GITOPENCLAW-ENABLED.md             # Sentinel — delete to disable
├── config/
│   └── settings.json                  # Provider, model, thinking level
├── lifecycle/
│   ├── GITOPENCLAW-ENABLED.ts         # Fail-closed guard
│   ├── GITOPENCLAW-INDICATOR.ts       # 👀 reaction indicator
│   └── GITOPENCLAW-AGENT.ts           # Core orchestrator
├── install/
│   ├── GITOPENCLAW-INSTALLER.ts       # One-time setup script
│   ├── GITOPENCLAW-WORKFLOW-AGENT.yml # Workflow template
│   ├── GITOPENCLAW-TEMPLATE-HATCH.md  # Issue template
│   └── GITOPENCLAW-AGENTS.md          # Default agent identity
├── state/
│   ├── .gitignore                     # Excludes ephemeral runtime data
│   ├── memory.log                     # Append-only memory
│   ├── user.md                        # User profile
│   ├── issues/                        # Issue → session mappings
│   └── sessions/                      # Conversation transcripts
├── tests/
│   └── phase0.test.js                 # Structural validation
├── docs/                              # Documentation (you are here)
├── build/                             # Build artifacts and distribution
├── package.json                       # Runtime dependency (openclaw)
└── 1st-attempt/                       # Research archive
```

The entire agent is this folder. Nothing lives outside it except:
- `.github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml` — the GitHub Actions trigger (copied there by the installer)
- `.github/ISSUE_TEMPLATE/gitopenclaw-hatch.md` — the hatch issue template (also copied)

These two files must live in `.github/` because GitHub requires it. Everything else is self-contained.

### The only runtime dependency

The `package.json` at `.GITOPENCLAW/package.json` declares a single dependency:

```json
{
  "dependencies": {
    "openclaw": "^2026.2.19"
  }
}
```

This is the published OpenClaw runtime from npm. It is installed during the GitHub Actions workflow run — not on your machine, not in your global PATH, not as a pre-requisite. The CI runner installs it, uses it, and discards it. Your repository never contains `node_modules`.

The `install/package.json` pins the exact version for the installer workflow, ensuring reproducible bootstrap runs.

### Source stays raw

This is a strict invariant. The agent reads your repository's source code as workspace context but never modifies files outside `.GITOPENCLAW/`. All mutable state — sessions, memory, issue mappings, runtime caches — lives inside `.GITOPENCLAW/state/`.

The enforcement is architectural:
- `GITOPENCLAW-AGENT.ts` runs `git add .GITOPENCLAW/` — scoped staging, never `git add -A`
- `OPENCLAW_STATE_DIR` is set to `.GITOPENCLAW/state/`, isolating all runtime writes
- `OPENCLAW_CONFIG_PATH` points to a temporary config that sets the workspace to repo root (read-only context)
- `state/.gitignore` excludes ephemeral OpenClaw internals (agents/, cache/, credentials/, sqlite databases)

The result: your source code is a read-only input. The agent's work product is a git-committed audit trail inside `.GITOPENCLAW/state/`.

---

## The Execution Model

### GitHub Actions as the runtime

The agent runs inside a GitHub Actions workflow. No local machine, no cloud VM, no Docker container you manage. GitHub provides:
- A fresh Ubuntu runner for each invocation
- Authenticated `gh` CLI for API calls
- `GITHUB_TOKEN` with scoped permissions
- Secure secret injection for LLM API keys

### The lifecycle — four steps in strict order

Every agent run follows the same pipeline:

```
1. Guard       →  GITOPENCLAW-ENABLED.ts
2. Preinstall  →  GITOPENCLAW-INDICATOR.ts
3. Install     →  bun install (or npm install via the installer workflow)
4. Run         →  GITOPENCLAW-AGENT.ts
```

**Step 1 — Guard (fail-closed)**

`GITOPENCLAW-ENABLED.ts` checks for the sentinel file `GITOPENCLAW-ENABLED.md`. If it is missing, `process.exit(1)`. The workflow fails. Nothing else runs. This is a hard safety guarantee: the agent never activates on a fresh clone or a fork where the operator has not explicitly opted in.

To disable the agent: delete `GITOPENCLAW-ENABLED.md` and push. To re-enable: restore it.

**Step 2 — Indicator (immediate feedback)**

`GITOPENCLAW-INDICATOR.ts` adds a 👀 reaction to the issue or comment that triggered the workflow. This runs before dependency installation, so the user sees feedback within seconds of posting. The reaction metadata is written to `/tmp/reaction-state.json` for cleanup in step 4.

**Step 3 — Install (dependency resolution)**

`bun install` (or `npm install` if converted by the installer workflow) resolves the `openclaw` package from npm. This is the only network fetch beyond the git checkout. With caching, this takes seconds on repeat runs.

**Step 4 — Agent (the brain)**

`GITOPENCLAW-AGENT.ts` is the core orchestrator. It:

1. Fetches the issue title and body via `gh` CLI
2. Resolves or creates a session mapping (`state/issues/<n>.json` → session ID)
3. Builds a prompt from the event payload
4. Validates the provider API key is present (posts a helpful comment if missing)
5. Invokes `openclaw agent --local --json --message <prompt> --session-id <id> --thinking <level>`
6. Captures output via `tee` with timeout protection (5 min max, 10s grace period)
7. Extracts the assistant's text reply from the JSON output
8. Persists the issue → session mapping
9. Stages only `.GITOPENCLAW/` changes, commits, and pushes with retry-on-conflict (up to 3 attempts with `git pull --rebase`)
10. Posts the reply as an issue comment (capped at 60,000 chars)
11. **Finally**: removes the 👀 reaction (guaranteed cleanup, even on error)

### Session continuity

Each issue maps to exactly one conversation session:

```
Issue #42 → .GITOPENCLAW/state/issues/42.json → session ID "issue-42"
```

On the first comment, a new session is created. On every subsequent comment, the existing session is loaded and the agent resumes with full prior context. This is the same multi-turn model as `.GITCLAW`, but backed by OpenClaw's richer session system.

### Push conflict resolution

Multiple workflow runs can race to push state. The agent handles this with a retry loop:

```typescript
for (let i = 1; i <= 3; i++) {
  const push = await run(["git", "push", "origin", `HEAD:${defaultBranch}`]);
  if (push.exitCode === 0) break;
  await run(["git", "pull", "--rebase", "origin", defaultBranch]);
}
```

No force pushing. No branch locking. Just rebase and retry.

---

## The Security Model

### Fail-closed by default

The sentinel file `GITOPENCLAW-ENABLED.md` must exist for any workflow to proceed. A fresh fork has this file, but the operator can delete it at any time to kill the agent instantly.

### Collaborator-only access

The workflow's `Authorize` step checks the actor's permission level via the GitHub API. Only `admin`, `maintain`, or `write` collaborators can trigger the agent. Random users on public repos are blocked.

### Bot loop prevention

The workflow's `if` condition filters out comments from `github-actions[bot]`, preventing the agent from responding to its own replies.

### Scoped commits

`git add .GITOPENCLAW/` ensures only state files are committed. Source code outside the `.GITOPENCLAW` tree is never staged, committed, or pushed by the agent.

### No credentials in files

All API keys live in GitHub Actions secrets. The `state/.gitignore` excludes `credentials/` to prevent accidental commits. The agent validates at runtime that the required API key exists and posts a diagnostic comment with fix instructions if it does not.

---

## The Installation Workflow

### For a fresh fork

1. Fork the repository
2. The sentinel file `GITOPENCLAW-ENABLED.md` is already present
3. Add your LLM API key as a repository secret (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`)
4. Open an issue — the agent responds

That is it. No build step. No CLI installation. No infrastructure provisioning.

### The installer (optional, one-time)

For repositories that do not already have the workflow in `.github/workflows/`, the installer copies it there:

**Local installer** (human runs it):
```bash
bun .GITOPENCLAW/install/GITOPENCLAW-INSTALLER.ts
```

**Automated installer** (GitHub Actions):
Copy `GITOPENCLAW-INSTALLER.yml` to `.github/workflows/` and trigger it. It:
- Copies workflow templates from `install/` to `.github/workflows/`
- Converts `bun` references to `npm`/`node` for broader compatibility
- Merges `.gitignore` rules
- Copies issue templates
- Renames `GITOPENCLAW-NOT-INSTALLED.md` to `GITOPENCLAW-INSTALLED.md`
- Opens a PR for review

The installer is non-destructive. Existing files are never overwritten unless `overwrite=true` is explicitly passed.

### Staying up to date

```bash
# Add upstream remote (once)
git remote add upstream https://github.com/openclaw/openclaw.git

# Sync your fork
git fetch upstream
git merge upstream/main
# or: git pull upstream main
```

GitHub also provides a "Sync fork" button in the web UI. One click.

When upstream updates `.GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts` with a new feature, your next sync brings it in. Your `config/settings.json` is yours — it is not overwritten by upstream changes (different file, no conflict). Your `state/` directory is yours — session history is never in upstream.

The separation of concerns makes this work:
- **Upstream owns**: lifecycle scripts, install templates, tests, docs, package.json
- **You own**: config, state, AGENTS.md (your agent's identity), GITOPENCLAW-ENABLED.md

---

## Configuration

### `config/settings.json`

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-opus-4-6",
  "defaultThinkingLevel": "high"
}
```

This is the only configuration file. It controls:
- Which LLM provider to use
- Which model to invoke
- The thinking level (`low`, `medium`, `high`) for reasoning depth

The agent reads this at runtime and passes `--thinking <level>` to the OpenClaw CLI. The provider API key must match a GitHub Actions secret with the corresponding name (e.g., `ANTHROPIC_API_KEY`).

### `AGENTS.md`

The agent's identity, personality, and standing orders. This file is read by the OpenClaw runtime as part of the system prompt. Customize it to give your agent a name, a vibe, and domain-specific instructions.

### `GITOPENCLAW-ENABLED.md`

The opt-in sentinel. Its content does not matter — only its existence. Present = enabled. Absent = disabled.

---

## What OpenClaw Brings

`.GITCLAW` uses Pi, a lightweight coding agent with 7 tools. `.GITOPENCLAW` uses the full OpenClaw runtime, which provides:

| Capability | What it enables |
|---|---|
| **30+ tools** | Browser automation, web search, web fetch, memory search, image understanding, sub-agents, and more |
| **Semantic memory** | Hybrid SQLite BM25 + vector embeddings with temporal decay — not grep on a flat file |
| **Media understanding** | Process images, audio, video, and PDFs attached to issues |
| **Sub-agent orchestration** | Spawn child agents for parallel tasks with model specialization |
| **Thinking directives** | Per-query `--thinking` control for reasoning depth |
| **Plugin ecosystem** | Full SDK for community extensions with tools, hooks, and channel adapters |
| **Multi-channel awareness** | Potential to notify Slack, Discord, Telegram alongside issue comments |

The agent gets all of this without any additional setup. The `openclaw` npm package includes the full runtime. The workflow installs it, invokes it, and discards it.

---

## How Updates Flow

```
upstream/openclaw (source of truth)
        │
        │  git merge / GitHub "Sync fork"
        ▼
your-fork/repo
        │
        │  GitHub Actions workflow trigger
        ▼
ubuntu-latest runner
        │
        │  bun install → openclaw from npm
        │  bun .GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts
        ▼
Agent runs, replies, commits state
```

There are two update paths:

1. **Fork sync** — picks up changes to lifecycle scripts, install templates, tests, docs, and the `package.json` version pin. This is how you get new orchestrator features, security fixes, and structural improvements.

2. **npm version bump** — the `package.json` dependency `"openclaw": "^2026.2.19"` resolves to the latest compatible version on each CI run (within the semver range). When OpenClaw ships new tools, better memory, or provider improvements, the agent picks them up automatically on the next workflow run.

Both paths work without any action from the operator beyond the initial fork. The fork-as-installation model means the agent is always current, always auditable, and always under your control.

---

## The Tests

`tests/phase0.test.js` validates that the structural contract holds. It checks:

- Workflow triggers are correct (`issues.opened`, `issue_comment.created`)
- Authorization gating is present and runs before checkout
- Session persistence directories exist and the agent handles resumption
- Issue-session mapping writes correctly
- Reaction indicator adds 👀 and cleans up in `finally`
- Commit/push scopes to `.GITOPENCLAW/` with retry logic
- Configuration files exist with required fields
- Fail-closed guard checks for sentinel and exits non-zero
- Install templates have valid frontmatter and match live workflows
- Error handling covers timeouts, empty responses, and missing API keys
- OpenClaw integration uses `--local`, `--json`, `--session-id`, `--thinking`
- Runtime isolation sets `OPENCLAW_STATE_DIR` and `OPENCLAW_CONFIG_PATH`

Run them with:
```bash
node --test .GITOPENCLAW/tests/phase0.test.js
```

These tests do not invoke the agent. They validate that the architecture described in this document is structurally present in the code. If a test fails, the contract is broken.

---

## Summary

The right way to run OpenClaw as a GitHub-native AI agent:

1. **Fork the repo** — that is the installation
2. **Add an API key** — one GitHub secret
3. **Open an issue** — the agent responds
4. **Sync your fork** — that is the update

No CLI to install. No server to run. No platform to sign up for. No Docker image to pull. No version to pin and forget. The source is the installation. The fork is the deployment. Git is the update mechanism.

Everything is auditable. Everything is versioned. Everything is yours.

---

_Last updated: 2026-02-21_
