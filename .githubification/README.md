# Githubification of OpenClaw

A detailed assessment of the feasibility and architecture for serving OpenClaw's core functionality entirely from within GitHub Actions workflows, turning the repository into a GitHub-infrastructured application.

---

## 1. What OpenClaw Does Today

OpenClaw is a personal AI assistant runtime. Its core functionality comprises:

| Component | Purpose |
|---|---|
| **Gateway server** | HTTP + WebSocket control plane (Express + ws) on a configurable port (default 18789) |
| **AI agent** | Multi-provider LLM orchestration (Anthropic, OpenAI, Google, Bedrock, Ollama, etc.) with 30+ tools |
| **Messaging channels** | 25+ channel adapters (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, Matrix, Line, etc.) |
| **Memory** | Hybrid SQLite BM25 + vector embedding search with temporal decay |
| **Plugin system** | Full SDK for community extensions with manifest, hooks, and config schemas |
| **CLI** | Commander-based CLI with commands for gateway, agent, messages, sessions, cron, config, and more |
| **Web UI** | Lit-based control plane UI served from the gateway |
| **Media pipeline** | Image, audio, video, and PDF understanding via sharp, Playwright, pdfjs-dist |
| **Cron scheduler** | croner-based scheduled agent tasks with delivery dispatch |
| **Sub-agents** | Native sub-agent spawning with depth limits and lane isolation |
| **Native apps** | macOS (SwiftUI), iOS (SwiftUI), Android (Kotlin) companion apps |

The system is designed as a **single-user, local-first, always-on** assistant. Users install it globally via npm, run `openclaw onboard`, and the gateway persists as a daemon (launchd on macOS, systemd on Linux).

---

## 2. GitHub as Infrastructure: What It Provides

GitHub offers a surprisingly complete infrastructure stack when viewed through the lens of application hosting:

| Infrastructure need | GitHub equivalent |
|---|---|
| **Compute** | GitHub Actions runners (Ubuntu, macOS, Windows; 2-core to 64-core) |
| **Persistent storage** | Git repository (committed state), GitHub Artifacts (temporary), GitHub Packages (registry) |
| **Secrets management** | GitHub Actions secrets and environment variables |
| **Authentication** | Repository collaborator permissions, `GITHUB_TOKEN` scoping |
| **Event system** | Webhook triggers (issues, PRs, comments, pushes, schedules, `workflow_dispatch`) |
| **User interface** | GitHub Issues, Pull Requests, Discussions (markdown-native, rich media) |
| **API** | GitHub REST + GraphQL APIs (via `gh` CLI or `@octokit/rest`) |
| **Networking** | Outbound HTTPS from runners (for LLM APIs, messaging APIs) |
| **Logging** | Workflow run logs, step annotations, job summaries |
| **Scheduling** | `cron` triggers in workflow definitions |
| **Artifact exchange** | `actions/upload-artifact` / `actions/download-artifact` between jobs |
| **Container runtime** | Docker available on Linux runners for sandboxed execution |

---

## 3. Component-by-Component Feasibility Assessment

### 3.1 Gateway Server

**Current architecture**: Express HTTP server + WebSocket server binding to a local port, handling RPC calls, agent streaming, auth, rate limiting, and channel event routing.

**GitHub Actions feasibility**: **Partially feasible with significant constraints.**

- A GitHub Actions runner can start an HTTP/WebSocket server during a workflow run.
- The server is only alive for the duration of the workflow (max 6 hours, or 72 hours for self-hosted).
- There is no stable inbound URL. External access would require a tunnel (e.g., Cloudflare Tunnel, ngrok) started as a workflow step.
- **Verdict**: The long-running gateway model does not translate directly. However, a **request-response** model (start server, handle one request, shut down) is viable. The gateway can be started ephemerally per-event, process the interaction, and stop.

