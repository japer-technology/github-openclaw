# What .GITOPENCLAW Does for OpenClaw

### Descriptions at every length — from one-liner to deep analysis

---

## At a Glance

| Length | Description |
|---|---|
| **One-liner** | `.GITOPENCLAW` turns any GitHub repository into a self-contained AI agent powered by OpenClaw. |
| **Tagline** | Drop a folder. Push. Open an issue. Talk to your agent. |
| **Tweet-length** | `.GITOPENCLAW` is a single folder that makes any GitHub repo an AI agent — GitHub Actions is the compute, git is the memory, Issues are the interface, and OpenClaw is the brain. No servers. No infrastructure. Just a folder. |

---

## Elevator Pitch (30 seconds)

`.GITOPENCLAW` is a self-contained AI agent that lives entirely inside a GitHub repository as a single folder called `.GITOPENCLAW/`. It uses GitHub Actions as its compute engine, git as its persistent memory, GitHub Issues as its conversation interface, and the OpenClaw runtime as its AI backbone. There are no servers to run, no databases to manage, no accounts to create. You fork a repo (or copy the folder), add an LLM API key as a GitHub secret, and open an issue — the agent responds. Every conversation, every decision, every piece of state is committed to git, making the agent fully auditable, forkable, and version-controlled.

---

## Short Summary (1 paragraph)

`.GITOPENCLAW` makes OpenClaw available as a GitHub-native AI agent by embedding the entire agent system — lifecycle scripts, configuration, state management, and workflow definitions — inside a single repository folder. When a user opens a GitHub issue or posts a comment, a GitHub Actions workflow triggers the OpenClaw runtime, which reads the issue content, reasons about it using a configured LLM provider, and posts a reply as an issue comment. Conversations persist across workflow runs through JSONL session files committed to git, with each issue number mapping to a stable session. The system is fail-closed by default (a sentinel file must exist to enable it), restricts access to repository collaborators, and never modifies source code outside its own `.GITOPENCLAW/` directory. Because OpenClaw is the engine, the agent has access to 30+ tools including browser automation, web search, semantic memory, media understanding, sub-agent orchestration, and a full plugin ecosystem — all from within a GitHub Actions runner.

---

## Medium Description (What, Why, How)

### What it is

`.GITOPENCLAW` is an AI agent framework that runs entirely within GitHub's native infrastructure. The entire agent — its code, configuration, state, tests, and documentation — lives in a single directory at the repository root: `.GITOPENCLAW/`. It is powered by the [OpenClaw](https://github.com/openclaw/openclaw) runtime, installed as an npm dependency, which provides the LLM interaction, tool execution, memory, and media processing capabilities.

### Why it exists

Most AI agent platforms require external infrastructure: servers, databases, auth systems, and hosted dashboards. `.GITOPENCLAW` rejects that model entirely. GitHub already provides compute (Actions), storage (git), an event bus (webhooks), access control (collaborators), a conversation surface (Issues), and a global API. These are the same primitives agent platforms charge for — GitHub gives them to every repository for free. `.GITOPENCLAW` leverages all of them so that deploying an AI agent is as simple as copying a folder and adding an API key.

### How it works

1. **Trigger**: A user creates a GitHub issue or comments on an existing one.
2. **Workflow**: A GitHub Actions workflow (`GITOPENCLAW-WORKFLOW-AGENT.yml`) fires, checks authorization, sets up the runtime environment, and runs the lifecycle pipeline.
3. **Lifecycle pipeline**:
   - **Guard** (`GITOPENCLAW-ENABLED.ts`): Verifies the sentinel file exists — if not, the entire workflow stops (fail-closed).
   - **Preflight** (`GITOPENCLAW-PREFLIGHT.ts`): Validates configuration, required files, and security rules.
   - **Indicator** (`GITOPENCLAW-INDICATOR.ts`): Adds a 👀 emoji reaction for immediate visual feedback.
   - **Install**: Runs `bun install` in `.GITOPENCLAW/` to install the OpenClaw runtime.
   - **Agent** (`GITOPENCLAW-AGENT.ts`): The core orchestrator — fetches issue content, resolves or creates a session, builds a prompt, invokes the OpenClaw CLI, extracts the reply, commits state to git, pushes with retry, posts the reply as an issue comment, and cleans up the reaction.
