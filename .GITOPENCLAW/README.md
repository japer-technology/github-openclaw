# japer-technology/gitopenclam 🦞 GH as Infrastructure

<p align="center">
  <picture>
    <img src="GITOPENCLAW-LOGO.png" alt="GitOpenClaw" width="500">
  </picture>
</p>

### An AI agent that lives in your GitHub repository — powered by OpenClaw

> Drop a folder. Push. Open an issue. Talk to your agent.

`.GITOPENCLAW` is a self-contained AI agent that runs entirely within GitHub Actions, powered by the [OpenClaw](https://github.com/openclaw/openclaw) runtime. No servers, no infrastructure, no accounts to create. Just a folder in your repo and an LLM API key.

---

## What it does

| Capability | Description |
|---|---|
| **Single folder** | Everything lives in `.GITOPENCLAW/` — drop it into any repo |
| **Zero infrastructure** | GitHub Actions + git + LLM API key. Nothing else. |
| **Persistent memory** | Conversations are stored as JSONL sessions committed to git |
| **Full auditability** | Every response, every decision, every file change is in git history |
| **OpenClaw-powered** | Access to 30+ tools, semantic memory, multi-channel capabilities |

## How it works

1. A user **creates a GitHub issue** (or comments on an existing one).
2. A GitHub Actions workflow triggers and runs the OpenClaw agent.
3. The agent reads the issue, thinks, and **replies as a comment**.
4. The entire conversation is **committed to git** for full auditability.
5. On the next comment, the agent **resumes the conversation** with full context.

## Quick start

See [GITOPENCLAW-QUICKSTART.md](GITOPENCLAW-QUICKSTART.md) for a 5-minute setup guide.

## Supported LLM providers

| Provider | Environment variable | Example model |
|---|---|---|
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-opus-4-6` |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o` |

More providers are supported by OpenClaw — see the [OpenClaw documentation](https://docs.openclaw.ai) for the full list.

## Security model

- **Fail-closed guard**: `GITOPENCLAW-ENABLED.md` must exist or all workflows are blocked
- **Owner/member-only**: The workflow checks collaborator permissions before running
- **Bot comment filtering**: The agent ignores its own comments to prevent loops
- **Git-native audit trail**: Every action is committed and visible in git history
- **GitHub-based credentials**: All API keys live in GitHub Actions secrets — no credentials stored in repository files
- **Scoped commits**: Only `.GITOPENCLAW/` state is committed; source code outside `.GITOPENCLAW/` is never modified

## Architecture — source stays raw

`.GITOPENCLAW` is designed around a strict separation:

| Concern | Location | Mutability |
|---|---|---|
| **Source code** | Repository root (outside `.GITOPENCLAW/`) | Read-only — never modified by the agent |
| **Runtime state** | `.GITOPENCLAW/state/` | Mutable — sessions, memory, mappings committed as audit trail |
| **OpenClaw internals** | `.GITOPENCLAW/state/` (gitignored subdirs) | Ephemeral — caches, sqlite, sandbox regenerated each run |
| **Credentials** | GitHub Actions secrets only | Never stored in files |

The agent reads the raw source code as workspace context but stores all runtime data (sessions, memory, sqlite, caches) inside `.GITOPENCLAW/state/` via `OPENCLAW_STATE_DIR`. This ensures the repository source remains untouched.

## Configuration

Settings are stored in `.GITOPENCLAW/config/settings.json`:

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-opus-4-6",
  "defaultThinkingLevel": "high"
}
```

## Directory structure

```
.GITOPENCLAW/
├── AGENTS.md                          # Agent identity and instructions
├── GITOPENCLAW-ENABLED.md             # Sentinel file (delete to disable)
├── config/
│   └── settings.json                  # Provider/model/thinking config
├── lifecycle/
│   ├── GITOPENCLAW-ENABLED.ts         # Fail-closed guard script
│   ├── GITOPENCLAW-INDICATOR.ts       # 👀 reaction indicator
│   └── GITOPENCLAW-AGENT.ts           # Core orchestrator
├── install/
│   ├── GITOPENCLAW-INSTALLER.ts       # One-time setup script
│   ├── GITOPENCLAW-WORKFLOW-AGENT.yml # Workflow template
│   └── ...                            # Templates and config
├── state/
│   ├── .gitignore                     # Excludes OpenClaw internals (caches, sqlite, etc.)
│   ├── memory.log                     # Append-only memory
│   ├── user.md                        # User profile
│   ├── issues/                        # Issue → session mappings
│   └── sessions/                      # Conversation transcripts
├── docs/                              # Documentation
├── build/                             # Build artifacts
└── tests/                             # Structural tests
```

## What makes .GITOPENCLAW different from .GITCLAW

`.GITCLAW` uses the lightweight [Pi coding agent](https://github.com/badlogic/pi-mono) as its engine.
`.GITOPENCLAW` uses the full **OpenClaw** runtime, which provides:

- **30+ tools** instead of 7 (browser, web search, web fetch, memory, and more)
- **Semantic memory** with vector embeddings instead of grep-based recall
- **Multi-channel awareness** for notifications beyond GitHub issues
- **Sub-agent orchestration** for parallel task execution
- **Media understanding** for images, audio, video, and PDFs
- **Plugin ecosystem** with a full SDK for community extensions
- **Thinking directives** for per-task reasoning control

See [GITOPENCLAW-Possibilities.md](GITOPENCLAW-Possibilities.md) for the full analysis.

## License

[MIT](LICENSE.md) — Copyright © 2026 Eric Mourant and Sawyer Hood