**Adaptation strategy**:
- Replace the persistent gateway with an **event-driven invocation** model: each GitHub event (issue, comment, PR, schedule) triggers a workflow that runs the agent for that specific interaction.
- For use cases that need a live gateway (real-time streaming, WebSocket clients), use a **tunnel step** that exposes the runner's port for the workflow's duration.

### 3.2 AI Agent

**Current architecture**: The agent runtime (`src/agents/`) orchestrates LLM calls with tool execution, context management, memory retrieval, thinking directives, and streaming output.

**GitHub Actions feasibility**: **Fully feasible.**

- The agent is a Node.js process that makes outbound HTTPS calls to LLM providers. GitHub Actions runners have full outbound internet access.
- LLM API keys are stored in GitHub Actions secrets.
- Agent execution is inherently request-response: receive a prompt, process it, return a reply.
- Tool execution (bash, file read/write, web fetch, web search) works identically on a runner.
- The `--session` flag enables multi-turn conversations by persisting session files to git.

**Adaptation strategy**:
- Invoke the agent via CLI (`openclaw agent --message "..." --session <path>`) or programmatic import.
- Persist session state by committing JSONL files to the repository after each interaction.
- Use GitHub Actions secrets for all LLM provider credentials.

### 3.3 Messaging Channels

**Current architecture**: 25+ channel adapters (WhatsApp via Baileys, Telegram via grammy, Slack via @slack/bolt, Discord via discord.js, Signal, iMessage, etc.) that maintain persistent connections to messaging APIs.

**GitHub Actions feasibility**: **Mixed — depends on the channel.**

| Channel type | Feasibility | Notes |
|---|---|---|
| **Webhook-based** (Slack, Discord webhooks, Telegram Bot API) | **High** | These are outbound HTTP POST calls. The agent can send messages to any webhook-based channel from a runner. |
| **Long-poll / WebSocket-based** (WhatsApp/Baileys, Discord gateway, Signal) | **Low** | These require persistent connections. A runner can maintain them for the workflow duration, but reconnection on each workflow run is expensive and may trigger rate limits or session invalidation. |
| **Local-only** (iMessage, BlueBubbles) | **Not feasible** | These require a local macOS device. GitHub's macOS runners cannot run iMessage. |
| **GitHub Issues** (as a channel) | **Native** | This is the natural "channel" for a GitHub-infrastructured agent. Issues, PRs, and Discussions are the conversation surface. |

**Adaptation strategy**:
- Make **GitHub Issues/PRs/Discussions** the primary conversation channel (already proven by the `.GITOPENCLAW` prototype in this repository).
- Support **outbound-only notifications** to webhook-based channels (Slack, Discord, Telegram) for cross-channel awareness.
- Drop persistent-connection channels (WhatsApp, Signal) from the GitHub-hosted mode; these remain available in the traditional self-hosted deployment.

### 3.4 Memory System

**Current architecture**: SQLite + sqlite-vec for hybrid BM25 full-text + vector embedding search, stored under `~/.openclaw/`.

**GitHub Actions feasibility**: **Feasible with git-committed state.**

- SQLite databases can be created and queried on a runner.
- The database file can be committed to the repository for persistence between workflow runs.
- At conversation scale (hundreds to low thousands of entries), SQLite databases remain small (< 10 MB) and are manageable in git.
- Vector embeddings require outbound calls to embedding providers (OpenAI, Google, Voyage AI), which are available from runners.

**Adaptation strategy**:
- Store the SQLite memory database under a state directory (e.g., `.githubification/state/memory/`).
- Commit the database after each workflow run.
- Use `.gitattributes` with `merge=binary` for the SQLite file to handle concurrent updates gracefully.
- For repositories with very high interaction volume, consider using GitHub Artifacts for ephemeral state and only committing a summary log.

### 3.5 Plugin System

**Current architecture**: Plugins are npm packages with a manifest (`openclaw.plugin.json`), loaded at runtime via jiti. They register tools, hooks, and channel adapters.

