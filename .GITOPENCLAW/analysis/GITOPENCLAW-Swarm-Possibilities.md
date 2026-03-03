# GITOPENCLAW Swarm Possibilities

### Multi-repo OpenClaw agent collaboration — turning GitHub into a distributed AI swarm

---

## Executive Summary

A single `.GITOPENCLAW` agent living in one repository is already powerful: it has 30+ tools, persistent memory, multi-turn conversations, and the full OpenClaw runtime. But the real unlock comes when you have *many* of them — each repo hosting its own fully functional OpenClaw intelligence — and they learn to work together.

GitHub already provides every primitive you need for a swarm: isolated compute per repo (Actions), persistent state (git), authenticated messaging (API + webhooks), scoped secrets, and a built-in orchestration layer (workflow dispatch, repository dispatch, webhook events). Each repository is a self-contained agent node. The question is not whether a swarm is possible — it is how to wire the nodes together and what emergent capabilities that produces.

This document analyzes the architectural patterns, communication mechanisms, coordination strategies, and concrete use cases for a multi-repo OpenClaw swarm — and lays out a path to building it.

---

## 1. The Swarm Model

### 1.1 What Is a Swarm in This Context

A **swarm** is a network of `.GITOPENCLAW`-powered repositories where each repository:
- Hosts its own OpenClaw agent with independent identity, memory, and configuration
- Can send messages to and receive messages from agents in other repositories
- Operates autonomously on its own repo's issues, PRs, and code
- Can be enlisted to perform work on behalf of another agent

Each node in the swarm is **fully self-contained**. It has its own `AGENTS.md` (identity), its own `config/settings.json` (provider/model/tools), its own `state/` directory (sessions/memory), and its own GitHub Actions secrets (credentials). No shared infrastructure exists outside GitHub itself.

### 1.2 Why GitHub Makes This Natural

| GitHub Primitive | Swarm Function |
|---|---|
| **Repository** | Isolated agent node with its own compute, state, and identity |
| **GitHub Actions** | Per-node compute with up to 20 concurrent jobs |
| **Repository dispatch** | Inter-node messaging (repo A triggers a workflow in repo B) |
| **Workflow dispatch** | External or cross-repo job triggering with typed inputs |
| **GitHub API** | Authenticated read/write to any repo the token can access |
| **Issues / Comments** | Conversational interface and audit trail per node |
| **Secrets** | Per-node credential isolation |
| **Artifacts** | Ephemeral data sharing between workflow runs |
| **Git itself** | Persistent, versioned state with merge semantics |

The key insight: GitHub's repository model already enforces the isolation, authentication, and state management boundaries that distributed systems need. Each repo is a process; GitHub API is the IPC layer; git is the durable store.

---

## 2. Communication Mechanisms

For agents across repos to collaborate, they need reliable ways to signal, request, and exchange data. GitHub provides several built-in options.

### 2.1 Repository Dispatch (Primary)

The `repository_dispatch` event is the cleanest inter-agent channel. Repo A can trigger a workflow in Repo B by sending a dispatch event via the GitHub API:

```bash
gh api repos/{owner}/{repo-b}/dispatches \
  -f event_type="swarm-request" \
  -f client_payload[from]="repo-a" \
  -f client_payload[task]="review this PR" \
  -f client_payload[callback_issue]="repo-a#42" \
  -f client_payload[context]="$(cat context.json)"
```

Repo B's workflow catches the event:

```yaml
on:
  repository_dispatch:
    types: [swarm-request]
```

The `client_payload` carries structured data (up to 10 MB). The receiving agent processes the request and can reply by:
1. Commenting on the callback issue in Repo A
2. Sending its own `repository_dispatch` back to Repo A
3. Creating a cross-repo issue

**Pros**: Native GitHub event, no polling, typed payloads, authenticated via `GITHUB_TOKEN` or PAT.
**Cons**: Requires a token with `repo` scope for the target repository. Payload size limit of 10 MB.