4. **Persistence**: Session transcripts (JSONL), issue-to-session mappings (JSON), and memory are committed to git under `.GITOPENCLAW/state/`. This makes every interaction part of the repository's version history.
5. **Isolation**: The agent only stages and commits files within `.GITOPENCLAW/`. Source code outside this directory is read as context but never modified.

### What the OpenClaw runtime provides

The OpenClaw runtime is what distinguishes `.GITOPENCLAW` from simpler agent wrappers. It brings:

- **30+ tools**: Browser automation, web search, web fetch, semantic memory, file operations, sub-agents, and more.
- **Semantic memory**: Hybrid SQLite BM25 full-text search combined with vector embeddings — the agent recalls context by meaning, not just keywords.
- **Multi-provider LLM support**: Anthropic, OpenAI, Google, Bedrock, Ollama, and others.
- **Media understanding**: Images, audio, video, and PDF processing built into the agent pipeline.
- **Thinking directives**: Per-query reasoning control (`@think high`, `@reason on`, `@elevated`).
- **Plugin SDK**: A full extension architecture for community-built tools, hooks, and channel adapters.
- **Sub-agent orchestration**: Spawn specialized child agents for parallel task execution with model-appropriate reasoning levels.

---

## Detailed Analysis

### 1. The Repository as Platform

`.GITOPENCLAW` is built on a single architectural insight: **GitHub is already a complete agent platform**. Every GitHub repository ships with:

| GitHub Primitive | Agent Role |
|---|---|
| **Actions** | Compute — runs the agent on every trigger |
| **Git** | Memory — sessions, state, and history are commits |
| **Issues** | Interface — users converse with the agent through comments |
| **Webhooks** | Event bus — issues and comments trigger workflows |
| **Secrets** | Credential store — API keys stored securely, injected at runtime |
| **Collaborators** | Access control — only authorized users can trigger the agent |
| **API** | Control plane — the agent reads/writes via the GitHub REST API and `gh` CLI |

Rather than building infrastructure that mirrors these capabilities, `.GITOPENCLAW` uses them directly. The "deployment" is a folder. The "database" is git. The "auth system" is GitHub's collaborator model. The "monitoring dashboard" is the Actions log.

### 2. Directory Structure and Separation of Concerns

The `.GITOPENCLAW/` directory follows a strict separation:

```
.GITOPENCLAW/
├── AGENTS.md                   # Agent identity, personality, standing orders
├── GITOPENCLAW-ENABLED.md      # Sentinel file — delete to disable all workflows
├── config/
│   ├── settings.json           # Provider, model, thinking level, trust policy, limits
│   └── settings.schema.json    # JSON Schema for validation
├── lifecycle/
│   ├── GITOPENCLAW-ENABLED.ts  # Fail-closed guard (runs before everything)
│   ├── GITOPENCLAW-PREFLIGHT.ts # Configuration and structural validation
│   ├── GITOPENCLAW-INDICATOR.ts # 👀 reaction indicator (runs before install)
│   └── GITOPENCLAW-AGENT.ts    # Core orchestrator
├── install/
│   ├── GITOPENCLAW-INSTALLER.ts # One-time setup: copies workflows and templates
│   ├── GITOPENCLAW-WORKFLOW-AGENT.yml # Workflow template
│   ├── GITOPENCLAW-TEMPLATE-HATCH.md  # Issue template for first interaction
│   └── GITOPENCLAW-AGENTS.md   # Default agent identity template
├── state/
│   ├── .gitignore              # Excludes ephemeral runtime artifacts
│   ├── .gitattributes          # merge=union for memory.log
│   ├── issues/                 # Issue → session mappings (JSON per issue)
│   ├── sessions/               # Conversation transcripts (JSONL per session)
│   ├── memory.log              # Append-only persistent memory
│   ├── user.md                 # Agent-maintained user profile
│   ├── usage.log               # Token and cost tracking
│   └── identity/               # Agent identity state
├── docs/                       # Documentation (you are reading this)
├── tests/                      # Structural and behavioral tests
├── package.json                # Runtime dependency: openclaw
└── LICENSE.md                  # MIT license
```