**GitHub Actions feasibility**: **Fully feasible.**

- Plugins are installed via `npm install` during the workflow setup step.
- Plugin configuration can live in the repository (e.g., `.githubification/config/plugins.json`).
- Community plugins from npm work identically on a runner as on a local machine.

**Adaptation strategy**:
- Include desired plugins in the `.githubification/package.json` dependencies.
- Cache `node_modules` via `actions/cache` to speed up subsequent runs.

### 3.6 CLI and Commands

**Current architecture**: Commander-based CLI with 30+ commands spanning gateway, agent, messages, sessions, cron, config, models, channels, and more.

**GitHub Actions feasibility**: **Fully feasible for agent-related commands.**

- Any CLI command that does not require a persistent server can be run directly in a workflow step.
- Commands like `openclaw agent`, `openclaw message send`, `openclaw memory search`, `openclaw config apply` work without modification.
- Commands that require an interactive terminal (TUI, onboard wizard) are not applicable in CI.

### 3.7 Web UI

**Current architecture**: Lit web-components UI served from the gateway at `/control`.

**GitHub Actions feasibility**: **Not directly feasible as a persistent UI.**

- The web UI requires a running gateway to serve it.
- For ephemeral workflows, a tunnel could expose the UI temporarily.
- More practically, **GitHub Issues and PR comments** become the UI in a githubified deployment.
- GitHub Job Summaries (`$GITHUB_STEP_SUMMARY`) can render rich markdown output as a post-run report.

**Adaptation strategy**:
- Use GitHub Issues/PRs as the primary interaction surface.
- Use GitHub Job Summaries for rich post-interaction reports (tables, charts, status dashboards).
- For advanced visualization needs, generate static HTML artifacts and upload them via `actions/upload-artifact` or deploy to GitHub Pages.

### 3.8 Cron and Scheduled Tasks

**Current architecture**: croner-based in-process scheduler that runs tasks at defined intervals.

**GitHub Actions feasibility**: **Natively supported.**

- GitHub Actions has built-in `schedule` triggers with cron syntax.
- Each scheduled workflow can invoke the agent with a specific prompt or task.
- This is actually **better** than the in-process scheduler in some ways: GitHub handles scheduling reliability, retry, and logging.

**Adaptation strategy**:
- Replace croner-based in-process cron with GitHub Actions `schedule` triggers.
- Define scheduled agent tasks as workflow files (e.g., `.github/workflows/daily-triage.yml`).
- Each scheduled workflow invokes `openclaw agent --message "..."` with the appropriate prompt.

### 3.9 Sub-Agents

**Current architecture**: Native sub-agent spawning within the same process with depth limits and lane isolation.

**GitHub Actions feasibility**: **Feasible within a single workflow run.**

- Sub-agents are in-process Node.js operations; they work identically on a runner.
- For cross-workflow sub-agent orchestration, use `workflow_dispatch` to trigger child workflows and `actions/upload-artifact` / `actions/download-artifact` to pass context.

### 3.10 Media Pipeline

**Current architecture**: sharp for image processing, Playwright for browser automation, pdfjs-dist for PDFs.

**GitHub Actions feasibility**: **Fully feasible on Linux runners.**

- sharp compiles native bindings but installs cleanly on Ubuntu runners.
- Playwright can install Chromium on runners (add a setup step).
- PDF extraction via pdfjs-dist is pure JavaScript.
- GitHub Issues support image attachments; the agent can download and process them.

---

## 4. Architecture for a Githubified OpenClaw

### 4.1 Event Model

Replace the persistent gateway with an event-driven architecture:

```
GitHub Event (issue, comment, PR, schedule, dispatch)
  → GitHub Actions workflow triggers
    → Runner installs OpenClaw (cached)
      → Agent processes the event
        → Reply posted as GitHub comment / PR review / Job Summary
          → State committed to git
            → Runner terminates
```

