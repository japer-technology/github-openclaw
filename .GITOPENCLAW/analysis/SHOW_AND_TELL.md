# 🙌 GitOpenClaw — OpenClaw as a GitHub Action (AI agent running in a fork)

I built **GitOpenClaw**: an orchestration layer that runs the [OpenClaw](https://github.com/openclaw/openclaw) AI agent entirely inside GitHub Actions, using a **fork of the OpenClaw repository** as the execution environment. Issues become a conversational AI interface powered by the full OpenClaw runtime with 30+ tools, persistent memory, and multi-turn sessions. No servers, no monthly bills — but it does require a specific fork setup.

**Repo:** https://github.com/japer-technology/github-openclaw

---

## Important context: this runs inside a fork

GitOpenClaw is **not** a generic drop-in folder for arbitrary repositories. It operates inside a **fork of the OpenClaw repository** (`openclaw/openclaw`). The fork is the installation.

Why a fork is required:

1. **The OpenClaw source code is present but not used at runtime.** The agent installs `openclaw` as a published npm package from the registry (pinned in `.GITOPENCLAW/package.json`), not from the source code in the repo. The `src/`, `extensions/`, `apps/`, `docs/`, and other upstream directories exist in the fork because they come from upstream — they are not compiled or executed.

2. **The fork's source code has small modifications.** Several OpenClaw source files have been patched to improve behavior in a CI/GitHub Actions context (see [APPLIED-MASTER-MODIFICATIONS.md](../docs/APPLIED-MASTER-MODIFICATIONS.md)). These changes are additive and low-risk but they exist, and they must be re-applied if upstream changes conflict during a fork sync.

3. **All original OpenClaw development workflows are disabled.** The upstream CI, Docker release, labeler, install-smoke, and other development workflows have been moved to `.github/workflows-disabled/`. An enforcement workflow (`GITOPENCLAW-enforce-disabled.yml`) automatically re-disables them if a fork sync re-adds the files. This is because the fork only **executes** the agent — it does not develop or build OpenClaw. Only three active workflows exist: the agent workflow, the enforce-disabled workflow, and a workflow-run cleanup job.

4. **Upstream issue templates and PR templates are also disabled.** The fork replaces them with GitOpenClaw-specific templates so that GitHub Issues serve as the agent's conversational UI, not as a bug tracker for OpenClaw development.

---

## What it does

Open a GitHub issue → OpenClaw agent wakes up, reads the conversation, thinks, replies as a comment, and commits its session state back to git. Every response, every decision, every file change is in your git history. The conversation persists across comments — the agent picks up exactly where it left off.

**It turns the forked repository into a fully provisioned agent environment:** compute (Actions), storage (git), secrets management (Actions secrets), and UI (Issues) — repurposing infrastructure that GitHub already provides.

## How it works

```
Issue created/commented
        ↓
  GitHub Actions workflow triggers
        ↓
  Authorization check (collaborator permissions)
        ↓
  Guard check (fail-closed sentinel)
        ↓
  Preflight validation (config, structure)
        ↓
  👀 reaction added (visual feedback)
        ↓
  `openclaw` installed from npm (not from repo source)
        ↓
  OpenClaw agent runs with full toolkit (--local mode)
        ↓
  Session transcript archived to git (JSONL)
        ↓
  Response posted as issue comment
        ↓
  👀 reaction removed (done signal)
```

Everything lives in a single `.GITOPENCLAW/` directory:

```
.GITOPENCLAW/
├── GITOPENCLAW-ENABLED.md         # Delete to disable (fail-closed guard)
├── lifecycle/
│   ├── GITOPENCLAW-ENABLED.ts     # Sentinel check
│   ├── GITOPENCLAW-PREFLIGHT.ts   # Structural validation
│   ├── GITOPENCLAW-INDICATOR.ts   # 👀 reaction UX
│   └── GITOPENCLAW-AGENT.ts       # Core orchestrator (~860 lines)
├── config/
│   └── settings.json              # Provider, model, trust, limits
├── state/
│   ├── sessions/                  # Git-tracked JSONL transcripts
│   ├── issues/                    # Issue → session mappings
│   ├── memory.log                 # Persistent agent memory
│   └── usage.log                  # Token/tool-call audit trail
├── install/                       # Installer + workflow templates
└── tests/                         # Structural + behavioral tests
```

### The runtime vs. the source code

This is a subtle but critical distinction:

- **The agent runtime** is the `openclaw` npm package, installed via `bun install` from `.GITOPENCLAW/package.json`. This is a published package from the npm registry — it does not depend on any source code in the repository.
- **The source code** (`src/`, `extensions/`, `apps/`, etc.) is present because this is a fork of the OpenClaw repo. It carries small modifications for CI improvements but is otherwise upstream code that is **never compiled or executed** during agent runs.
- **~98% of the repo's files** (by count) are upstream OpenClaw source that serves no purpose at runtime. A post-fork-refresh script (`.GITOPENCLAW/install/post-fork-refresh.sh`) can remove them after each upstream sync to reduce checkout times.

## Key features

### 🔒 Fail-closed security
The agent will **not run** unless a sentinel file (`GITOPENCLAW-ENABLED.md`) explicitly exists. No accidental activations on forks or fresh clones. Delete the file = instant kill switch.

### 🛡️ Three-tier trust system
- **Trusted users** — full agent access (mutations, file edits, bash)
- **Semi-trusted** (write collaborators) — read-only responses, tool-policy override blocks `bash`, `edit`, `create`
- **Untrusted** — configurable: block entirely or give read-only response

### 💾 Git-native session persistence
Conversations are stored as JSONL files committed to the repo. Resume any conversation by commenting on the same issue. Full audit trail in git history — `git log .GITOPENCLAW/state/sessions/` shows every agent interaction ever.

### 🔄 Conflict-resilient state commits
A 10-attempt retry loop with exponential backoff and `rebase -X theirs` handles concurrent issue conversations without losing state. Multiple people can talk to the agent simultaneously on different issues.

### 📊 Usage tracking and budget enforcement
Every run logs tokens used (input/output/cache), tool call count, duration, and stop reason to `usage.log`. Configurable limits prevent runaway costs:

```json
{
  "limits": {
    "maxTokensPerRun": 10000000,
    "maxToolCallsPerRun": 1000,
    "workflowTimeoutMinutes": 120
  }
}
```

### ⚡ Slash commands
Beyond natural language, the agent supports direct OpenClaw CLI commands via issue comments:
`/status`, `/help`, `/config get`, `/plugins list`, and 40+ more. Mutation commands are automatically blocked for semi-trusted users.

### 🚫 Disabled dev workflows
All original OpenClaw development workflows (CI, Docker release, labeler, install-smoke, sandbox-common-smoke, workflow-sanity, auto-response) are moved to `.github/workflows-disabled/` so they never fire. An enforcement workflow automatically re-disables them if an upstream fork sync re-adds the original files to their active locations. Issue templates and PR templates from upstream are similarly displaced. This keeps the fork focused on **execution only** — the fork runs the agent, it does not develop OpenClaw.

## What makes this different

| Feature | GitOpenClaw | Typical GitHub bots |
|---------|-------------|-------------------|
| **Infrastructure** | GitHub Actions only | External server required |
| **State storage** | Git commits (auditable) | External DB |
| **Session memory** | Full JSONL transcripts | Stateless or limited |
| **Tools** | 30+ (web search, browser, memory, code analysis) | Usually 3-5 |
| **Security model** | Fail-closed + 3-tier trust | API key + hope |
| **Cost control** | Token/tool budgets per run | Usually none |
| **Installation** | Fork the repo | Deploy a service |

## Configuration

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-opus-4-6",
  "defaultThinkingLevel": "high",
  "trustPolicy": {
    "trustedUsers": ["your-username"],
    "semiTrustedRoles": ["write"],
    "untrustedBehavior": "read-only-response"
  }
}
```

Supports Anthropic and OpenAI. Just add your API key as a GitHub Actions secret.

## Getting started

1. **Fork** the [github-openclaw](https://github.com/japer-technology/github-openclaw) repository (or the upstream [openclaw/openclaw](https://github.com/openclaw/openclaw) and copy `.GITOPENCLAW/` into it)
2. Ensure the agent workflow exists at `.github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml` (the fork already has this; for fresh forks of upstream, run the installer workflow)
3. Add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) to your repo's **Actions secrets**
4. Verify `GITOPENCLAW-ENABLED.md` exists (fail-closed guard — the agent won't run without it)
5. Disable any upstream dev workflows that came with the fork (the enforce-disabled workflow handles this automatically on push to `main`)
6. Open an issue — the agent responds

No servers to provision, no Docker containers, no cloud accounts. But it **is** a fork, not a standalone folder.

## Source modifications applied to the fork

The fork carries a small set of changes to the OpenClaw source code, documented in [APPLIED-MASTER-MODIFICATIONS.md](../docs/APPLIED-MASTER-MODIFICATIONS.md). These are:

| File | Change | Why |
|------|--------|-----|
| `src/config/paths.ts` | Skip legacy config scanning when `OPENCLAW_STATE_DIR` is set; add lazy path accessors | Prevents stale `~/.openclaw/` configs from being picked up in CI |
| `src/commands/status-all.ts` | CI-aware display for gateway and service rows | Shows "n/a (CI environment)" instead of alarming ECONNREFUSED errors |
| `src/commands/status.command.ts` | Same CI-aware display | Same reason |
| `src/gateway/probe.ts` | Structured ECONNREFUSED → "not running" | Cleaner status output when no gateway exists |
| `src/agents/agent-paths.ts` | Documentation comment | Explains subprocess model constraint |
| `.github/` (multiple files) | Dev workflows disabled, templates replaced | Fork is execution-only, not a development environment |

These modifications are additive and low-conflict. When upstream updates arrive, they merge cleanly in most cases. See the merge conflict resolution guide in `APPLIED-MASTER-MODIFICATIONS.md` for edge cases.

**Note:** These source changes improve diagnostics and UX but are **not required** for the agent to function. The core mechanism — setting `OPENCLAW_STATE_DIR` and `OPENCLAW_CONFIG_PATH` before spawning the `openclaw` CLI — works with unmodified upstream code.

## What I learned

Building this taught me that GitHub already provides everything an AI agent needs: compute, persistent storage, secrets, a UI, and an event system. The key insight was treating git itself as the agent's memory — every conversation becomes a permanent, auditable, diffable artifact. The fail-closed sentinel pattern (`GITOPENCLAW-ENABLED.md`) was crucial for safety: the agent physically cannot activate unless you opt in.

The hardest part was conflict resolution for concurrent conversations. The retry loop with exponential backoff and `rebase -X theirs` handles the common case well, but I'd love to hear if anyone has a cleaner approach.

An important realization: **the fork is the installation model.** While the `.GITOPENCLAW/` folder is designed to be self-contained, in practice it lives inside a fork of the full OpenClaw repo. The upstream source code comes along for the ride but isn't used — the agent installs `openclaw` from npm. This means ~98% of the repo's files are dead weight at runtime, which is why there's a post-fork-refresh cleanup script and why all dev workflows must be disabled. The fork isn't developing OpenClaw; it's only executing the agent.

---

**Feedback welcome!** I'd love to hear from the community — especially ideas about:
- Better approaches to concurrent state commits
- Additional trust tiers or permission models
- What slash commands would be most useful
- Any security concerns I may have missed
- Cleaner ways to separate the agent runtime from the upstream source tree

🦞
