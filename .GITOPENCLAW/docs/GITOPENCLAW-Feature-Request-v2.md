# Feature Request: GitHub as AI Infrastructure — Native `.GITOPENCLAW` Support in OpenClaw

## GitHub as AI Infrastructure

This feature request proposes first-class support for the `.GITOPENCLAW` pattern:
turning any GitHub repository into a fully functional AI agent runtime using only
GitHub-native primitives—Actions for compute, git for storage, Issues for conversation,
webhooks for events, and secrets for credentials.

**Reference implementation:** [japer-technology/github-openclaw](https://github.com/japer-technology/github-openclaw)
— a working proof that a single folder, a workflow file, and an LLM API key constitute
sufficient infrastructure for a persistent, auditable, conversational AI agent.

## Summary

Add native `.GITOPENCLAW` support to the OpenClaw runtime so that any GitHub repository can function as a fully operational AI agent by dropping in a single folder—no external servers, databases, or additional infrastructure required.

## Problem to Solve

**Running an AI agent today requires infrastructure that developers do not already have.**

Every existing agent platform demands a separate runtime: a SaaS dashboard, a database cluster, a queue system, webhook receivers, authentication middleware, and a pricing page. The agent lives *outside* the developer's repository and reaches *in* like a stranger. This creates several pain points:

1. **Infrastructure overhead** — Teams must provision, monitor, and pay for compute and storage that is entirely separate from their existing GitHub setup. For many teams this is a blocker: the operational burden outweighs the value.

2. **No auditability** — Agent decisions, tool calls, and memory reside in opaque SaaS databases. You cannot `git log` an agent's reasoning, `git blame` a bad decision, or `git revert` a hallucination. The agent's state is not version-controlled.

3. **No portability** — Agents are locked to the platform that hosts them. Moving an agent between projects means re-provisioning infrastructure, re-configuring credentials, and re-building integrations. There is no `cp -r` for agents.

4. **No scaling model aligned with how developers already work** — Developers scale by creating repositories. Each repository is an isolated, permissioned, CI-enabled workspace. Agent platforms, however, impose a fundamentally different scaling model: per-seat, per-token, per-API-call. There is no mechanism for "one agent per repo at zero marginal cost."

5. **Memory is ephemeral** — Most agent frameworks lose context between sessions. The workaround is an external database, which reintroduces the infrastructure overhead problem. Agent memory should be as durable and auditable as source code.

GitHub already provides every primitive an AI agent requires—compute (Actions), persistent storage (git), a user interface (Issues/PRs/Discussions), authentication (collaborator permissions), secrets management (Actions secrets), an event system (webhooks), and a complete audit trail (git history). The problem is that OpenClaw does not yet treat GitHub as a first-class deployment target.

## Proposed Solution

### Core: The `.GITOPENCLAW/` Folder Convention

A single folder dropped into any GitHub repository contains everything the agent needs:

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

### Conversation Model: Each Issue Number Is a Stable Session Key

```
Issue #42 → .GITOPENCLAW/state/issues/42.json → .GITOPENCLAW/state/sessions/<session>.jsonl
```

When a user comments on Issue #42 three weeks later, the agent loads the linked session and resumes with full context. No database lookups, no session cookies, no Redis—just a JSON pointer in a git-tracked file pointing to a git-tracked conversation log.

### Lifecycle Pipeline (GitHub Actions Workflow)

1. A user creates or comments on an issue.
2. `GITOPENCLAW-WORKFLOW-AGENT.yml` triggers on `issues` and `issue_comment` events.
3. **Guard** — Verifies that `GITOPENCLAW-ENABLED.md` exists (fail-closed: no sentinel means no execution).
4. **Preflight** — Validates configuration, checks collaborator permissions, and rejects bot-generated events.
5. **Indicator** — Adds a 🧠 reaction so the user knows the agent is processing.
6. **Agent** — The OpenClaw runtime processes the message with full tool access (30+ tools, semantic memory, media understanding, sub-agent orchestration).
7. **Reply** — The agent posts its response as an issue comment.
8. **Commit** — Session state is committed to git with retry logic for concurrent writes.
9. **Push** — State is pushed back to the repository.

### CLI Integration

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

### Security Model

- **Fail-closed:** Delete `GITOPENCLAW-ENABLED.md` and all workflows stop immediately.
- **Collaborator-only:** Only repository owners and members can trigger the agent.
- **Bot-loop prevention:** The agent ignores its own comments and other bot-generated events.
- **Read-only source:** The agent reads the codebase but never modifies files outside `.GITOPENCLAW/state/`.
- **Git-native audit:** Every action is a commit with full history—`git log`, `git blame`, and `git revert` all work.

### Scaling Model

- **As many agents as repos** — Each repository gets its own independent agent at zero marginal infrastructure cost.
- **Fork to clone** — Fork a repo and receive a fully configured agent with its own memory and personality.
- **`cp -r` portability** — Copy the `.GITOPENCLAW/` folder into any repo, push, and the agent is live.

## Alternatives Considered

1. **External agent platforms (LangChain, AutoGPT, CrewAI, etc.)** — All require separate infrastructure. They solve the "intelligence" problem but not the "where does it live" problem. Each adds a deployment target, a billing relationship, and an operational surface entirely separate from the developer's existing GitHub workflow. `.GITOPENCLAW` eliminates the infrastructure layer altogether by leveraging what developers already have.

2. **GitHub Apps / Bot accounts** — A GitHub App can respond to issues, but the App itself runs on external infrastructure (a server, a cloud function, or a container). The agent's state resides in an external database, and the scaling model is per-App rather than per-repo. `.GITOPENCLAW` inverts this: the agent runs *inside* the repo's own Actions, and state is committed to git.

3. **GitHub Copilot Extensions** — Copilot extensions are powerful but tightly coupled to the Copilot UI and Microsoft's infrastructure. They do not provide persistent agent memory, cannot be forked or cloned with a repository, and do not produce a git-auditable conversation history. `.GITOPENCLAW` is infrastructure-independent: any LLM provider, any model, with full git history.

4. **Self-hosted runners with persistent state** — This approach solves the state problem but reintroduces infrastructure overhead. The result is managing servers again. `.GITOPENCLAW` uses GitHub-hosted runners and commits state to git, achieving persistence without any infrastructure.

5. **Manual workflow dispatch with `workflow_dispatch`** — This works for one-shot tasks but does not support conversational interactions. The issue-as-conversation model in `.GITOPENCLAW` provides natural multi-turn dialogue with persistent context.

## Additional Context

### Working Proof of Concept

**[japer-technology/github-openclaw](https://github.com/japer-technology/github-openclaw)** is a live implementation of this pattern. The repository contains:

- A fully functional `.GITOPENCLAW/` folder with lifecycle scripts, configuration, and state management.
- A working GitHub Actions workflow that triggers on issue events.
- Committed conversation sessions demonstrating persistent, multi-turn agent dialogue.
- Complete documentation including an RFC-style paper: [GitHub as Infrastructure: From Test Case to Agentic Platform](https://github.com/japer-technology/github-openclaw/blob/main/.GITOPENCLAW/docs/GitHub-as-Infrastructure.md).

### The Core Insight

> GitHub is not just a host for AI agents—it **is** the infrastructure.
> Every repository is an isolated, fully provisioned agent environment.
> The agent does not live outside your repo and reach in. It lives **inside** your repo.
> Its memory is git commits. Its interface is Issues. Its compute is Actions.
> Everything is diffable, auditable, revertable, and forkable.
> **The repository is the application.**

### GitHub Primitives Mapped to Agent Requirements

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