### 4.2 State Management

All state lives in the repository:

```
.githubification/
  state/
    sessions/         # JSONL conversation transcripts
    issues/           # Issue → session mappings
    memory/           # SQLite memory database
      index.sqlite
    .gitignore        # Exclude ephemeral caches
  config/
    settings.json     # Provider, model, thinking level
    tools.json        # Tool allowlist
    plugins.json      # Plugin configuration
```

State is committed after each workflow run using a dedicated bot commit:

```bash
git add .githubification/state/
git commit -m "state: update after issue #${ISSUE_NUMBER}"
git push
```

### 4.3 Interaction Flow

```
User creates issue "How do I optimize this query?"
  → workflow triggers on issues.opened
  → runner checks collaborator permissions (security gate)
  → runner loads session state from git
  → agent processes the question with full OpenClaw runtime
  → agent reply posted as issue comment
  → session state committed to git
  → workflow completes

User replies "Can you also add an index?"
  → workflow triggers on issue_comment.created
  → runner loads existing session from git
  → agent resumes conversation with full context
  → reply posted, state committed
```

### 4.4 Workflow Template

```yaml
name: OpenClaw Agent
on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]
  schedule:
    - cron: '0 9 * * 1'  # Weekly Monday triage

jobs:
  agent:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: actions/cache@v4
        with:
          path: .githubification/node_modules
          key: openclaw-${{ hashFiles('.githubification/package.json') }}
      - run: cd .githubification && npm install
      - run: node .githubification/agent.js
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 5. What Works Well in GitHub Actions

| Capability | Why it works |
|---|---|
| **Single-turn agent interactions** | Request-response fits the ephemeral runner model perfectly |
| **Multi-turn conversations via Issues** | Each comment triggers a workflow; session state persists in git |
| **Scheduled agent tasks** | GitHub cron triggers replace croner with better reliability |
| **Outbound notifications** | Agent can POST to Slack, Discord, Telegram webhooks from the runner |
| **Code analysis and PR reviews** | The agent has full repo access and can post review comments via the API |
| **Memory and recall** | SQLite-based memory persists in git; vector search works on runners |
| **Tool execution** | bash, file operations, web fetch, web search all work on runners |
| **Media understanding** | sharp, Playwright, pdfjs-dist install and run on Ubuntu runners |
| **Plugin ecosystem** | npm-based plugins install identically on runners |
| **Audit trail** | Every interaction is logged in git history (commits) and workflow logs |
| **Security** | GitHub secrets, collaborator permissions, and scoped tokens provide strong defaults |
| **Multi-repository agents** | Fork or copy the folder to any repo; each gets an independent agent |
| **Cost model** | GitHub Actions free tier (2,000 minutes/month) covers moderate usage |

---

## 6. What Does Not Translate

| Capability | Why it does not work | Mitigation |
|---|---|---|
| **Persistent WebSocket gateway** | Runners are ephemeral (max 6h) | Use event-driven model; tunnel for temporary live access |
| **Always-on channels** (WhatsApp, Signal, Discord gateway) | Require persistent connections | Use webhook-based channels only; or run a lightweight relay on a free tier service |
| **Local device integrations** (iMessage, BlueBubbles) | Require macOS hardware | Not applicable in cloud; keep for self-hosted mode |
| **Interactive TUI** | Requires a terminal | Use GitHub Issues as the interaction surface |
| **Web UI dashboard** | Requires a running server | Use Job Summaries, GitHub Pages, or artifact-hosted reports |
| **Real-time streaming** | Runners have no inbound connectivity by default | Post full responses as comments; or use tunnel for ephemeral streaming |
| **Low-latency responses** | Cold start (install + boot) adds 30-90 seconds | Cache aggressively; use lighter model tiers for quick interactions |
| **mDNS / local network discovery** | Runners are isolated VMs | Not applicable; direct API addressing only |
| **Companion app connectivity** (macOS/iOS/Android apps) | Apps expect a persistent local gateway | Not applicable in GitHub-hosted mode |
| **Voice / TTS delivery** | No audio output channel in GitHub | Generate audio files as artifacts if needed |

---

## 7. Hybrid Architecture: Best of Both Worlds

The strongest approach is not full replacement but a **hybrid model** where GitHub Actions handles event-driven tasks and a self-hosted gateway handles persistent tasks:

```
┌─────────────────────────────────────────┐
│           GitHub Repository              │
│                                          │
│  ┌──────────────────┐  ┌──────────────┐ │
│  │  GitHub Actions   │  │  Git State   │ │
│  │  (event-driven)   │  │  (sessions,  │ │
│  │                   │  │   memory,    │ │
│  │  • Issue agent    │  │   config)    │ │
│  │  • PR reviewer    │  │              │ │
│  │  • Cron tasks     │  └──────────────┘ │
│  │  • Notifications  │                   │
│  └────────┬──────────┘                   │
│           │                              │
└───────────┼──────────────────────────────┘
            │ shared state (git)
            │
