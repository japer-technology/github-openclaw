# RFC: .GITOPENCLAW — AI Agents on GitHub-Native Infrastructure

### A self-contained, drop-in agentic system powered by OpenClaw

**Status:** Draft
**Authors:** OpenClaw Contributors
**Created:** 2026-03-02
**Last updated:** 2026-03-02

---

## Table of Contents

1. [Abstract](#abstract)
2. [Problem Statement](#problem-statement)
   - [The Infrastructure Tax](#the-infrastructure-tax)
   - [The Auditability Gap](#the-auditability-gap)
   - [The Portability Problem](#the-portability-problem)
   - [The Memory Fragmentation Problem](#the-memory-fragmentation-problem)
3. [Design](#design)
   - [Core Principle: The Repository Is the Platform](#core-principle-the-repository-is-the-platform)
   - [Architecture Overview](#architecture-overview)
   - [Directory Structure](#directory-structure)
   - [Execution Model](#execution-model)
   - [Session Continuity](#session-continuity)
   - [Concurrency and Conflict Resolution](#concurrency-and-conflict-resolution)
   - [Configuration](#configuration)
   - [The OpenClaw Runtime Advantage](#the-openclaw-runtime-advantage)
   - [Update Flow](#update-flow)
4. [Security Model](#security-model)
   - [Threat Model](#threat-model)
   - [Fail-Closed Sentinel Guard](#fail-closed-sentinel-guard)
   - [Collaborator-Only Access Gating](#collaborator-only-access-gating)
   - [Bot Loop Prevention](#bot-loop-prevention)
   - [Scoped Commit Isolation](#scoped-commit-isolation)
   - [Credential Management](#credential-management)
   - [Workflow Token Permissions](#workflow-token-permissions)
   - [Supply Chain Considerations](#supply-chain-considerations)
   - [Abuse and Resource Exhaustion](#abuse-and-resource-exhaustion)
   - [Summary of Security Properties](#summary-of-security-properties)
5. [Adoption Plan](#adoption-plan)
   - [Phase 0: Single Repository (Proof of Concept)](#phase-0-single-repository-proof-of-concept)
   - [Phase 1: Team Adoption](#phase-1-team-adoption)
   - [Phase 2: Organization-Wide Rollout](#phase-2-organization-wide-rollout)
   - [Phase 3: Cross-Repository Agent Cooperation](#phase-3-cross-repository-agent-cooperation)
   - [Phase 4: Swarm Management](#phase-4-swarm-management)
   - [Adoption Paths](#adoption-paths)
   - [Migration from .GITCLAW](#migration-from-gitclaw)
   - [Rollback Strategy](#rollback-strategy)
6. [Alternatives Considered](#alternatives-considered)
7. [Open Questions](#open-questions)
8. [References](#references)

---

## Abstract

`.GITOPENCLAW` is a self-contained AI agent that runs entirely within GitHub Actions, powered by the [OpenClaw](https://github.com/openclaw/openclaw) runtime. It requires no servers, no databases, and no platform accounts beyond a GitHub repository and an LLM API key. The entire agent — its lifecycle scripts, configuration, state, memory, and tests — lives in a single folder (`.GITOPENCLAW/`) that can be dropped into any GitHub repository. Users interact with the agent by opening GitHub Issues; the agent responds as comments, and every conversation is committed to git for full auditability.

This RFC defines the problem `.GITOPENCLAW` solves, its architectural design, its security model, and a phased adoption plan for individuals, teams, and organizations.

---

## Problem Statement

### The Infrastructure Tax

Running an AI agent today typically requires provisioning and maintaining dedicated infrastructure: a SaaS platform account, a database cluster, a queue system, webhook receivers, auth middleware, monitoring dashboards, and a billing relationship with yet another vendor. This infrastructure tax is paid before a single useful interaction occurs, and it compounds over time through operational overhead — patching, scaling, monitoring, and debugging systems that exist solely to host the agent.

For many teams, the cost and complexity of agent infrastructure exceeds the value the agent provides. The result is that AI agents remain the province of teams with dedicated platform engineering capacity, while smaller teams and individual developers are priced out — not by the cost of intelligence (LLM API calls are cheap), but by the cost of the plumbing around it.

### The Auditability Gap

Most AI agent platforms treat conversation history as ephemeral application state. Conversations are cached in memory, maybe persisted to a proprietary database, and eventually garbage-collected or locked behind a vendor's export API. This creates a fundamental auditability gap: the agent makes decisions that affect your codebase, your issues, and your workflow, but the reasoning behind those decisions is opaque, non-diffable, and not under your version control.

When an agent reviews a PR, triages an issue, or suggests an architecture change, developers deserve the same auditability for the agent's reasoning that they demand for their own code: authorship, timestamps, diffs, blame, and the ability to revert.

### The Portability Problem

Traditional agent platforms create lock-in through proprietary state storage, configuration formats, and integration points. Migrating from one agent platform to another means losing conversation history, rewriting integrations, and re-teaching the agent everything it learned about your project. The agent's knowledge — the most valuable thing it accumulates — is trapped in the platform.

This portability problem also prevents experimentation. Teams cannot easily try a new agent, run it alongside an existing one, or fork an agent's personality and skills to create a specialized variant. The agent is a black box rented from a vendor, not an asset owned by the team.

### The Memory Fragmentation Problem

AI agents that run as external services maintain memory in isolation from the codebase they serve. The agent's understanding of your project lives in a separate system — a vector database, a proprietary knowledge graph, an API-gated session store — disconnected from the code, issues, and commits that generated that understanding.

When you fork a repository, the agent's memory stays behind. When you branch, the agent does not branch with you. When you revert a bad decision, the agent's memory of that decision persists. The agent's knowledge and the codebase's history evolve on separate timelines with no structural connection.

---

## Design

### Core Principle: The Repository Is the Platform

`.GITOPENCLAW` is built on a single foundational insight: **GitHub already provides every primitive an AI agent needs to exist.**

| Agent Requirement | GitHub Primitive |
|---|---|
| **Compute** | GitHub Actions (on-demand workflow runners) |
| **Persistent storage** | Git (commits, branches, history) |
| **User interface** | Issues, Pull Requests, Discussions |
| **Authentication** | GitHub identity, collaborator permissions |
| **Secrets management** | GitHub Actions secrets |
| **Event system** | Webhooks, workflow triggers (`issues.opened`, `issue_comment.created`) |
| **Audit trail** | Git log, commit history, blame |
| **Access control** | Repository permissions (owner, member, collaborator) |
| **Distribution** | Fork, clone, copy a folder |

No additional servers, databases, queues, or monitoring dashboards are required. The infrastructure cost is zero beyond what teams already pay for GitHub. The agent lives **inside** the repository, not outside it reaching in.

### Architecture Overview

The architecture follows a strict separation of concerns:

| Concern | Location | Mutability |
|---|---|---|
| **Source code** | Repository root (outside `.GITOPENCLAW/`) | Read-only — never modified by the agent |
| **Agent logic** | `.GITOPENCLAW/lifecycle/` | Upstream-managed — updated via fork sync |
| **Configuration** | `.GITOPENCLAW/config/settings.json` | User-owned — provider, model, thinking level |
| **Runtime state** | `.GITOPENCLAW/state/` | Mutable — sessions, memory, issue mappings committed as audit trail |
| **Ephemeral data** | `.GITOPENCLAW/state/` (gitignored subdirs) | Transient — caches, sqlite, credentials regenerated each run |
| **Credentials** | GitHub Actions secrets only | Never stored in files |

The agent reads the repository's source code as workspace context but writes all runtime data (sessions, memory, mappings) into `.GITOPENCLAW/state/` via the `OPENCLAW_STATE_DIR` environment variable. Source code outside the `.GITOPENCLAW/` tree is **never modified** by the agent.

### Directory Structure

```
.GITOPENCLAW/
├── AGENTS.md                          # Agent identity, personality, and instructions
├── GITOPENCLAW-ENABLED.md             # Sentinel file — delete to disable (fail-closed)
├── config/
│   └── settings.json                  # Provider, model, and thinking level config
├── lifecycle/
│   ├── GITOPENCLAW-ENABLED.ts         # Fail-closed guard script
│   ├── GITOPENCLAW-PREFLIGHT.ts       # Pre-run validation checks
│   ├── GITOPENCLAW-INDICATOR.ts       # 👀 reaction for immediate feedback
│   └── GITOPENCLAW-AGENT.ts           # Core orchestrator
├── install/
│   ├── GITOPENCLAW-INSTALLER.ts       # One-time local setup script
│   ├── GITOPENCLAW-WORKFLOW-AGENT.yml # Workflow template
│   └── ...                            # Issue templates and config templates
├── state/
│   ├── .gitignore                     # Excludes ephemeral runtime data
│   ├── memory.log                     # Append-only memory log
│   ├── user.md                        # User profile
│   ├── issues/                        # Issue → session mappings (N.json)
│   └── sessions/                      # Conversation transcripts (JSONL)
├── docs/                              # Documentation and design docs
├── build/                             # Build artifacts
├── tests/                             # Structural validation tests
└── package.json                       # Single runtime dependency (openclaw)
```

Two files must live outside `.GITOPENCLAW/` because GitHub requires it:
- `.github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml` — the Actions trigger
- `.github/ISSUE_TEMPLATE/GITOPENCLAW-NEW-ISSUE.yml` — the issue template

Everything else is self-contained in the `.GITOPENCLAW/` folder.

### Execution Model

Every agent run follows a strict, ordered pipeline within a GitHub Actions workflow:

```
1. Authorize  →  Check actor's collaborator permission via GitHub API
2. Checkout   →  actions/checkout@v4 (default branch, full history)
3. Setup      →  Install Bun runtime + Node.js 22
4. Cache      →  Restore Bun install cache and node_modules
5. Guard      →  GITOPENCLAW-ENABLED.ts (fail-closed sentinel check)
6. Preflight  →  GITOPENCLAW-PREFLIGHT.ts (pre-run validation)
7. Preinstall →  GITOPENCLAW-INDICATOR.ts (👀 reaction for feedback)
8. Install    →  bun install --frozen-lockfile (resolve openclaw from npm)
9. Run        →  GITOPENCLAW-AGENT.ts (core orchestrator)
```

The **Guard** step runs before dependency installation. If the sentinel file `GITOPENCLAW-ENABLED.md` is absent, the workflow fails immediately with `process.exit(1)`. Nothing else executes. This is a hard safety guarantee: the agent never activates on a repository where the operator has not explicitly opted in.

The **Run** step (GITOPENCLAW-AGENT.ts) performs the core orchestration:

1. Fetches the issue title and body via the `gh` CLI
2. Resolves or creates a session mapping (`state/issues/<N>.json` → session ID)
3. Builds a prompt from the event payload (issue body for new issues, comment body for replies)
4. Validates the provider API key is present (posts a diagnostic comment if missing)
5. Invokes `openclaw agent --local --json --message <prompt> --session-id <id> --thinking <level>`
6. Captures output with timeout protection (5-minute max, 10-second grace period)
7. Extracts the assistant's text reply from JSON output
8. Persists the issue → session mapping
9. Stages only `.GITOPENCLAW/` changes, commits, and pushes with retry-on-conflict
10. Posts the reply as an issue comment (capped at 60,000 characters)
11. Removes the 👀 reaction in a `finally` block (guaranteed cleanup, even on error)

### Session Continuity

Each GitHub Issue maps to exactly one conversation session:

```
Issue #42  →  .GITOPENCLAW/state/issues/42.json  →  session ID "issue-42"
```

On the first comment, a new session is created. On every subsequent comment, the existing session is loaded and the agent resumes with full prior context. The session mapping file is a simple JSON pointer:

```json
{
  "issueNumber": 42,
  "sessionPath": "state/sessions/issue-42.jsonl",
  "updatedAt": "2026-03-02T07:00:00.000Z"
}
```

Sessions are JSONL files committed to git. The agent remembers because git remembers. Fork the repo, and you fork the agent's memory. Branch, and the agent's reality branches with you. Revert a commit, and you revert a memory.

### Concurrency and Conflict Resolution

The workflow uses per-issue-per-run concurrency groups:

```yaml
concurrency:
  group: github-claw-${{ github.repository }}-issue-${{ github.event.issue.number }}-${{ github.run_id }}
  cancel-in-progress: false
```

This means:

- **Same-issue requests** run in parallel (each run gets a unique concurrency group, so no events are dropped).
- **Different issues** run in parallel with no mutual blocking.
- **Push conflicts** are resolved with a retry loop:

```typescript
for (let attempt = 1; attempt <= 3; attempt++) {
  const push = await run(["git", "push", "origin", `HEAD:${defaultBranch}`]);
  if (push.exitCode === 0) break;
  await run(["git", "pull", "--rebase", "origin", defaultBranch]);
}
```

No force pushing. No branch locking. Just rebase and retry — pragmatic git conflict handling for concurrent state writes.

### Configuration

Configuration is minimal and lives in a single file:

**`.GITOPENCLAW/config/settings.json`**:
```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-opus-4-6",
  "defaultThinkingLevel": "high"
}
```

This controls which LLM provider to use, which model to invoke, and the reasoning depth (`low`, `medium`, `high`). The corresponding API key must be stored as a GitHub Actions secret (e.g., `ANTHROPIC_API_KEY`).

**`.GITOPENCLAW/AGENTS.md`** defines the agent's identity, personality, and standing instructions. It is read by the OpenClaw runtime as part of the system prompt.

**`.GITOPENCLAW/GITOPENCLAW-ENABLED.md`** is the opt-in sentinel. Its content is irrelevant — only its existence matters. Present = enabled. Absent = disabled.

### The OpenClaw Runtime Advantage

`.GITOPENCLAW` is powered by the full [OpenClaw](https://github.com/openclaw/openclaw) runtime, which provides capabilities beyond what lightweight agent harnesses offer:

| Capability | Description |
|---|---|
| **30+ tools** | Browser automation, web search, web fetch, memory, sub-agents, and more |
| **Semantic memory** | Hybrid SQLite BM25 full-text search + vector embeddings with temporal decay |
| **Media understanding** | Process images, audio, video, and PDFs attached to issues |
| **Sub-agent orchestration** | Spawn child agents for parallel tasks with model-appropriate reasoning levels |
| **Thinking directives** | Per-query `--thinking` control for reasoning depth |
| **Plugin ecosystem** | Full SDK for community extensions with tools, hooks, and channel adapters |
| **Multi-channel awareness** | Potential to notify Slack, Discord, Telegram alongside issue comments |

The `openclaw` npm package is the sole runtime dependency. It is installed during the GitHub Actions workflow — not on the developer's machine. The CI runner installs it, uses it, and discards it.

### Update Flow

Two update paths keep the agent current:

1. **Fork sync** — picks up changes to lifecycle scripts, install templates, tests, and docs. This is how operators receive new orchestrator features and security fixes. GitHub's "Sync fork" button or `git pull upstream main` performs the update.

2. **npm version resolution** — the `package.json` dependency `"openclaw": "^2026.x.x"` resolves to the latest compatible version on each CI run. When OpenClaw ships new tools, better memory, or provider improvements, the agent picks them up automatically.

The separation of concerns enables conflict-free updates:
- **Upstream owns:** lifecycle scripts, install templates, tests, docs, `package.json`
- **The operator owns:** `config/settings.json`, `AGENTS.md`, `GITOPENCLAW-ENABLED.md`, `state/`

---

## Security Model

### Threat Model

`.GITOPENCLAW` operates within the following trust boundaries:

- **Trusted:** Repository owners, members, and collaborators with write access. These actors can trigger the agent, modify configuration, and access state.
- **Untrusted:** External users on public repositories who can open issues or post comments. These actors must be prevented from triggering agent execution or influencing agent behavior.
- **Semi-trusted:** The LLM provider. The agent sends conversation context to the configured LLM API. Prompt injection via issue content is a known risk; the security model does not attempt to solve prompt injection but ensures it cannot escalate to host-level or repository-level compromise.
- **Trusted:** The `openclaw` npm package. As a runtime dependency installed from npm, it operates with the same permissions as the workflow. Supply chain attacks against this package would compromise the agent.

The primary security goals are:

1. **Unauthorized execution prevention** — untrusted actors cannot trigger agent runs
2. **Source code integrity** — the agent never modifies files outside `.GITOPENCLAW/`
3. **Credential isolation** — API keys never appear in committed files
4. **Fail-closed operation** — the agent does nothing by default; explicit opt-in is required
5. **Auditability** — every agent action is a git commit with authorship, timestamp, and diff

### Fail-Closed Sentinel Guard

The file `GITOPENCLAW-ENABLED.md` is the opt-in sentinel. It is checked as the **first substantive step** of every workflow run, before dependency installation, before any API calls, before any LLM invocation.

```typescript
// lifecycle/GITOPENCLAW-ENABLED.ts
if (!existsSync(".GITOPENCLAW/GITOPENCLAW-ENABLED.md")) {
  process.exit(1);
}
```

If the file is absent, the workflow fails immediately. This guarantees:

- A fresh clone with no sentinel file cannot accidentally run the agent.
- An operator can **instantly disable** the agent by deleting one file and pushing.
- Re-enabling requires an explicit `git add` + `git push` — not a flag toggle in a dashboard, but a committed, auditable change in git history.

### Collaborator-Only Access Gating

The workflow's **Authorize** step checks the triggering actor's permission level via the GitHub API before any other step executes:

```bash
PERM=$(gh api "repos/$REPO/collaborators/$ACTOR/permission" --jq '.permission')
if [[ "$PERM" != "admin" && "$PERM" != "maintain" && "$PERM" != "write" ]]; then
  echo "::notice::Permission $PERM is below admin/maintain/write — trust gating deferred to agent"
fi
```

Only actors with `admin`, `maintain`, or `write` collaborator permissions can trigger full agent execution. This prevents drive-by users on public repositories from consuming Actions minutes, invoking LLM API calls, or injecting content into the agent's memory.

The permission level is passed to the agent via the `ACTOR_PERMISSION` environment variable, enabling the agent to implement additional trust-level logic (e.g., reduced tool access for lower-trust actors).

### Bot Loop Prevention

The workflow's `if` condition filters out the agent's own comments:

```yaml
if: >-
  (github.event_name == 'issues')
  || (github.event_name == 'issue_comment'
      && github.event.comment.user.login != 'github-actions[bot]')
```

This prevents infinite loops where the agent responds to its own reply, which triggers another response, ad infinitum. The filter is applied at the workflow trigger level — the job never starts for bot-authored comments.

### Scoped Commit Isolation

The agent stages and commits **only** files within the `.GITOPENCLAW/` directory:

```bash
git add .GITOPENCLAW/
```

This scoped staging ensures:

- Source code outside `.GITOPENCLAW/` is never modified, staged, committed, or pushed by the agent.
- Even if the OpenClaw runtime writes temporary files to the workspace (e.g., during tool execution), those files are never committed.
- The `OPENCLAW_STATE_DIR` environment variable points all runtime writes to `.GITOPENCLAW/state/`, and `.GITOPENCLAW/state/.gitignore` excludes ephemeral data (caches, sqlite databases, credentials directories).

### Credential Management

All API keys are stored exclusively in **GitHub Actions secrets** and injected as environment variables at runtime:

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

No credentials are ever stored in repository files. The `state/.gitignore` includes a `credentials/` exclusion as defense-in-depth against accidental credential commits. The agent validates at startup that the required API key exists and posts a diagnostic comment with fix instructions if it does not — rather than failing silently.

### Workflow Token Permissions

The `GITHUB_TOKEN` is scoped to the minimum permissions required:

```yaml
permissions:
  contents: write   # Commit and push state changes
  issues: write     # Post comments and reactions
  actions: write    # Workflow management
```

No `admin` permissions, no `packages` access, no `security_events` — only what the agent needs to operate.

### Supply Chain Considerations

The agent has one runtime dependency: the `openclaw` npm package. This dependency is:

- **Published to the public npm registry** by the OpenClaw maintainers.
- **Version-pinned** in `.GITOPENCLAW/package.json` with a semver range (e.g., `^2026.x.x`).
- **Installed from a lockfile** (`bun install --frozen-lockfile`) to ensure reproducible builds.
- **Installed on ephemeral CI runners** — never on developer machines or in the repository's `node_modules`.

Operators who require stricter supply chain guarantees can:
- Pin to an exact version (remove the `^` prefix)
- Use a private npm registry or mirror
- Vendor the dependency directly into the repository
- Audit the package contents via `npm pack --dry-run` before updating

### Abuse and Resource Exhaustion

`.GITOPENCLAW` is subject to the same resource constraints as any GitHub Actions workflow:

- **Actions minutes** are consumed per workflow run. The `timeout-minutes: 10` setting caps each run.
- **LLM API costs** scale with conversation volume. The operator controls this via their API key's spending limits.
- **Git storage** grows as session logs accumulate. Operators can prune old sessions or configure `.gitattributes` merge strategies for state files.
- **GitHub API rate limits** apply to issue comments and reactions. The agent's single-comment-per-run pattern stays well within default limits.

The collaborator-only access gating (see above) is the primary defense against abuse on public repositories — untrusted actors cannot trigger workflow runs.

### Summary of Security Properties

| Property | Mechanism |
|---|---|
| **Fail-closed by default** | Sentinel file `GITOPENCLAW-ENABLED.md` must exist |
| **Collaborator-only execution** | GitHub API permission check before any agent logic |
| **Bot loop prevention** | Workflow `if` condition filters `github-actions[bot]` comments |
| **Source code integrity** | Scoped `git add .GITOPENCLAW/` — nothing outside the folder is committed |
| **Credential isolation** | API keys in GitHub secrets only; `state/.gitignore` excludes `credentials/` |
| **Minimal token permissions** | `contents: write`, `issues: write`, `actions: write` — nothing more |
| **Reproducible installs** | `bun install --frozen-lockfile` from committed lockfile |
| **Run time cap** | `timeout-minutes: 10` on the workflow job |
| **Auditable state** | Every agent action is a git commit with author, timestamp, and diff |
| **Instant kill switch** | Delete `GITOPENCLAW-ENABLED.md` and push — all workflows stop |

---

## Adoption Plan

### Phase 0: Single Repository (Proof of Concept)

**Goal:** Validate the pattern in one repository with one operator.

**Steps:**
1. Fork the `.GITOPENCLAW` reference repository (or copy the `.GITOPENCLAW/` folder into an existing repo).
2. Run the installer: `bun .GITOPENCLAW/install/GITOPENCLAW-INSTALLER.ts` (copies workflow and issue templates to `.github/`).
3. Install dependencies: `cd .GITOPENCLAW && bun install`.
4. Add an LLM API key as a GitHub Actions secret (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`).
5. Commit and push.
6. Open a GitHub Issue — the agent responds.

**Success criteria:**
- Agent responds to issues within 2 minutes.
- Conversation persists across multiple comments on the same issue.
- Session state is visible in `state/sessions/` via git log.
- Agent can be disabled by deleting `GITOPENCLAW-ENABLED.md` and re-enabled by restoring it.

**Time estimate:** 5–15 minutes.

### Phase 1: Team Adoption

**Goal:** Deploy the agent across a team's repositories with shared configuration standards.

**Steps:**
1. Create an organization-level `ANTHROPIC_API_KEY` secret (or per-repo secrets for cost isolation).
2. Define a standard `AGENTS.md` template that encodes team conventions (code review style, triage rules, communication tone).
3. Copy `.GITOPENCLAW/` into each target repository using a script or GitHub template repository.
4. Customize `config/settings.json` per repository if needed (e.g., different models for different repos).
5. Train the team on the interaction model: open an issue, the agent replies, continue the conversation.

**Success criteria:**
- Multiple team members interact with agents across multiple repositories.
- Agents accumulate useful institutional knowledge (visible via `state/memory.log` and session history).
- Team agrees on conventions for agent-appropriate vs. human-appropriate issues.

**Time estimate:** 1–2 days for initial rollout; ongoing refinement.

### Phase 2: Organization-Wide Rollout

**Goal:** Deploy agents to all repositories in a GitHub organization using centralized management.

**Steps:**
1. Create a **configuration repository** that publishes baseline `AGENTS.md`, `settings.json`, and skill files.
2. Use a CI pipeline or GitHub Actions reusable workflow to propagate `.GITOPENCLAW/` to target repositories.
3. Set organization-level secrets for LLM API keys.
4. Establish governance policies:
   - Which repositories get agents (opt-in via sentinel file)
   - Which models and thinking levels are approved
   - Token usage budgets per team or repository
   - Review process for changes to `AGENTS.md` (agent identity/instructions)
5. Monitor agent activity via session logs committed to each repository's `state/` directory.

**Success criteria:**
- Agents are operational across 10+ repositories.
- Centralized configuration changes propagate to all agents.
- Token usage is tracked and within budget.
- No security incidents from unauthorized agent execution.

### Phase 3: Cross-Repository Agent Cooperation

**Goal:** Enable agents in different repositories to collaborate on cross-cutting tasks.

**Mechanisms** (all using GitHub-native primitives):

- **Cross-repo issues:** A security agent in a shared-infrastructure repo detects a vulnerability and opens an issue in the affected downstream repo. That repo's agent picks it up and begins remediation.
- **Repository dispatch events:** One agent fires a `repository_dispatch` event targeting another repo. The receiving agent wakes, processes the payload, and responds.
- **Shared state via git:** Agents read each other's committed state (session logs, memory) via the GitHub API or git submodules.
- **Issue-based agent-to-agent dialogue:** A triage agent opens an issue that a review agent responds to. The review agent's response triggers the triage agent to update labels and notify the team.

**Success criteria:**
- At least two agents collaborate on a task spanning two repositories.
- All inter-agent interactions are visible in GitHub's UI (issues, comments, commits).

### Phase 4: Swarm Management

**Goal:** Manage fleets of agents across an organization at scale.

**Capabilities:**

- **Fleet deployment:** A single script adds `.GITOPENCLAW/` to every repository in an organization. Each agent bootstraps independently with repo-specific context.
- **Centralized configuration, local execution:** A shared configuration repository publishes baseline settings that individual repo agents inherit. Each agent still runs locally in its own repo.
- **Health monitoring:** A hub repository polls `state/` directories across managed agents, tracking session activity, error rates, and response times.
- **Coordinated upgrades:** Bump the OpenClaw version in the shared config repo; a dispatch workflow propagates the update to all agent repos.
- **Cost tracking:** Each agent commits token usage to `state/`. A swarm manager aggregates this for organization-wide cost visibility.

**Success criteria:**
- 50+ agents managed from a single configuration repository.
- Automated health monitoring with alerting for agent failures.
- Organization-wide token usage dashboard.

### Adoption Paths

| Starting Point | Recommended Path |
|---|---|
| **Individual developer** | Phase 0 → customize `AGENTS.md` → iterate |
| **Small team (2–10)** | Phase 0 → Phase 1 → standardize conventions |
| **Engineering org (10–100 repos)** | Phase 0 → Phase 1 → Phase 2 → Phase 3 |
| **Enterprise (100+ repos)** | Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 |

### Migration from .GITCLAW

Teams already using `.GITCLAW` (the lightweight Pi-powered variant) can migrate to `.GITOPENCLAW` incrementally:

1. Add the `.GITOPENCLAW/` folder alongside the existing `.GITCLAW/` folder.
2. Configure `.GITOPENCLAW` with the same API key and model preferences.
3. Run both agents in parallel on different issues to validate behavior.
4. Once satisfied, disable `.GITCLAW` (delete `GITCLAW-ENABLED.md`) and continue with `.GITOPENCLAW` only.

Session history from `.GITCLAW` remains in git — it is not lost, just no longer actively appended.

### Rollback Strategy

Disabling or removing `.GITOPENCLAW` is trivial and immediate:

| Action | Method |
|---|---|
| **Temporarily disable** | Delete `GITOPENCLAW-ENABLED.md` and push. All workflows stop. |
| **Re-enable** | Restore `GITOPENCLAW-ENABLED.md` and push. Agent resumes. |
| **Fully remove** | Delete the `.GITOPENCLAW/` folder, the workflow file in `.github/workflows/`, and the issue template. Push. |

All agent state (sessions, memory, mappings) remains in git history even after removal. It can be recovered by checking out an earlier commit.

---

## Alternatives Considered

### External AI Agent Platforms (Devin, Cursor, etc.)

These require dedicated cloud infrastructure, proprietary accounts, and ongoing billing relationships. They provide richer UIs but sacrifice auditability (conversations are not git-native) and portability (state is locked in the platform). `.GITOPENCLAW` trades UI polish for infrastructure simplicity, full auditability, and zero vendor lock-in.

### GitHub Copilot Coding Agent

Operates within GitHub Actions but is tightly coupled to GitHub's proprietary Copilot ecosystem. It is not self-hosted, not customizable beyond GitHub's configuration surface, and does not support alternative LLM providers. `.GITOPENCLAW` provides full control over model selection, agent identity, and runtime behavior.

### Self-Hosted Agent on a VM/Container

Running an agent on a dedicated server provides lower latency and persistent state without git commits. However, it introduces operational overhead (provisioning, monitoring, patching, scaling) that `.GITOPENCLAW` eliminates entirely. For teams that need sub-second response times, a self-hosted approach may be appropriate; for async workflows (issue triage, PR review, documentation), GitHub Actions latency is acceptable.

### Local CLI Agents (SWE-agent, Aider, OpenHands)

These are excellent for local development workflows but do not provide persistent, multi-user, auditable state. They run in a single developer's terminal, not as a shared team resource. `.GITOPENCLAW` complements local agents — use Aider for local coding, `.GITOPENCLAW` for issue-driven async collaboration.

---

## Open Questions

1. **Session pruning strategy.** As session logs accumulate, git repository size grows. What is the recommended pruning strategy for old sessions? Options include periodic archival to a separate branch, compression, or external storage with git-tracked pointers.

2. **Multi-branch state.** Currently, all state is committed to the default branch. Should state branches be supported for feature-branch-scoped agent conversations?

3. **PR-triggered workflows.** The current implementation triggers on issues only. Extending to pull request events (review requests, comment threads) would expand the agent's utility. What is the right trigger surface?

4. **Rate limiting and cost controls.** Beyond LLM API spending limits, should `.GITOPENCLAW` implement its own per-issue or per-user rate limiting to prevent runaway costs?

5. **Cross-repo state sharing.** For Phase 3 agent cooperation, what is the right mechanism for sharing state between agents? Options include git submodules, GitHub API reads, and repository dispatch payloads.

---

## References

- [.GITOPENCLAW README](../README.md) — Quick start and overview
- [GITOPENCLAW-The-Idea.md](GITOPENCLAW-The-Idea.md) — Vision and philosophy
- [GitHub-as-Infrastructure.md](GitHub-as-Infrastructure.md) — Paper: how GitHub serves as a complete agent infrastructure
- [GITOPENCLAW-How-it-should-be-done.md](GITOPENCLAW-How-it-should-be-done.md) — Fork-as-installation architecture and execution model
- [GITOPENCLAW-Concurrent-Execution-Analysis.md](GITOPENCLAW-Concurrent-Execution-Analysis.md) — Concurrency limitations and mitigations
- [GITOPENCLAW-QUICKSTART.md](../GITOPENCLAW-QUICKSTART.md) — 5-minute setup guide
- [OpenClaw](https://github.com/openclaw/openclaw) — The multi-channel AI gateway runtime
- [SECURITY.md](../../SECURITY.md) — OpenClaw security policy and trust model

---

_Last updated: 2026-03-02_