**Mutability rules:**

| Concern | Location | Mutability |
|---|---|---|
| **Repository source code** | Outside `.GITOPENCLAW/` | Read-only — never modified by the agent |
| **Conversation state** | `.GITOPENCLAW/state/` | Mutable — committed as git audit trail |
| **Ephemeral runtime artifacts** | `.GITOPENCLAW/state/` (gitignored subdirs) | Ephemeral — caches, sqlite, sandbox regenerated each run |
| **Credentials** | GitHub Actions secrets only | Never stored in files |

### 3. Security Model

The security model is multi-layered and fail-closed:

- **Sentinel guard**: `GITOPENCLAW-ENABLED.md` must exist or all workflows are blocked. The `GITOPENCLAW-ENABLED.ts` script runs as the very first workflow step and calls `process.exit(1)` if the file is missing. A fresh clone or fork is inert by default.
- **Preflight validation**: `GITOPENCLAW-PREFLIGHT.ts` checks that all required files exist, `settings.json` conforms to its schema, and `state/.gitignore` contains entries that prevent accidental credential commits.
- **Collaborator gating**: The workflow checks the actor's permission level (`admin`, `maintain`, or `write`) before running. The configurable `trustPolicy` in settings further differentiates trusted users (full capabilities), semi-trusted roles (read-only responses), and untrusted actors (blocked or read-only).
- **Bot loop prevention**: The workflow condition filters out `github-actions[bot]` to prevent infinite conversation loops.
- **Scoped commits**: Only `.GITOPENCLAW/` changes are ever staged (`git add .GITOPENCLAW/`). Even if the OpenClaw runtime attempted to modify files outside this directory, those changes would never be committed or pushed.
- **Credential isolation**: API keys exist only in GitHub Actions secrets, injected as environment variables at runtime. No credentials are ever written to files.
- **Resource limits**: Configurable `maxTokensPerRun`, `maxToolCallsPerRun`, and `workflowTimeoutMinutes` in `settings.json` prevent runaway costs.

### 4. Session Continuity Model

The conversation persistence mechanism is the core trick that makes `.GITOPENCLAW` work without external databases:

```
Issue #42 (comment) →
  state/issues/42.json →
    { "sessionId": "issue-42", "sessionPath": "state/sessions/issue-42.jsonl" } →
      state/sessions/issue-42.jsonl (full conversation transcript)
```

Each issue number is a **stable conversation key**. When a user comments on issue #42 three weeks after opening it, the agent loads the linked session and continues with full context. The mapping and transcript files are committed to git, so session state survives across ephemeral GitHub Actions runners.

The copy-archive-restore cycle works as follows:
1. Before the agent runs, the session transcript is restored from `state/sessions/` to the OpenClaw runtime's internal directory.
2. The agent runs, appending new messages to the session.
3. After the run, the updated transcript is copied back to `state/sessions/` and committed.

### 5. Concurrency and Push Resilience

Multiple issues can trigger agent runs simultaneously. Each workflow run gets a unique concurrency group (`github-claw-<repo>-issue-<number>-<run_id>`), so no events are dropped. The push strategy uses a retry loop (up to 3 attempts with `git pull --rebase`) to handle concurrent state commits. Unreconcilable conflicts fail loudly with a clear error.