┌───────────┼──────────────────────────────┐
│           ▼                              │
│  ┌──────────────────┐                    │
│  │  Self-Hosted      │  ┌──────────────┐ │
│  │  Gateway          │  │  Always-On   │ │
│  │  (persistent)     │  │  Channels    │ │
│  │                   │  │              │ │
│  │  • WebSocket API  │  │  • WhatsApp  │ │
│  │  • Web UI         │  │  • Signal    │ │
│  │  • Streaming      │  │  • Discord   │ │
│  │  • Native apps    │  │  • iMessage  │ │
│  └──────────────────┘  └──────────────┘ │
│                                          │
│         User's Device / Server           │
└──────────────────────────────────────────┘
```

In this model:
- **GitHub Actions** handles all event-driven, request-response interactions (issues, PRs, cron, dispatch).
- **Self-hosted gateway** handles persistent connections, real-time streaming, and native app connectivity.
- **Git** is the shared state layer; both modes read/write session and memory state via the repository.

---

## 8. Cost and Performance Analysis

### 8.1 GitHub Actions Costs

| Tier | Minutes/month | Estimated interactions/month | Cost |
|---|---|---|---|
| **Free** | 2,000 | ~400 (at ~5 min/interaction) | $0 |
| **Team** | 3,000 | ~600 | $4/user/month |
| **Enterprise** | 50,000 | ~10,000 | Included |
| **Self-hosted runners** | Unlimited | Unlimited | Your compute cost |

### 8.2 Cold Start Overhead

| Step | Time (uncached) | Time (cached) |
|---|---|---|
| Runner provisioning | 5-15s | 5-15s |
| Checkout | 2-5s | 2-5s |
| Node.js setup | 5-10s | 2-3s |
| `npm install` (OpenClaw) | 60-90s | 5-10s (from cache) |
| Agent execution | 5-120s (depends on model + tools) | Same |
| State commit + push | 3-5s | 3-5s |
| **Total** | **80-245s** | **22-158s** |

Caching `node_modules` is essential: it reduces the typical interaction time from ~2-3 minutes to under 30 seconds for simple queries.

### 8.3 LLM API Costs

These are identical to self-hosted deployment; the GitHub Actions layer adds no LLM cost overhead. The only variable is whether GitHub's outbound latency to LLM APIs differs from a user's local network (typically negligible).

---

## 9. Security Considerations

### 9.1 Strengths of the GitHub Model

- **Secrets management**: API keys never appear in code; they live in GitHub Actions secrets with scoped access.
- **Permission gating**: Workflows can check `github.actor` against collaborator permissions before running the agent.
- **Audit trail**: Every agent interaction is logged in workflow runs and committed to git history.
- **Token scoping**: `GITHUB_TOKEN` is automatically scoped to the repository with configurable permissions.
- **Network isolation**: Runners are ephemeral VMs; no persistent attack surface.

### 9.2 Risks to Mitigate

- **Prompt injection via Issues**: Untrusted users could craft issue text that manipulates the agent. Mitigate with collaborator-only gating and input sanitization.
- **State poisoning**: A malicious commit to the state directory could corrupt sessions or memory. Mitigate with branch protection rules and signed commits.
- **Secret exposure**: The agent's tool execution (bash, web fetch) could inadvertently log secrets. Mitigate with OpenClaw's existing secret-masking and tool sandboxing.
- **Resource abuse**: Long-running agent tasks could consume excessive Actions minutes. Mitigate with `timeout-minutes` on workflow jobs and model token limits.
- **Concurrent state writes**: Multiple simultaneous workflow runs could create git conflicts on state files. Mitigate with a `concurrency` group in the workflow definition and retry-with-rebase push logic.

---

## 10. Proof of Concept: .GITOPENCLAW

This repository already contains a working proof of concept in the `.GITOPENCLAW/` directory. It demonstrates:

- **Event-driven agent invocation** via `GITOPENCLAW-WORKFLOW-AGENT.yml` (triggers on `issues.opened` and `issue_comment.created`).
- **Fail-closed security** via `GITOPENCLAW-ENABLED.ts` sentinel check.
- **Collaborator permission gating** in the workflow's Authorize step.
- **Session persistence** via git-committed JSONL files under `state/sessions/`.
- **Issue-to-session mapping** under `state/issues/`.
- **Memory persistence** via append-only `state/memory.log`.
- **Configuration** via `config/settings.json` (provider, model, thinking level).

The `.GITOPENCLAW/GITOPENCLAW-Possibilities.md` document provides the detailed technical roadmap for expanding this proof of concept into a full-featured githubified agent.

---

## 11. Conclusion

**Can OpenClaw's main functionality be served from GitHub Actions?** Yes, with targeted architectural adaptations.

The core value proposition of OpenClaw — an AI agent that processes natural language, executes tools, maintains memory, and delivers replies — translates cleanly to an event-driven GitHub Actions model. The agent runtime, memory system, plugin ecosystem, media pipeline, and tool surface all run without modification on GitHub-hosted runners.

What changes is the **interaction model**: instead of a persistent gateway with real-time WebSocket streaming, the githubified version uses GitHub Issues as the conversation surface and GitHub Actions as the compute layer. This is not a degradation but a different deployment topology optimized for a different use case.

**What is fully preserved**:
- AI agent with 30+ tools and multi-provider LLM support
- Hybrid vector + full-text memory with semantic recall
- Plugin ecosystem and skill system
- Media understanding (images, PDFs, audio, video)
- Sub-agent orchestration
- Scheduled tasks (via GitHub cron triggers)
- Full audit trail (git history + workflow logs)
- Security model (secrets, permissions, sandboxing)

**What is traded away**:
- Persistent WebSocket gateway and real-time streaming
- Always-on messaging channel connections (WhatsApp, Signal, Discord)
- Native companion app connectivity (macOS, iOS, Android)
- Sub-second response latency (cold start adds 20-90 seconds)
- Interactive TUI and web dashboard

**What is gained**:
- Zero infrastructure management
- Infinite horizontal scaling (one agent per repository)
- GitHub-native audit trail and access control
- Built-in scheduling, secrets management, and artifact storage
- No server to maintain, monitor, or secure

The repository's existing `.GITOPENCLAW/` prototype validates this architecture. The path from proof of concept to production is incremental: expand the tool surface, enable advanced memory, add multi-channel outbound notifications, and build the plugin ecosystem — all within the constraints that GitHub Actions provides.

For teams and individuals who want a powerful AI assistant without managing infrastructure, a githubified OpenClaw is a compelling deployment model.