### 2.2 Workflow Dispatch (Typed Invocation)

For cases where the target agent exposes well-defined "APIs," `workflow_dispatch` allows typed inputs:

```yaml
on:
  workflow_dispatch:
    inputs:
      task:
        description: "Task for the agent to perform"
        required: true
        type: string
      caller_repo:
        description: "Repository requesting the work"
        required: true
        type: string
      callback_ref:
        description: "Issue or PR to reply to"
        required: false
        type: string
```

This is cleaner for structured, well-defined inter-agent calls — essentially a typed RPC interface.

### 2.3 Cross-Repo Issue Comments (Conversational)

An agent in Repo A can comment on an issue in Repo B using the GitHub API:

```bash
gh api repos/{owner}/{repo-b}/issues/{n}/comments \
  -f body="@agent I need you to analyze the dependency graph in this repo."
```

If Repo B's agent workflow triggers on `issue_comment.created`, this becomes a conversational channel. The advantage is that the conversation is human-readable and auditable in both repos.

### 2.4 Shared State Repository (Coordination Hub)

A dedicated "swarm-state" repository can serve as a shared coordination layer:

```
swarm-state/
├── registry/
│   ├── repo-a.json          # Agent capabilities, status, availability
│   ├── repo-b.json
│   └── repo-c.json
├── tasks/
│   ├── pending/
│   │   └── task-001.json    # Unassigned swarm tasks
│   ├── active/
│   │   └── task-002.json    # Claimed by an agent
│   └── completed/
│       └── task-003.json    # Finished with results
├── knowledge/
│   └── shared-findings.jsonl  # Cross-agent knowledge base
└── config/
    └── swarm-policy.json    # Global routing, priority, cost rules
```

Agents poll or dispatch against this central repo. Git's merge semantics handle concurrent writes (with the same retry-rebase pattern `.GITOPENCLAW` already uses for its own state).

### 2.5 GitHub Actions Artifacts (Ephemeral Data Exchange)

For large payloads that don't belong in git (screenshots, generated reports, binary analysis results), agents can upload artifacts to their own workflow run and reference them by URL in cross-repo messages.

---

## 3. Swarm Topologies

How agents are organized determines what the swarm can do. Several topologies are natural fits for GitHub's model.

### 3.1 Hub-and-Spoke (Coordinator Pattern)

```
            ┌─────────┐
            │  Hub     │
            │  Agent   │
            └────┬────┘
        ┌────────┼────────┐
        ▼        ▼        ▼
   ┌────────┐ ┌────────┐ ┌────────┐
   │ Spoke  │ │ Spoke  │ │ Spoke  │
   │ Agent  │ │ Agent  │ │ Agent  │
   │ (API)  │ │(Front) │ │(Infra) │
   └────────┘ └────────┘ └────────┘
```

One repository acts as the **coordinator**. Users interact with the hub agent, which decomposes tasks and dispatches subtasks to spoke agents. Each spoke is specialized:

| Spoke | Repository | Specialization |
|---|---|---|
| API Agent | `org/api-service` | Backend code, database schemas, API design |
| Frontend Agent | `org/web-app` | React components, CSS, accessibility |
| Infra Agent | `org/infrastructure` | Terraform, CI/CD, deployment configs |
| Docs Agent | `org/documentation` | Technical writing, API docs, user guides |
| Security Agent | `org/security-policies` | Vulnerability scanning, compliance, CVE analysis |

The hub agent maintains a **task ledger** — tracking which subtasks have been dispatched, which are complete, and how to aggregate results into a final response.

**Use case**: A user opens an issue on the hub repo: "Add a `/users/export` endpoint that returns CSV." The hub agent:
1. Dispatches API design to `org/api-service` agent
2. Dispatches frontend download button to `org/web-app` agent
3. Dispatches API documentation to `org/documentation` agent
4. Aggregates results and reports back

### 3.2 Peer-to-Peer (Flat Mesh)