The `memory.log` file uses a `merge=union` git attribute, ensuring concurrent memory writes from different branches merge cleanly without conflicts.

### 6. The Fork-as-Installation Model

There is no installer binary, no global npm package, no hosted service. **The installation is a fork of the source repository.** This design means:

- **Zero install**: Fork → add an API key → open an issue → the agent responds.
- **Always up to date**: `git pull upstream main` brings new features, bug fixes, and security patches.
- **Full transparency**: Every line of the agent's code is in your repository.
- **No external service dependency**: The agent runs entirely within GitHub Actions.

For repositories that don't use Bun natively, the `GITOPENCLAW-INSTALLER.yml` bootstrap workflow automates a one-time setup: it copies workflows to `.github/workflows/`, converts `bun` references to `npm`/`node` equivalents, merges `.gitignore` rules, copies issue templates, and opens a PR for review.

### 7. Configuration System

All configuration lives in `.GITOPENCLAW/config/settings.json`, validated against `settings.schema.json` by the preflight script:

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-opus-4-6",
  "defaultThinkingLevel": "high",
  "trustPolicy": {
    "trustedUsers": ["username"],
    "semiTrustedRoles": ["write"],
    "untrustedBehavior": "read-only-response"
  },
  "limits": {
    "maxTokensPerRun": 10000000,
    "maxToolCallsPerRun": 1000,
    "workflowTimeoutMinutes": 120
  }
}
```

Supported providers include Anthropic, OpenAI, Google, Bedrock, and Ollama. Thinking levels (`none`, `low`, `medium`, `high`) control per-query reasoning depth. The trust policy enables fine-grained access control beyond GitHub's built-in collaborator permissions. Resource limits prevent cost overruns.

### 8. What OpenClaw Gains from .GITOPENCLAW

`.GITOPENCLAW` is not just a consumer of OpenClaw — it extends OpenClaw's reach into a new deployment model:

| What OpenClaw gains | How |
|---|---|
| **A zero-infrastructure deployment path** | Users who want an AI agent but not a server get one by copying a folder |
| **GitHub-native distribution** | Fork-as-installation means every fork is a new OpenClaw deployment |
| **A proof-of-concept for "GitHub as AI infrastructure"** | Demonstrates that Actions + git + Issues are sufficient for production agents |
| **An on-ramp for new users** | The simplest way to experience OpenClaw's capabilities without installing anything |
| **A showcase for the tool surface** | 30+ tools, semantic memory, media understanding, sub-agents — all demonstrable from a single folder |
| **An extension of the plugin ecosystem** | `.GITOPENCLAW` can load OpenClaw plugins, extending what the community can build |
| **A model for agent-per-repo at organizational scale** | Every repo in an org can have its own dedicated agent, scaling with GitHub's infrastructure |

### 9. What Makes .GITOPENCLAW Different from .GITCLAW

`.GITCLAW` (the predecessor) wraps the lightweight [Pi coding agent](https://github.com/badlogic/pi-mono) — 7 tools, grep-based memory, text-only input. `.GITOPENCLAW` wraps the full OpenClaw runtime:

| Capability | .GITCLAW (Pi) | .GITOPENCLAW (OpenClaw) |
|---|---|---|
| Tools | 7 (read, write, edit, bash, grep, find, ls) | 30+ (browser, web search, memory, sub-agents, etc.) |
| Memory | Flat text log with grep | Hybrid SQLite BM25 + vector embeddings |
| Media | Text only | Images, audio, video, PDFs |
| Sub-agents | Manual (tmux) | Native framework with lane isolation |
| Channels | stdin/stdout | 25+ messaging integrations |
| Plugins | File-based skills | Full SDK with manifests, hooks, config |
| Thinking control | Single level | Per-query directives (`@think`, `@reason`, `@elevated`) |

### 10. End-to-End Execution Sequence

```
1. User opens issue or posts comment
2. GitHub webhook fires → GITOPENCLAW-WORKFLOW-AGENT.yml triggers
3. Authorize step checks actor permission (admin/maintain/write)
4. Checkout: full repo history on default branch
5. Setup Bun + cache .GITOPENCLAW/node_modules
6. Guard: GITOPENCLAW-ENABLED.ts checks sentinel file exists
7. Preflight: GITOPENCLAW-PREFLIGHT.ts validates config and structure
8. Indicator: GITOPENCLAW-INDICATOR.ts adds 👀 reaction
9. Install: bun install --frozen-lockfile in .GITOPENCLAW/
10. Agent: GITOPENCLAW-AGENT.ts runs the full pipeline:
    a. Fetch issue content via GitHub API
    b. Resolve trust level from actor permission + trustPolicy
    c. Resolve or create session (state/issues/<n>.json → state/sessions/)
    d. Build prompt from issue/comment content
    e. Validate API key availability
    f. Invoke OpenClaw CLI: openclaw agent --local --json --message --thinking --session-id
    g. Monitor with timeout (5 min default + 10 sec grace)
    h. Extract assistant reply from structured JSON output
    i. Commit state changes to git (sessions, mappings, memory, usage)
    j. Push with retry loop (up to 3 attempts with git pull --rebase)
    k. Post reply as issue comment (capped at 60,000 chars)
    l. finally: remove 👀 reaction regardless of success/failure
