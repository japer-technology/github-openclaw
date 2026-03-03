# Feature Request: GitHub as AI Infrastructure — .GITOPENCLAW native support in OpenClaw

## GitHub as AI Infrastructure

This feature request proposes first-class support for the `.GITOPENCLAW` pattern:
turning any GitHub repository into a fully functional AI agent runtime using only
GitHub-native primitives — Actions for compute, git for storage, Issues for conversation,
webhooks for events, and secrets for credentials.

**Reference implementation**: [japer-technology/github-openclaw](https://github.com/japer-technology/github-openclaw)
— a working proof that a single folder, a workflow file, and an LLM API key are
sufficient infrastructure for a persistent, auditable, conversational AI agent.

## Summary

Add native `.GITOPENCLAW` support to the OpenClaw runtime so that any GitHub repository can become a fully functional AI agent by dropping in a single folder — no external servers, databases, or infrastructure required.

## Problem to solve

**Today, running an AI agent requires infrastructure that developers don't already have.**

Every existing agent platform demands a separate runtime: a SaaS dashboard, a database cluster, a queue system, webhook receivers, auth middleware, and a pricing page. The agent lives *outside* the developer's repository and reaches *in* like a stranger. This creates several pain points:

1. **Infrastructure overhead** — Teams must provision, monitor, and pay for compute and storage that is completely separate from their existing GitHub setup. For many teams, this is a blocker: the operational burden outweighs the value.

2. **No auditability** — Agent decisions, tool calls, and memory live in opaque SaaS databases. You cannot `git log` an agent's reasoning. You cannot `git blame` a bad decision. You cannot `git revert` a hallucination. The agent's state is not version-controlled.

3. **No portability** — Agents are locked to the platform that hosts them. Moving an agent between projects means re-provisioning infrastructure, re-configuring credentials, and re-building integrations. There is no `cp -r` for agents.

4. **No scaling model that matches how developers already work** — Developers scale by creating repositories. Each repo is an isolated, permissioned, CI-enabled workspace. But agent platforms force a completely different scaling model: per-seat, per-token, per-API-call. There is no "one agent per repo at zero marginal cost."

5. **Memory is ephemeral** — Most agent frameworks lose context between sessions. The workaround is an external database, which reintroduces the infrastructure overhead problem. Agent memory should be as durable and auditable as source code.

GitHub already provides every primitive an AI agent needs — compute (Actions), persistent storage (git), user interface (Issues/PRs/Discussions), authentication (collaborator permissions), secrets management (Actions secrets), an event system (webhooks), and a complete audit trail (git history). The problem is that OpenClaw doesn't yet treat GitHub as a first-class deployment target.

## Proposed solution

### Core: the `.GITOPENCLAW/` folder convention

A single folder dropped into any GitHub repository that contains everything the agent needs:

```
.GITOPENCLAW/
├── GITOPENCLAW-ENABLED.md          # Sentinel file (delete to disable — fail-closed)
├── AGENTS.md                       # Agent personality, instructions, skills
├── config/
│   └── settings.json               # LLM provider, model, thinking level
├── lifecycle/
│   ├── GITOPENCLAW-ENABLED.ts      # Fail-closed guard
│   ├── GITOPENCLAW-PREFLIGHT.ts    # Config & permission validation
│   ├── GITOPENCLAW-INDICATOR.ts    # 🧠 emoji reaction for user feedback
│   └── GITOPENCLAW-AGENT.ts        # Core orchestrator
├── state/
│   ├── issues/{N}.json             # Issue-to-session mapping
│   ├── sessions/*.jsonl            # Conversation logs (git-committed)
│   └── memory.log                  # Append-only semantic memory
└── install/
    └── GITOPENCLAW-WORKFLOW-AGENT.yml  # GitHub Actions workflow template
```

### Conversation model: each issue number is a stable session key

```
Issue #42 → .GITOPENCLAW/state/issues/42.json → .GITOPENCLAW/state/sessions/<session>.jsonl
```

When a user comments on issue #42 three weeks later, the agent loads the linked session and resumes with full context. No database lookups. No session cookies. No Redis. Just a JSON pointer in a git-tracked file pointing to a git-tracked conversation log.

### Lifecycle pipeline (GitHub Actions workflow)

1. User creates/comments on an issue
2. `GITOPENCLAW-WORKFLOW-AGENT.yml` triggers on `issues` and `issue_comment` events
3. **Guard** — verifies `GITOPENCLAW-ENABLED.md` exists (fail-closed: no sentinel = no execution)
4. **Preflight** — validates config, checks collaborator permissions, rejects bot-generated events
5. **Indicator** — adds 🧠 reaction so the user knows the agent is thinking
6. **Agent** — OpenClaw runtime processes the message with full tool access (30+ tools, semantic memory, media understanding, sub-agent orchestration)
7. **Reply** — agent posts response as an issue comment
8. **Commit** — session state committed to git with retry logic for concurrent writes
9. **Push** — state pushed back to the repository

### CLI integration

```bash
# Initialize .GITOPENCLAW in any repo
openclaw github init

# Configure provider and model
openclaw github config --provider anthropic --model claude-sonnet-4-20250514

# Test the agent locally before pushing
openclaw github test --issue 1

# Check agent status
openclaw github status
```

### Security model

- **Fail-closed**: delete `GITOPENCLAW-ENABLED.md` → all workflows stop immediately
- **Collaborator-only**: only repo owners/members can trigger the agent
- **Bot-loop prevention**: agent ignores its own comments and other bot-generated events
- **Read-only source**: agent reads the codebase but never modifies files outside `.GITOPENCLAW/state/`
- **Git-native audit**: every action is a commit with full history — `git log`, `git blame`, `git revert` all work

### Scaling model

- **As many agents as repos** — each repository gets its own independent agent at zero marginal infrastructure cost
- **Fork to clone** — fork a repo, get a fully configured agent with its own memory and personality
- **`cp -r` portability** — copy the `.GITOPENCLAW/` folder into any repo, push, done

## Alternatives considered

1. **External agent platforms (LangChain, AutoGPT, CrewAI, etc.)** — all require separate infrastructure. They solve the "intelligence" problem but not the "where does it live" problem. Each adds a deployment target, a billing relationship, and an operational surface that is completely separate from the developer's existing GitHub workflow. `.GITOPENCLAW` eliminates the entire infrastructure layer by using what developers already have.

2. **GitHub Apps / Bot accounts** — a GitHub App can respond to issues, but the App itself runs on external infrastructure (a server, a cloud function, a container). The agent's state lives in an external database. The scaling model is per-App, not per-repo. `.GITOPENCLAW` inverts this: the agent runs *inside* the repo's own Actions, and state is committed to git.

3. **GitHub Copilot Extensions** — Copilot extensions are powerful but tightly coupled to the Copilot UI and Microsoft's infrastructure. They don't provide persistent agent memory, can't be forked/cloned with a repo, and don't produce a git-auditable conversation history. `.GITOPENCLAW` is infrastructure-independent: any LLM provider, any model, full git history.

4. **Self-hosted runners with persistent state** — this solves the state problem but reintroduces infrastructure overhead. You're back to managing servers. `.GITOPENCLAW` uses GitHub-hosted runners and commits state to git, achieving persistence without any infrastructure.

5. **Manual workflow dispatch with `workflow_dispatch`** — works for one-shot tasks but doesn't support conversational interactions. The issue-as-conversation model in `.GITOPENCLAW` provides natural multi-turn dialogue with persistent context.

## Additional context

### Working proof of concept

**[japer-technology/github-openclaw](https://github.com/japer-technology/github-openclaw)** is a live implementation of this pattern. The repository contains:

- A fully functional `.GITOPENCLAW/` folder with lifecycle scripts, configuration, and state management
- A working GitHub Actions workflow that triggers on issue events
- Committed conversation sessions demonstrating persistent, multi-turn agent dialogue
- Complete documentation including an RFC-style paper: [GitHub as Infrastructure: From Test Case to Agentic Platform](https://github.com/japer-technology/github-openclaw/blob/main/.GITOPENCLAW/docs/GitHub-as-Infrastructure.md)

### The core insight

> GitHub is not just a host for AI agents — it **is** the infrastructure.
> Every repository is an isolated, fully provisioned agent environment.
> The agent doesn't live outside your repo and reach in. It lives **inside** your repo.
> Its memory is git commits. Its interface is Issues. Its compute is Actions.
> Everything is diffable, auditable, revertable, and forkable.
> **The repository is the application.**

### GitHub primitives mapped to agent requirements

| Agent Requirement | GitHub Primitive |
|---|---|
| Compute | GitHub Actions (workflow runners) |
| Persistent storage | Git (commits, branches, history) |
| User interface | Issues, Pull Requests, Discussions |
| Authentication | GitHub identity, collaborator permissions |
| Secrets management | GitHub Actions secrets |
| Event system | Webhooks, workflow triggers |
| Audit trail | Git log, commit history, blame |
| Access control | Repository permissions |
| Distribution | Fork, clone, copy a folder |