```
   ┌────────┐     ┌────────┐
   │ Agent  │◄───►│ Agent  │
   │   A    │     │   B    │
   └───┬────┘     └───┬────┘
       │              │
       ▼              ▼
   ┌────────┐     ┌────────┐
   │ Agent  │◄───►│ Agent  │
   │   C    │     │   D    │
   └────────┘     └────────┘
```

No central coordinator. Each agent can request help from any other agent it knows about. Agents discover each other through a shared registry (a state repo or a well-known config file).

**Use case**: Agent A is working on a frontend bug. It realizes the bug is caused by a backend API returning incorrect data. Agent A directly dispatches a request to Agent B (the API repo's agent): "Your `/users` endpoint returns `null` for `email` when the user hasn't verified. Should this be `null` or omitted?" Agent B investigates its own codebase, replies, and Agent A continues.

### 3.3 Hierarchical (Multi-Level Delegation)

```
   ┌────────────┐
   │ Executive  │
   │   Agent    │
   └─────┬──────┘
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│ Team   │ │ Team   │
│ Lead A │ │ Lead B │
└───┬────┘ └───┬────┘
  ┌─┴─┐     ┌─┴─┐
  ▼   ▼     ▼   ▼
┌───┐┌───┐┌───┐┌───┐
│ W1││ W2││ W3││ W4│
└───┘└───┘└───┘└───┘
```

Three-tier hierarchy: executive agent (strategic decisions), team lead agents (decomposition and coordination), worker agents (execution). This mirrors how engineering organizations actually function.

**Use case**: Quarterly planning. The executive agent receives high-level objectives, breaks them into team-level goals, dispatches to team leads, who further decompose into repo-level tasks for worker agents.

### 3.4 Pipeline (Sequential Handoff)

```
   ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
   │ Intake │───►│ Triage │───►│ Build  │───►│ Deploy │
   │ Agent  │    │ Agent  │    │ Agent  │    │ Agent  │
   └────────┘    └────────┘    └────────┘    └────────┘
```

Agents form a processing pipeline. Each stage handles one concern and passes structured output to the next. Git commits at each stage provide a full audit trail.

**Use case**: Bug report pipeline. The intake agent validates and structures the report, the triage agent classifies severity and routes it, the build agent creates a fix PR, and the deploy agent handles release notes and deployment.

---

## 4. Coordination Challenges and Solutions

### 4.1 Consistency

**Problem**: Two agents may make conflicting decisions based on stale information (Agent A decides to delete an API endpoint; Agent B is building a feature that depends on it).

**Solution**: Use the shared state repo as a **coordination log**. Before making destructive changes, agents publish their intent and check for conflicts:

```json
{
  "intent": "deprecate-endpoint",
  "agent": "org/api-service",
  "target": "DELETE /users/legacy",
  "published": "2026-03-03T00:00:00Z",
  "conflicts_with": ["org/web-app"]
}
```

The target agents can ack or nack the intent before execution proceeds.

### 4.2 Ordering and Idempotency

**Problem**: GitHub Actions does not guarantee event delivery order. Two `repository_dispatch` events may arrive out of sequence.

**Solution**: Include a monotonic sequence number or timestamp in every cross-agent message. Receiving agents buffer out-of-order messages and process them in sequence. Each message also carries an idempotency key so duplicate deliveries are safely ignored.

### 4.3 Failure and Retry

**Problem**: An agent's workflow run may fail (timeout, transient error, rate limit). The calling agent needs to know.

**Solution**: Every cross-agent request includes a `callback_issue` or `callback_dispatch` field. The receiving agent reports success or failure back. If no response arrives within a configurable timeout, the caller retries (with exponential backoff) or escalates to a human.

```json
{
  "task_id": "task-042",
  "status": "failed",
  "error": "GitHub Actions runner timed out after 6 hours",
  "retryable": true,
  "from": "org/api-service"
}
```

### 4.4 Cost Control

**Problem**: A swarm of agents triggering each other can create runaway GitHub Actions usage.

**Solution**: Implement a **cost budget** in the swarm policy:

```json
{
  "daily_dispatch_limit": 50,
  "max_chain_depth": 3,
  "cooldown_minutes": 5,
  "cost_tracking_repo": "org/swarm-state"
}
```

Each agent checks the shared cost ledger before dispatching. If the daily limit is reached, requests are queued rather than executed immediately. Chain depth limits prevent infinite dispatch loops (Agent A → B → A → B → ...).

### 4.5 Identity and Trust

**Problem**: How does Agent B verify that a dispatch event actually came from Agent A and not an unauthorized source?

**Solution**: Use a combination of:
1. **GitHub token scoping**: The `GITHUB_TOKEN` used for dispatch is scoped to the source repo. The receiving workflow can verify the sender via `github.event.client_payload.from` and cross-check with a trust registry.
2. **Shared secret**: A swarm-wide secret stored in each repo's Actions secrets, included as an HMAC signature in payloads.
3. **Registry-based allowlist**: The swarm state repo maintains an explicit list of authorized agent repos. Unknown senders are rejected.

---

## 5. Emergent Capabilities

When agents can communicate and coordinate, capabilities emerge that no single agent possesses.

### 5.1 Cross-Repo Semantic Search

Each agent has its own memory (SQLite + vector embeddings) scoped to its repo. In a swarm, an agent can broadcast a semantic search query to all other agents:

1. Agent A sends: "Has anyone encountered a race condition in the WebSocket reconnection logic?"
2. Each agent searches its local memory and returns relevant hits with similarity scores
3. Agent A aggregates and ranks the results

This creates a **distributed knowledge base** across the entire organization — without centralizing any data. Each repo retains ownership of its memories; search is federated.

### 5.2 Coordinated Refactoring

A cross-cutting refactoring (rename a shared type, update an API contract, migrate a dependency) can be orchestrated across multiple repos simultaneously:

1. The coordinator agent publishes a refactoring plan with per-repo change descriptions
2. Each repo's agent creates a branch, applies its changes, and opens a PR
3. The coordinator waits for all PRs to pass CI
4. The coordinator merges all PRs in dependency order (or flags conflicts for human review)

This turns a multi-repo refactoring — normally a week-long manual coordination effort — into a single swarm operation.

### 5.3 Distributed Code Review

When a PR is opened in Repo A, its agent can request specialized review from other agents:

| Reviewer Agent | Repo | Review Focus |
|---|---|---|
| Security Agent | `org/security` | Vulnerability patterns, secret exposure, injection risks |
| Performance Agent | `org/benchmarks` | Algorithmic complexity, memory allocation, hot paths |
| API Compatibility Agent | `org/api-contracts` | Breaking changes, schema drift, backward compatibility |
| Docs Agent | `org/documentation` | Whether the change needs user-facing documentation |

Each reviewer agent comments on the PR with its findings. The source agent aggregates feedback into a summary comment.

### 5.4 Incident Response Swarm

When a production incident occurs:

1. A monitoring webhook creates an issue in the `org/incidents` repo
2. The incident agent activates and dispatches investigation requests to all potentially affected service repos
3. Each service agent checks recent deployments, log anomalies, and configuration changes
4. Results are aggregated into a timeline: "Service B deployed a schema migration 20 minutes before the incident; Service C's error rate spiked 5 minutes later"
5. The incident agent proposes a remediation plan

### 5.5 Automated Dependency Propagation

When a shared library is updated:

1. The library repo's agent tags a new release
2. It dispatches "dependency-update" to all consumer repos registered in the swarm
3. Each consumer agent updates its `package.json`/`go.mod`/`Cargo.toml`, runs tests, and opens a PR
4. Agents that encounter test failures report back with details
5. The library agent aggregates compatibility results: "15/18 consumers updated successfully; 3 need manual intervention"

### 5.6 Knowledge Synthesis

A "research agent" can be tasked with a question that requires knowledge spanning multiple repos:

1. "How does a user request flow from the web frontend to the database?"
2. The research agent dispatches targeted questions to each service agent along the path
3. Each agent examines its own codebase and returns a description of its segment
4. The research agent stitches the responses into a complete end-to-end flow diagram

No single agent knows the full picture. The swarm collectively does.

---

## 6. Implementation Roadmap

### Phase 1: Point-to-Point Dispatch (Foundation)

**Goal**: Two `.GITOPENCLAW` repos can send tasks to each other and receive responses.

| Task | Complexity |
|---|---|
| Define `swarm-request` / `swarm-response` dispatch event schema | Low |
| Add dispatch handler to `GITOPENCLAW-WORKFLOW-AGENT.yml` | Medium |
| Implement `swarm-dispatch.ts` lifecycle script (send dispatch, track pending) | Medium |
| Implement callback handling (receive response, post to original issue) | Medium |
| Add chain-depth and rate limiting to prevent loops | Low |
| Add swarm configuration to `config/settings.json` (`swarm.peers`, `swarm.enabled`) | Low |
| Create `phase-swarm.test.js` structural tests | Medium |

### Phase 2: Registry and Discovery

**Goal**: Agents can discover each other's capabilities and route requests intelligently.

| Task | Complexity |
|---|---|
| Define agent capability manifest schema (`swarm-manifest.json`) | Low |
| Create shared state repo pattern with `registry/`, `tasks/` directories | Medium |
| Implement capability-based routing (match task type to agent specialization) | Medium |
| Add health checking (is the target agent active and responsive?) | Low |
| Implement task queue with claim semantics (prevent duplicate processing) | Medium |

### Phase 3: Coordinator Pattern

**Goal**: A hub agent can decompose tasks and orchestrate multi-agent workflows.

| Task | Complexity |
|---|---|
| Implement task decomposition in coordinator agent | High |
| Build result aggregation and conflict detection | High |
| Add progress tracking and timeout handling | Medium |
| Implement dependency-ordered execution (task B waits for task A) | Medium |
| Create cross-repo PR coordination for refactoring workflows | High |

### Phase 4: Advanced Swarm Intelligence

**Goal**: Emergent capabilities that transcend individual agent abilities.

| Task | Complexity |
|---|---|
| Federated semantic search across agent memories | High |
| Cross-repo incident response automation | High |
| Dependency propagation and compatibility matrix generation | High |
| Swarm-wide cost tracking and budget enforcement | Medium |
| Knowledge synthesis from multi-agent investigation | High |

---

## 7. Security Considerations

### 7.1 Token Scoping

Cross-repo dispatch requires a token with `repo` scope for the target repository. Options:
- **Organization-level PAT**: Scoped to specific repos, stored as an org-level Actions secret. Simple but broad.
- **GitHub App installation token**: Fine-grained permissions per repo. More secure but more setup. The GitHub App is installed on each participating repo and issues short-lived tokens.
- **OIDC federation**: For agents that interact with cloud resources, OIDC tokens scoped to specific repo/workflow combinations prevent token theft from enabling cross-repo escalation.

**Recommendation**: Use a GitHub App for production swarms. PATs are acceptable for prototyping.

### 7.2 Blast Radius

A compromised agent in the swarm should not be able to escalate to other agents. Mitigations:
- Each agent only accepts dispatch events from repos listed in its `swarm.peers` allowlist
- Dispatch payloads are validated against a strict JSON schema before processing
- Agents cannot modify other agents' configurations or state — they can only send messages
- Chain depth limits prevent amplification attacks (Agent A compromised → triggers B → triggers C → ...)

### 7.3 Audit Trail

Every cross-agent interaction is recorded in three places:
1. **Source repo**: The dispatch event and callback response are logged in `state/swarm/outbound/`
2. **Target repo**: The received request and generated response are logged in `state/swarm/inbound/`
3. **Shared state repo** (if used): The task lifecycle (created → claimed → completed/failed) is tracked in `tasks/`

All three are committed to git. This creates a tamper-evident, distributed audit trail across the swarm.

---

## 8. Cost and Scalability Model

### 8.1 GitHub Actions Minutes

Each dispatch triggers a workflow run. On the free tier, GitHub provides 2,000 minutes/month for private repos (unlimited for public). Assumptions:

| Scenario | Agents | Dispatches/Day | Avg. Run Time | Monthly Minutes |
|---|---|---|---|---|
| Small team (3 repos) | 3 | 10 | 5 min | ~1,500 |
| Medium org (10 repos) | 10 | 30 | 5 min | ~4,500 |
| Large org (50 repos) | 50 | 100 | 5 min | ~15,000 |

For public repos, minutes are unlimited. For private repos, the medium and large scenarios require a paid plan. Cost control via the swarm policy budget is essential.

### 8.2 LLM API Costs

Each agent invocation consumes LLM tokens. In a swarm, the total token usage is the sum across all agents. Strategies:
- **Model tiering**: Use cheap/fast models for routing and triage; expensive models only for deep analysis
- **Cached context**: Agents can include summarized context from previous runs instead of re-processing raw data
- **Task filtering**: The swarm policy can define which task types warrant agent invocation vs. simple automation

### 8.3 Scaling Limits

| Dimension | GitHub Limit | Mitigation |
|---|---|---|
| Concurrent workflow runs per repo | 20 (default) | Queue excess requests in shared state repo |
| `repository_dispatch` payload size | 10 MB | Use artifacts for large payloads; reference by URL |
| API rate limit | 5,000 requests/hour (PAT) | Batch operations; use GitHub App for higher limits |
| Workflow run duration | 6 hours (default) | Break long tasks into chained dispatches |

---

## 9. Comparison: Single Agent vs. Swarm

| Dimension | Single `.GITOPENCLAW` Agent | Multi-Repo Swarm |
|---|---|---|
| **Knowledge scope** | One repository | All repos in the swarm |
| **Specialization** | General-purpose | Per-repo domain expertise |
| **Parallelism** | Single workflow run | N concurrent agents across N repos |
| **Memory** | Local to one repo | Federated across the swarm |
| **Failure blast radius** | One repo affected | Isolated per agent; others continue |
| **Cross-cutting tasks** | Manual coordination | Automated multi-repo orchestration |
| **Cost** | Predictable (one repo) | Multiplied (N repos) — requires budget controls |
| **Complexity** | Low (drop-in folder) | Medium–High (dispatch, registry, coordination) |

---

## 10. Summary

GitHub already provides everything needed for a distributed agent swarm: isolated compute, persistent state, authenticated messaging, and scoped credentials. `.GITOPENCLAW` provides the intelligence layer. Combining them creates a system where:

1. **Every repo is an agent** — each with its own identity, memory, tools, and domain expertise
2. **Agents communicate via GitHub-native mechanisms** — `repository_dispatch`, `workflow_dispatch`, cross-repo issue comments, and shared state repos
3. **Topologies emerge from configuration** — hub-and-spoke, peer-to-peer, hierarchical, or pipeline — all using the same primitives
4. **New capabilities emerge** — federated search, coordinated refactoring, distributed code review, incident response, and knowledge synthesis
5. **Security is structural** — GitHub's repo-level isolation, token scoping, and allowlists provide defense in depth without custom infrastructure
6. **Cost is controllable** — budget policies, chain depth limits, and model tiering keep the swarm economically viable

The single-agent `.GITOPENCLAW` is a productivity tool. The multi-repo swarm is an **organizational intelligence layer** — a network of specialized AI agents that collectively understand, maintain, and evolve an entire codebase ecosystem.

The swarm is not a future aspiration. Every primitive it needs already exists in GitHub today. The work is wiring them together.

---

_Last updated: 2026-03-03_