```

---

## Description Variants for Different Contexts

### For a README badge / one-liner
> `.GITOPENCLAW` — An AI agent that lives in your GitHub repository, powered by OpenClaw.

### For a GitHub repository description
> Self-contained AI agent powered by OpenClaw. Drop the folder into any repo, add an API key, open an issue — the agent responds. No servers, no infrastructure. Git is the memory. Actions is the compute. Issues are the interface.

### For a blog post introduction
> What if deploying an AI agent was as simple as copying a folder into a git repository? `.GITOPENCLAW` makes that real. It packages the full OpenClaw runtime — 30+ tools, semantic memory, media understanding, and a plugin ecosystem — into a single directory that turns any GitHub repository into an autonomous, conversant AI agent. GitHub Actions provides the compute. Git provides the memory. Issues provide the conversation surface. There is nothing else to provision, nothing else to pay for, nothing else to maintain.

### For a technical conference abstract
> `.GITOPENCLAW` demonstrates that GitHub's native primitives — Actions (compute), git (storage), Issues (interface), webhooks (events), Secrets (credentials), and the Collaborator model (auth) — constitute a complete platform for deploying AI agents at scale. The system packages the OpenClaw runtime into a self-contained repository directory with a fail-closed security model, git-native session persistence, and a fork-based installation/update flow. Each repository becomes an isolated agent environment with its own identity, memory, and configuration. The architecture supports multi-workspace operation through issues, concurrent execution through unique concurrency groups, and organizational scaling through fork-based fleet deployment — all without external infrastructure.

### For an investor/stakeholder briefing
> `.GITOPENCLAW` is a distribution strategy for OpenClaw that achieves zero-infrastructure deployment. It packages the OpenClaw AI runtime into a single folder that lives inside any GitHub repository. Users "install" the agent by forking a repository and adding an API key — no servers, databases, or hosted services required. The agent converses through GitHub Issues, persists all state in git (fully auditable), and stays current through standard `git pull` updates. This model enables agent-per-repository deployment at organizational scale, where every repo in a GitHub organization can have its own dedicated AI agent at zero marginal infrastructure cost. The scaling model is GitHub's, not ours.

### For documentation cross-references
> `.GITOPENCLAW` is the GitHub-native deployment model for OpenClaw. It runs the full OpenClaw runtime inside GitHub Actions, triggered by issue events, with all state committed to git. See the [Quick Start](../GITOPENCLAW-QUICKSTART.md) for setup and [How It Currently Works](GITOPENCLAW-How-currently-works.md) for architecture details.
