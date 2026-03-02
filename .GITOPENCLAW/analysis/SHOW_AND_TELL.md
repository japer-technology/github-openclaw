# 🙌 GitOpenClaw — OpenClaw as a GitHub Action (zero-infrastructure AI agent in any repo)

I built **GitOpenClaw**: a self-contained implementation of OpenClaw that runs entirely inside GitHub Actions. Drop one folder into any repository — your issues become a conversational AI interface powered by the full OpenClaw runtime with 30+ tools, persistent memory, and multi-turn sessions. No servers, no infrastructure, no monthly bills.

**Repo:** https://github.com/japer-technology/github-openclaw

---

## What it does

Open a GitHub issue → OpenClaw agent wakes up, reads the conversation, thinks, replies as a comment, and commits its session state back to git. Every response, every decision, every file change is in your git history. The conversation persists across comments — the agent picks up exactly where it left off.

**It turns any GitHub repository into a fully provisioned agent environment:** compute (Actions), storage (git), secrets management (Actions secrets), and UI (Issues) — all built into infrastructure you already have.

## How it works

```
Issue created/commented
        ↓
  GitHub Actions workflow triggers
        ↓
  Guard check (fail-closed sentinel)
        ↓
  Preflight validation (config, structure, permissions)
        ↓
  👀 reaction added (visual feedback)
        ↓
  OpenClaw agent runs with full toolkit
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
├── install/                       # Installer for new repos
└── tests/                         # Structural + behavioral tests
```

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

## What makes this different

| Feature | GitOpenClaw | Typical GitHub bots |
|---------|-------------|-------------------|
| **Infrastructure** | GitHub Actions only | External server required |
| **State storage** | Git commits (auditable) | External DB |
| **Session memory** | Full JSONL transcripts | Stateless or limited |
| **Tools** | 30+ (web search, browser, memory, code analysis) | Usually 3-5 |
| **Security model** | Fail-closed + 3-tier trust | API key + hope |
| **Cost control** | Token/tool budgets per run | Usually none |
| **Installation** | Copy one folder | Deploy a service |

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

1. Copy the `.GITOPENCLAW/` folder into your repo
2. Copy the workflow file to `.github/workflows/`
3. Add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) to your repo secrets
4. Push — and open an issue to talk to your agent

That's it. No servers to provision, no Docker containers, no cloud accounts. GitHub is the entire stack.

## What I learned

Building this taught me that GitHub already provides everything an AI agent needs: compute, persistent storage, secrets, a UI, and an event system. The key insight was treating git itself as the agent's memory — every conversation becomes a permanent, auditable, diffable artifact. The fail-closed sentinel pattern (`GITOPENCLAW-ENABLED.md`) was crucial for safety: the agent physically cannot activate unless you opt in.

The hardest part was conflict resolution for concurrent conversations. The retry loop with exponential backoff and `rebase -X theirs` handles the common case well, but I'd love to hear if anyone has a cleaner approach.

---

**Feedback welcome!** I'd love to hear from the community — especially ideas about:
- Better approaches to concurrent state commits
- Additional trust tiers or permission models
- What slash commands would be most useful
- Any security concerns I may have missed

🦞
