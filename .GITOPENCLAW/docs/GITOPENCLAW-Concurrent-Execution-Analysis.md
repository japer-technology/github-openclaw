# Deep Analysis: Concurrent Execution Limitations in .GITOPENCLAW

### Why multiple actions cannot run simultaneously — and what can be done about it

---

## Executive Summary

The `.GITOPENCLAW` system is architected around a **serialized-state, ephemeral-runner** model: each GitHub Actions workflow run starts from a clean checkout, executes the agent, and pushes state back to a single branch. This design creates a fundamental tension between **parallel compute** (GitHub Actions can start many runners simultaneously) and **serial state** (git requires linear commit history on a single branch). The workflow management layer (concurrency groups, event triggers) is only the surface constraint. Beneath it lie deeper architectural limitations rooted in git's data model, the ephemeral runner lifecycle, GitHub's platform limits, and the single-branch state convergence point.

This analysis identifies **five layers of concurrency limitation** — from GitHub platform constraints through git mechanics to application-level session semantics — and explores how local forked copies could contribute execution alongside (or instead of) GitHub Actions runners.

---

## Table of Contents

1. [Layer 1: GitHub Actions Platform Constraints](#layer-1-github-actions-platform-constraints)
2. [Layer 2: Git's Single-Branch State Convergence](#layer-2-gits-single-branch-state-convergence)
3. [Layer 3: Ephemeral Runner Isolation](#layer-3-ephemeral-runner-isolation)
4. [Layer 4: Application-Level Session Semantics](#layer-4-application-level-session-semantics)
5. [Layer 5: GitHub API Rate Limits and Side-Effect Ordering](#layer-5-github-api-rate-limits-and-side-effect-ordering)
6. [Local Forks as Parallel Execution Engines](#local-forks-as-parallel-execution-engines)
7. [Multiple Local Forks Contributing to One Cloud Repo](#multiple-local-forks-contributing-to-one-cloud-repo)
8. [Theoretical Concurrency Ceiling](#theoretical-concurrency-ceiling)
9. [Architectural Mitigations](#architectural-mitigations)
10. [Conclusion](#conclusion)

---

## Layer 1: GitHub Actions Platform Constraints

### Concurrency limits are per-account, not per-workflow

GitHub imposes hard concurrency limits on simultaneous workflow jobs:

| Plan | Max concurrent jobs | Max concurrent macOS jobs |
|------|--------------------:|-------------------------:|
| Free | 20 | 5 |
| Team | 40 | 5 |
| Enterprise | 500 | 50 |

These limits are **per-account across all repositories**. A GitHub organization running CI across 10 repos already competes for the same pool. `.GITOPENCLAW` workflows share this pool with any other workflows in the account.

### Queuing behavior under saturation

When the concurrency ceiling is reached, new workflow runs are **queued** (not rejected). The queue holds up to 500 runs per workflow. Queued runs wait for a slot to open. For conversational AI agents, this introduces **unbounded latency** — a user commenting on an issue may wait minutes or hours for a response if the queue is saturated by CI from other repositories.

### The `concurrency` key is a workflow-level mechanism, not a deep solution

The `concurrency` key in a workflow YAML provides two modes:

```yaml
# Mode 1: Serialize all runs (only one at a time)
concurrency:
  group: gitopenclaw-agent
  cancel-in-progress: false

# Mode 2: Serialize per-issue (different issues run in parallel)
concurrency:
  group: gitopenclaw-issue-${{ github.event.issue.number }}
  cancel-in-progress: false
```

Mode 2 (per-issue serialization) is the current best practice. But this only prevents **same-issue races**. Different issues running in parallel still contend on the shared state branch (Layer 2).

### Runner startup overhead is fixed and non-negligible

Every GitHub Actions run incurs cold-start overhead:

| Phase | Typical Duration |
|-------|----------------:|
| Queue wait (empty pool) | 2–15s |
| Runner provisioning | 5–20s |
| Checkout (`actions/checkout@v4`) | 3–10s |
| Bun/Node setup + cache restore | 5–15s |
| `bun install --frozen-lockfile` | 3–8s |
| **Total fixed overhead** | **18–68s** |

This overhead is paid **per run**, regardless of how small the agent's actual work is. For a one-line "what time is it?" question, 30+ seconds of setup precede 2 seconds of useful compute. This is the fundamental reason why fine-grained conversational parallelism is expensive on GitHub Actions — the per-invocation tax is too high to amortize over short interactions.

### Minutes billing creates economic pressure against parallelism

GitHub Actions bills by the minute (rounded up per job). Each concurrent run that survives the cold-start phase consumes at least one billable minute. Parallel execution means **linear minute consumption** — 5 concurrent runs consume 5x the minutes of a serialized queue, even if they finish simultaneously.

For the current `.GITOPENCLAW` configuration with a 10-minute timeout, the worst case is:

```
N concurrent events × 10 minutes/event = 10N minutes consumed
```

At GitHub's per-minute rates (Free: included up to 2,000 min/mo, Team: $0.008/min Linux), heavy concurrent usage can exhaust budgets quickly.

---

## Layer 2: Git's Single-Branch State Convergence

This is the **deepest structural limitation** and the one that persists regardless of workflow management improvements.

### The fundamental problem: N writers, one branch tip

`.GITOPENCLAW` persists all mutable state by committing to the repository's default branch:

```
.GITOPENCLAW/state/issues/<N>.json     — issue-to-session mappings
.GITOPENCLAW/state/sessions/<id>.jsonl — conversation transcripts
.GITOPENCLAW/state/memory.log         — append-only memory
.GITOPENCLAW/state/usage.log          — usage telemetry
```

Git's data model requires that every push **fast-forwards** the branch tip. When two runners attempt to push simultaneously, one succeeds and the other gets a rejection:

```
Runner A: git push origin HEAD:main  → SUCCESS (main advances A→A')
Runner B: git push origin HEAD:main  → REJECTED (main is now at A', B's base is stale)
```

The current mitigation is a retry loop with rebase:

```typescript
// GITOPENCLAW-AGENT.ts lines 783-790
for (let i = 1; i <= 3; i++) {
  const push = await run(["git", "push", "origin", `HEAD:${defaultBranch}`]);
  if (push.exitCode === 0) break;
  await run(["git", "pull", "--rebase", "origin", defaultBranch]);
}
```

This works for low contention (2–3 concurrent runs). But it has fundamental scaling limits:

### Rebase failure modes under high contention

| Scenario | Runners | Likely Outcome |
|----------|--------:|----------------|
| Light contention | 2–3 | Rebase succeeds within 3 retries |
| Moderate contention | 4–6 | Some runners exhaust retry budget; state lost |
| Heavy contention | 7+ | Thundering herd — each rebase creates a new conflict for the next runner |
| Same-file conflict | Any | Rebase fails if two runners modify the same file (e.g., same issue's session) |

### The rebase thundering herd

When N runners all fail their first push simultaneously, all N pull-rebase at the same moment. One wins the push race. The other N-1 now have a stale base again because the winning push advanced the branch. They rebase again, and the cycle repeats. With 3 retries and N runners:

```
Worst case: only 1 runner succeeds per retry round
Total rounds needed: N
But each runner only has 3 retries
∴ If N > 3, some runners will always fail
```

### Same-file conflicts cannot be auto-resolved

Git rebase can auto-merge changes to **different files**. But when two runners modify the **same file** (e.g., both write to `state/issues/42.json` for the same issue), rebase produces a conflict that cannot be resolved automatically. The runner fails:

```
CONFLICT (content): Merge conflict in .GITOPENCLAW/state/issues/42.json
error: Failed to merge in the changes.
```

The `memory.log` file uses `merge=union` git attribute, which mitigates this for append-only data by keeping both sides' additions. But `issues/<N>.json` and `sessions/<id>.jsonl` do not have this attribute and are vulnerable to content conflicts.

### Why this is deeper than workflow management

Even if you eliminated all workflow-level concurrency issues (perfect per-issue serialization, no queue contention), the git push convergence point remains. Any scenario where **multiple writers push state to the same branch** encounters this constraint. This includes:

- Multiple issues being worked on simultaneously by different runners
- A local fork pushing state while a GitHub Actions runner is also pushing
- Multiple local forks all pushing to the same cloud repo

The branch tip is a **global write lock** — and git has no native distributed lock manager.

---

## Layer 3: Ephemeral Runner Isolation

### Each runner is a clean room

GitHub Actions runners are ephemeral VMs. Each workflow run gets a fresh filesystem with no state from prior runs. This means:

1. **No shared memory.** Runner A cannot signal Runner B that it holds a lock on issue #42's session.
2. **No local coordination.** There is no IPC mechanism between concurrent runners.
3. **No partial state visibility.** Runner A's in-progress session transcript is invisible to Runner B until it is pushed to git.

The copy-archive-restore cycle in `GITOPENCLAW-AGENT.ts` (lines 263–276) works around this by using git as the coordination medium:

```
Before run:  git pull → copy archived transcript → run agent
After run:   copy transcript → git add → git commit → git push
```

But this creates a **stale-read window**: the transcript Runner B reads from git may not include turns that Runner A is currently writing. If both are working on the same issue, Runner B's agent operates on incomplete context.

### The coordination gap

In a traditional database system, concurrent writers use transactions, row locks, or optimistic concurrency control (compare-and-swap). Git provides none of these:

| Database Primitive | Git Equivalent | Limitation |
|-------------------|---------------|------------|
| Row-level lock | None | Git locks the entire branch tip |
| Read-your-own-writes | `git pull` | Must explicitly pull; no subscription/notification |
| Compare-and-swap | `git push` (fast-forward check) | Binary pass/fail; no partial merge |
| Transaction isolation | None | All changes are visible only after push |

This gap means that true concurrent execution requires **external coordination** — a lock service, a database, or a message queue — none of which exist in the current GitHub-only architecture.

---

## Layer 4: Application-Level Session Semantics

### Conversation ordering is critical

An AI conversation has strict ordering requirements. Message N must see the context of messages 1 through N-1. If two messages arrive simultaneously for the same issue:

```
User posts: "Please refactor the auth module"     → Runner A starts
User posts: "Actually, focus on the login flow"    → Runner B starts
```

Without serialization, Runner A and Runner B both see the original issue context but neither sees the other's message. The results are:

- Runner A refactors the entire auth module (ignoring the correction)
- Runner B responds to "focus on the login flow" without knowing A is already working

With per-issue serialization, Runner B waits for A to complete, sees A's response in the transcript, and can react appropriately.

### Session transcript append semantics

The session transcript (`.GITOPENCLAW/state/sessions/<id>.jsonl`) is a JSONL file where each line is a message event. Appending is **not commutative** — the order of lines matters because each agent response depends on the accumulated context above it.

If two runners append to the same transcript without coordination:

```jsonl
// Runner A appends:
{"role":"user","content":"refactor auth module"}
{"role":"assistant","content":"I'll start by..."}

// Runner B appends (from a different starting point):
{"role":"user","content":"focus on login flow"}
{"role":"assistant","content":"Sure, the login..."}
```

After git merge, the transcript may have Runner B's turn interleaved with Runner A's, creating an incoherent conversation history that confuses the agent on subsequent turns.

### Issue mapping consistency

The `state/issues/<N>.json` file maps an issue number to a session ID:

```json
{
  "issueNumber": 42,
  "sessionId": "issue-42",
  "sessionPath": ".GITOPENCLAW/state/sessions/issue-42.jsonl",
  "updatedAt": "2026-03-02T04:00:00.000Z"
}
```

Concurrent writes to this file from different runners produce a last-writer-wins race. If Runner A creates a new session and Runner B also creates a new session (because it checked before A pushed), you get two divergent session files with the same issue mapped to whichever runner pushed last.

---

## Layer 5: GitHub API Rate Limits and Side-Effect Ordering

### Rate limits create a shared resource bottleneck

Every `.GITOPENCLAW` run makes multiple GitHub API calls via `gh`:

| API Call | Purpose | When |
|----------|---------|------|
| `gh api .../collaborators/.../permission` | Authorization | Start |
| `gh issue view` | Fetch issue title/body | Start |
| `gh api .../reactions` | Add 👀 indicator | Start |
| `gh issue comment` | Post reply | End |
| `gh api .../reactions/{id}` DELETE | Remove 👀 indicator | End |

The `GITHUB_TOKEN` (auto-generated per workflow run) has a rate limit of **1,000 requests per hour per repository**. Each run consumes ~5–8 API calls. At 10 concurrent runs, that is 50–80 calls. Sustained burst traffic of 100+ events per hour (e.g., a bot loop or a busy project) can exhaust the rate budget.

### Side-effect ordering on the issue timeline

GitHub issues display comments in chronological order. When multiple runners post comments for different interactions, the timeline becomes:

```
Issue #42 comments:
  [00:01] User: "Explain the auth module"
  [00:02] 👀 reaction added (Runner A)
  [00:03] User: "Also check the login flow"
  [00:04] 👀 reaction added (Runner B)
  [00:08] Agent (Runner B): "The login flow works by..."  ← Runner B finished first
  [00:09] Agent (Runner A): "The auth module consists of..." ← Runner A finished second
```

The replies appear out of order relative to the questions. This is confusing for human readers, even though each agent response is individually correct.

---

## Local Forks as Parallel Execution Engines

### The conceptual model

A local fork is a full git clone with its own compute resources (the developer's machine). Instead of relying exclusively on GitHub Actions runners, a local fork could:

1. Pull the latest state from the cloud repo
2. Run the `.GITOPENCLAW` agent locally (using `bun .GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts`)
3. Push state changes back to the cloud repo

This model has significant advantages:

| Dimension | GitHub Actions Runner | Local Fork |
|-----------|----------------------|------------|
| Cold start | 18–68s | 0s (already running) |
| Compute cost | GitHub minutes billing | Free (developer's machine) |
| Network latency to LLM | Datacenter-to-datacenter | Local-to-datacenter |
| State persistence | Ephemeral (lost on runner teardown) | Persistent (local filesystem) |
| Concurrent capacity | Limited by GitHub plan (20/40/500) | Limited by local hardware |
| Interaction style | Asynchronous (event-driven) | Synchronous (interactive) |

### How local execution alongside GitHub Actions works

A local fork can coexist with GitHub Actions runs by following the same push-retry protocol:

```
Local machine:
  1. git pull origin main
  2. Run agent (modifies .GITOPENCLAW/state/)
  3. git add .GITOPENCLAW/
  4. git commit -m "gitopenclaw: local agent work on issue #N"
  5. git push origin main (retry with rebase on conflict)

GitHub Actions runner (simultaneously):
  1. Checkout main
  2. Run agent (modifies .GITOPENCLAW/state/)
  3. git add .GITOPENCLAW/
  4. git commit -m "gitopenclaw: work on issue #M"
  5. git push origin main (retry with rebase on conflict)
```

As long as the two runs modify **different files** (different issues), git rebase resolves the push conflict automatically. The constraint is the same as Layer 2: same-file modifications produce unresolvable conflicts.

### Deep limitations of local fork execution

#### 1. No event-driven triggering

GitHub Actions triggers automatically on issue events. A local fork has no equivalent webhook receiver. The developer must either:

- **Poll** for new issues/comments (`gh api` or `git pull` on a timer)
- **Run a local webhook receiver** (e.g., ngrok + a small HTTP server)
- **Manually invoke** the agent when they see a new issue

This breaks the "zero-infrastructure" promise of `.GITOPENCLAW`. The GitHub Actions path is fire-and-forget; the local path requires active monitoring.

#### 2. Secret management divergence

GitHub Actions provides secrets via the `secrets` context (encrypted at rest, injected at runtime). A local fork must manage secrets differently:

- Environment variables (less secure — visible in shell history)
- `.env` file (risk of accidental commit)
- System keychain (platform-specific)

The `ANTHROPIC_API_KEY` used by the agent must be available locally. This creates a second copy of the secret outside GitHub's managed envelope, increasing the attack surface.

#### 3. Git identity and attribution

Commits from a local fork carry the developer's git identity. Commits from GitHub Actions carry `gitopenclaw[bot]`. Mixed attribution in the commit log makes it harder to distinguish automated state changes from manual interventions:

```
abc1234 gitopenclaw[bot]: work on issue #42  ← Actions runner
def5678 alice: work on issue #43             ← local fork
```

This is a minor issue but complicates audit trails.

#### 4. Race amplification

Adding local pushers to the mix increases the number of concurrent writers competing for the branch tip. Where previously only N GitHub Actions runners raced, now N runners + M local forks all contend. The thundering herd problem from Layer 2 becomes worse:

```
Total concurrent writers = GitHub runners + local forks
Push success rate ∝ 1 / total_writers (approximately)
```

#### 5. State freshness gap

A local fork's checkout may be minutes or hours behind the cloud repo's `HEAD`. Running the agent against stale state means:

- Session transcripts may be missing recent turns
- Issue mappings may reference sessions that have since been updated
- Memory log may be missing entries added by concurrent Actions runs

The developer must `git pull` immediately before running the agent, but even a few seconds of staleness can cause conflicts.

---

## Multiple Local Forks Contributing to One Cloud Repo

### The multi-contributor model

Consider a scenario where a project has 3 developers, each with their own fork, all contributing agent work back to the central cloud repository:

```
Cloud repo (github.com/org/repo)
  ← pushes from GitHub Actions runner (issue events)
  ← pushes from Alice's local fork (her machine)
  ← pushes from Bob's local fork (his machine)
  ← pushes from Carol's local fork (her machine)
```

This is the **maximum contention scenario**. Four independent writers, each operating on potentially stale state, pushing to a single branch.

### Contention analysis

#### File-level conflict matrix

| Alice modifies | Bob modifies | Conflict? |
|---------------|-------------|-----------|
| `state/issues/1.json` | `state/issues/2.json` | No — different files, rebase auto-merges |
| `state/issues/1.json` | `state/issues/1.json` | **Yes** — same file, manual resolution needed |
| `state/sessions/issue-1.jsonl` | `state/sessions/issue-2.jsonl` | No — different sessions |
| `state/sessions/issue-1.jsonl` | `state/sessions/issue-1.jsonl` | **Yes** — same session |
| `state/memory.log` | `state/memory.log` | **Mitigated** — `merge=union` attribute deduplicates |
| `state/usage.log` | `state/usage.log` | **Mitigated** — append-only, each line is unique |

The key insight: **conflicts only occur when two writers touch the same issue's state**. If each contributor works on different issues, concurrent execution is safe.

#### Coordination overhead scales quadratically

With N writers, the number of potential pairwise conflicts is N×(N-1)/2. For 4 writers:

```
Potential conflicts: 4×3/2 = 6 pairs
Expected push retries per round: ~N-1 = 3
With 3 retry limit: some writers may fail if all push simultaneously
```

#### Clock skew and `updatedAt` races

Each writer stamps `updatedAt` in issue mapping files with their local clock. With multiple machines, clock skew means "latest" may not actually be latest:

```
Alice's machine (clock: 04:00:01): writes updatedAt: "2026-03-02T04:00:01Z"
Bob's machine (clock: 04:00:03): writes updatedAt: "2026-03-02T04:00:03Z"
GitHub runner (clock: 04:00:02): writes updatedAt: "2026-03-02T04:00:02Z"
```

After merge, Bob's version appears newest, but Alice may have had the most recent conversational context. Timestamps alone are insufficient for causality ordering in a distributed system (this is the well-known problem that vector clocks or Lamport timestamps solve).

### Fork-to-cloud authentication

Each local fork must authenticate to push to the cloud repo. This requires:

| Method | Security | Ease of Use | Multi-Fork Safe? |
|--------|----------|-------------|-----------------|
| SSH key | High | Medium | Yes (per-machine keys) |
| Personal Access Token (PAT) | Medium | High | Yes (but tokens are shared across repos) |
| GitHub CLI (`gh auth`) | Medium | High | Yes |
| Deploy key | High | Low | No (per-repo, not per-user) |

All methods require the contributor to have **write access** to the cloud repo. Fork-based contributions via pull requests (the standard open-source model) do not apply here because `.GITOPENCLAW` state must land on the default branch immediately — PR-based merges introduce latency that breaks conversational continuity.

### The "federation" alternative

Instead of multiple forks pushing to one repo, each fork could maintain its **own state** and **sync** periodically:

```
Alice's fork: .GITOPENCLAW/state/ (her conversations)
Bob's fork:   .GITOPENCLAW/state/ (his conversations)
Cloud repo:   .GITOPENCLAW/state/ (merged view)
```

Sync could use git merge with custom merge drivers, or a higher-level protocol that reconciles session transcripts. This is essentially a **CRDT (Conflict-free Replicated Data Type)** problem — designing state representations that converge without coordination.

For example, if session transcripts were designed as sets of immutable events (each with a globally unique ID and a Lamport timestamp), any fork could append events locally and merge them into the cloud repo without conflicts, because the merge operation is **commutative** and **idempotent**:

```jsonl
{"id":"evt_abc","lamport":1,"role":"user","content":"explain auth"}
{"id":"evt_def","lamport":2,"role":"assistant","content":"The auth module..."}
{"id":"evt_ghi","lamport":3,"role":"user","content":"focus on login"}
```

Two forks appending different events to the same session would produce a merged transcript that includes both, ordered by Lamport timestamp. The current JSONL format lacks these identifiers, making it vulnerable to ordering conflicts.

---

## Theoretical Concurrency Ceiling

Given all five layers of constraint, what is the practical concurrency ceiling for `.GITOPENCLAW`?

### Current architecture (no mitigations)

| Metric | Value | Limiting Factor |
|--------|------:|-----------------|
| Max concurrent runs (same issue) | 1 (de facto) | Session transcript coherence |
| Max concurrent runs (different issues) | ~3 | Git push retry budget (3 attempts) |
| Max concurrent runs (with local forks) | ~5 | Push contention + rate limits |
| Max throughput (events/hour) | ~30 | 10 min/run × 20 concurrent slots ÷ overhead |

### With per-issue concurrency groups

| Metric | Value | Limiting Factor |
|--------|------:|-----------------|
| Max concurrent runs (same issue) | 1 (enforced) | Concurrency group |
| Max concurrent runs (different issues) | ~10 | Git push success rate degrades above 10 |
| Max throughput (events/hour) | ~60 | Better parallelism, still push-bound |

### With branch-per-issue state isolation

| Metric | Value | Limiting Factor |
|--------|------:|-----------------|
| Max concurrent runs (same issue) | 1 (enforced) | Concurrency group |
| Max concurrent runs (different issues) | ~20 | GitHub runner concurrency limit |
| Max throughput (events/hour) | ~120 | Runner pool saturation |

### With external state store (database)

| Metric | Value | Limiting Factor |
|--------|------:|-----------------|
| Max concurrent runs (same issue) | 1 (row-level lock) | Database transaction |
| Max concurrent runs (different issues) | 20–500 | GitHub plan runner limit |
| Max throughput (events/hour) | ~500+ | LLM API throughput |

---

## Architectural Mitigations

### Mitigation 1: Per-Issue Concurrency Groups (Recommended First Step)

```yaml
concurrency:
  group: gitopenclaw-issue-${{ github.event.issue.number }}
  cancel-in-progress: false
```

**Effect:** Serializes runs for the same issue while allowing different issues to run in parallel.

**Eliminates:** Session transcript races, issue mapping conflicts for same-issue events.

**Does not eliminate:** Cross-issue push contention, memory.log/usage.log append races (mitigated by git attributes).

**Effort:** One line in the workflow YAML.

### Mitigation 2: Branch-Per-Issue State Isolation

Instead of all state living on the default branch, create ephemeral branches per issue:

```
main (source code, never modified by agent)
gitopenclaw/issue-42 (state for issue #42)
gitopenclaw/issue-43 (state for issue #43)
```

Each runner pushes to its own branch, eliminating cross-issue push contention entirely. A periodic merge job consolidates state back to the default branch.

**Eliminates:** All cross-issue push contention.

**Introduces:** Branch management complexity, merge job, potential state fragmentation.

**Effort:** Moderate refactor of the push/pull logic in `GITOPENCLAW-AGENT.ts`.

### Mitigation 3: Exponential Backoff with Jitter

Replace the fixed 3-retry loop with exponential backoff:

```typescript
for (let i = 1; i <= 5; i++) {
  const push = await run(["git", "push", "origin", `HEAD:${defaultBranch}`]);
  if (push.exitCode === 0) break;
  const delay = Math.min(1000 * Math.pow(2, i) + Math.random() * 1000, 30000);
  await Bun.sleep(delay);
  await run(["git", "pull", "--rebase", "origin", defaultBranch]);
}
```

**Eliminates:** Thundering herd behavior.

**Does not eliminate:** Fundamental push contention; just spreads it over time.

**Effort:** Small change in `GITOPENCLAW-AGENT.ts`.

### Mitigation 4: CRDT-Inspired State Design

Redesign state files to be merge-friendly:

1. **Session transcripts:** Add globally unique event IDs and Lamport timestamps to each JSONL line. Use `merge=union` git attribute.
2. **Issue mappings:** Use a directory of one-line files instead of JSON objects (one file per field: `session-id`, `updated-at`). Git merges individual files without conflict.
3. **Usage log:** Already append-only and conflict-free with `merge=union`.
4. **Memory log:** Already uses `merge=union`.

**Eliminates:** Most same-file merge conflicts.

**Introduces:** Schema migration for existing state, increased file count.

**Effort:** Significant refactor of state management in `GITOPENCLAW-AGENT.ts`.

### Mitigation 5: External State Store

Move mutable state out of git entirely. Use GitHub's built-in storage options:

| Storage | Pros | Cons |
|---------|------|------|
| **GitHub Actions Cache** | Fast, no auth needed | Mutable, 10GB limit, no concurrent writes |
| **GitHub Artifacts** | Immutable, 90-day retention | No random access, large overhead |
| **Gist API** | Simple key-value semantics | Rate limited, 1MB per file |
| **Repository Variables** | 48KB limit, API-accessible | Too small for transcripts |
| **External DB (Supabase, Turso)** | Full database semantics | Breaks "GitHub-only" promise |

The cleanest zero-infrastructure option is to keep git as the state store but use **GitHub Actions Cache** as a write-ahead log:

1. Runner writes state to cache (fast, atomic)
2. A background merge job periodically flushes cache to git commits
3. Other runners read from cache (fast) with git as fallback

**Eliminates:** Per-run git push contention.

**Introduces:** Cache invalidation complexity, eventual consistency.

**Effort:** Major architectural change.

### Mitigation 6: Local Fork Coordination Protocol

For local forks contributing alongside Actions runners, introduce a coordination protocol:

1. **Claim protocol:** Before running the agent, write a "claim" file (`state/.claims/issue-42.lock`) containing the runner/fork identity and a timestamp. Push it.
2. **Check protocol:** Before running, check for existing claims. If a claim exists and is recent (< 5 minutes), wait or skip.
3. **Release protocol:** After completing, remove the claim file.

This is a lightweight distributed lock using git as the coordination medium. It is imperfect (vulnerable to network delays and clock skew) but sufficient for low-contention scenarios.

**Effort:** Moderate (~100 lines in the orchestrator).

---

## Conclusion

The limitations on concurrent `.GITOPENCLAW` execution are layered and interconnected:

1. **GitHub Actions platform limits** cap the number of simultaneous runners and impose economic costs that scale linearly with parallelism.
2. **Git's single-branch convergence point** is the deepest constraint — it functions as a global write lock that serializes all state mutations regardless of whether they logically conflict.
3. **Ephemeral runner isolation** prevents runners from coordinating, forcing all coordination through the git push/pull protocol.
4. **Application-level session semantics** require strict ordering within a conversation, making same-issue parallelism fundamentally unsafe.
5. **GitHub API rate limits** create a shared resource ceiling that all concurrent runs compete for.

**Local forks** can supplement GitHub Actions runners with zero-cost compute and faster cold start, but they **amplify push contention** and introduce new challenges around secret management, event triggering, and state freshness.

**Multiple local forks** contributing to one cloud repo is theoretically possible but practically limited by the same git convergence constraints. The viable concurrency ceiling depends on issue isolation — as long as each writer works on different issues, the system scales to roughly 10–20 concurrent writers before push contention dominates.

The path to higher concurrency runs through **three progressive stages**:

1. **Near-term (workflow-level):** Per-issue concurrency groups + exponential backoff — eliminates the most common race conditions with minimal code changes.
2. **Mid-term (state-level):** CRDT-inspired state design + branch-per-issue isolation — eliminates cross-issue contention and enables safe concurrent writes.
3. **Long-term (architecture-level):** External coordination (cache-backed write-ahead log or lightweight database) — removes git as the serialization bottleneck entirely while preserving git as the audit trail.

The answer to "why can't multiple actions execute simultaneously?" is not a single reason — it is five layers of constraint, each reinforcing the others. Workflow management is the visible surface, but the deep reason is that **git was designed for human-speed collaboration, not machine-speed concurrency**, and using it as a real-time state store for parallel AI agents pushes it beyond its design envelope.

---

_Last updated: 2026-03-02_
