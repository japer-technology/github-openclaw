# Performance Analysis: OpenClaw GitHub Mode vs Locally Installed Runtime

**Date:** 2026-02-17

**Status:** Analysis snapshot

**Scope:** Systematic comparison of performance characteristics between OpenClaw running as a locally installed runtime and OpenClaw running in GitHub Mode, to set accurate expectations for GitHub Mode users.

## 1. Executive Summary

GitHub Mode is not designed to match the performance profile of the locally installed runtime. The two planes optimize for different objectives: local mode optimizes for latency and interactive responsiveness; GitHub Mode optimizes for auditability, team coordination, and governed automation.

This report quantifies the expected performance differences across seven dimensions so operators and teams adopting GitHub Mode can plan for them rather than be surprised by them.

**Bottom line:** GitHub Mode adds measurable overhead to every individual interaction (seconds to minutes), but unlocks capabilities that have no local equivalent (asynchronous team workflows, attestation pipelines, policy-gated automation). The performance cost is the price of moving from a single-player synchronous loop to a multi-player asynchronous queue.

---

## 2. Performance Dimensions Compared

### 2.1 Interaction Latency (Time to First Token)

This is the most visible performance difference and the one most likely to shape user perception.

| Phase                         | Local Installed                      | GitHub Mode                               | Delta         |
| ----------------------------- | ------------------------------------ | ----------------------------------------- | ------------- |
| Input acceptance              | Immediate (stdin/channel socket)     | Webhook dispatch + event queue            | +1-5 s        |
| Runtime startup               | Already running (gateway process)    | Runner allocation + container boot        | +15-90 s      |
| Dependency resolution         | Pre-installed in node_modules        | `pnpm install` or cache restore           | +5-30 s       |
| State hydration               | Local filesystem/SQLite (in-process) | Download checkpoint from external storage | +3-15 s       |
| Model API call                | Direct HTTPS to provider             | Direct HTTPS to provider (same)           | ~0 s          |
| **Total time to first token** | **< 2 s**                            | **30-120 s**                              | **+28-118 s** |

**Why this matters:** A locally installed OpenClaw responds to a message in under two seconds because the gateway process is already running, dependencies are loaded, and state is in-memory or on local disk. GitHub Mode must cold-start an entire execution environment before the agent can begin thinking.

**Mitigation designed into the spec:** The checkpoint lifecycle (Provisioning, Runner startup, Hydration, Scanning, Execution, Upload/finalize) makes this delay visible and legible rather than opaque. Users see exactly which phase they are waiting on, not a blank spinner.

### 2.2 Throughput (Interactions per Hour)

| Metric                           | Local Installed                        | GitHub Mode                    |
| -------------------------------- | -------------------------------------- | ------------------------------ |
| Sequential interactions per hour | 30-120 (conversational pace)           | 5-15 (workflow-bound)          |
| Concurrent interactions          | 1 per gateway (sequential model calls) | Multiple workflows in parallel |
| Batch task execution             | Serial, operator-driven                | Parallel across runners        |

**The throughput tradeoff:** Local mode handles high-frequency, low-complexity interactions efficiently. GitHub Mode handles fewer interactions per hour but can run multiple independent workflows in parallel across separate runners.

For a single back-and-forth conversation, local mode is 4-10x faster in raw throughput. For a batch of independent tasks (run evals on 10 datasets, check 5 policy contracts, generate 3 PR reviews), GitHub Mode can complete them simultaneously while local mode processes them serially.

### 2.3 Cold Start and Warm Start

| Scenario                    | Local Installed                 | GitHub Mode                                      |
| --------------------------- | ------------------------------- | ------------------------------------------------ |
| Cold start (first run)      | 3-10 s (process launch + init)  | 45-120 s (runner + checkout + install + hydrate) |
| Warm start (subsequent)     | < 1 s (process already running) | 30-90 s (runner reuse is not guaranteed)         |
| Hot path (mid-conversation) | < 0.5 s (in-memory context)     | N/A (no persistent session between runs)         |

**Critical difference:** The locally installed runtime maintains a long-lived process with warm caches, loaded modules, and in-memory session state. GitHub Actions runners are ephemeral: every workflow run is effectively a cold start. GitHub provides runner caching, but cache restoration adds its own overhead and cannot replicate the performance of an already-running process.

There is no true "warm start" in GitHub Mode. Even with aggressive caching of `node_modules` and checkpoint state, each run pays the runner allocation and environment setup cost.

### 2.4 Memory and State Performance

| Operation                     | Local Installed                      | GitHub Mode                                   |
| ----------------------------- | ------------------------------------ | --------------------------------------------- |
| Memory recall (vector search) | 5-50 ms (local SQLite-vec / LanceDB) | 500-3000 ms (download snapshot + query)       |
| Session context load          | In-process (already in memory)       | Deserialize from artifact/storage             |
| State persistence             | Immediate (local filesystem write)   | Upload to external storage at run end         |
| Cross-run continuity          | Seamless (persistent process)        | Checkpoint-based (explicit hydrate/dehydrate) |

**The amnesia problem:** Local mode never forgets context within a session because the process is persistent. GitHub Mode must explicitly serialize state at the end of each run and deserialize it at the start of the next. This hydration/dehydration cycle adds latency and introduces a failure surface (corrupt checkpoints, storage unavailability, schema mismatches).

The overview spec (Section 4.3) defines recovery semantics for each failure mode, but the performance cost of the hydration cycle itself is inherent and cannot be optimized away entirely.

### 2.5 Tool Execution Performance

| Tool Category        | Local Installed          | GitHub Mode               | Notes                                   |
| -------------------- | ------------------------ | ------------------------- | --------------------------------------- |
| File read/write      | < 1 ms (local disk)      | < 1 ms (runner disk)      | Equivalent within a run                 |
| Shell/exec           | < 100 ms (local process) | < 100 ms (runner process) | Equivalent within a run                 |
| Web fetch/API calls  | Network-dependent        | Network-dependent         | Equivalent (both use public internet)   |
| Browser automation   | Local browser instance   | Headless on runner        | Comparable; runner may have more CPU    |
| Device-coupled tools | Native hardware access   | Unavailable               | Installed-only classification           |
| Memory tools         | Local vector DB          | Hydrated snapshot         | +500-3000 ms per query (hydration cost) |

**Once running, tool execution is comparable.** The performance gap is almost entirely in startup and state management. Within an active workflow run, file operations, shell commands, and API calls perform similarly to local execution. GitHub-hosted runners typically have 2-4 vCPUs and 7-16 GB RAM, which is adequate for most agent workloads.

The exception is device-coupled tools (camera, microphone, screen capture, local app integrations) which are classified as `installed-only` and are not available in GitHub Mode at any performance level.

### 2.6 Compute Resources

| Resource       | Local Installed               | GitHub Mode (GitHub-hosted)                  | GitHub Mode (self-hosted) |
| -------------- | ----------------------------- | -------------------------------------------- | ------------------------- |
| CPU            | User hardware (varies widely) | 2-4 vCPUs (standard runner)                  | User-controlled           |
| RAM            | User hardware (varies widely) | 7-16 GB                                      | User-controlled           |
| Disk I/O       | Local SSD/HDD                 | SSD (runner ephemeral disk)                  | User-controlled           |
| GPU access     | If available locally          | Not available (standard runners)             | If provisioned            |
| Network egress | User ISP bandwidth            | Azure/GitHub datacenter bandwidth            | User-controlled           |
| Cost model     | Hardware owned; electricity   | Free tier: 2,000 min/month; paid tiers scale | User infrastructure cost  |

**Resource predictability:** Local installations vary wildly, from Raspberry Pi 5 (4 cores, 8 GB) to high-end workstations. GitHub-hosted runners provide a consistent baseline that is adequate for text-based agent workloads but may be insufficient for heavy media processing or large-scale eval runs. Self-hosted runners eliminate this constraint but shift operational burden to the team.

### 2.7 End-to-End Task Completion Time

For representative task classes, estimated completion times:

| Task                               | Local Installed      | GitHub Mode          | Overhead Source                                     |
| ---------------------------------- | -------------------- | -------------------- | --------------------------------------------------- |
| Answer a simple question           | 2-5 s                | 60-150 s             | Runner startup + hydration                          |
| Review a PR and post comments      | 10-30 s              | 90-180 s             | Runner startup + checkout + hydration               |
| Run eval suite on a dataset        | 2-10 min             | 4-15 min             | Startup + hydration + artifact upload               |
| Generate and open a PR             | 15-60 s              | 120-300 s            | Startup + hydration + git operations + finalization |
| Batch: 5 independent policy checks | 5-25 min (serial)    | 3-8 min (parallel)   | Parallelism advantage offsets startup cost          |
| Scheduled drift monitoring         | N/A (manual trigger) | 90-300 s (automated) | No local equivalent for unattended runs             |

**Key insight:** For individual interactive tasks, local mode is consistently faster. For batch operations, scheduled automation, and unattended workflows, GitHub Mode can match or exceed local throughput through parallelism and elimination of human scheduling overhead.

---

## 3. Performance Characteristics That Favor GitHub Mode

Despite higher per-interaction latency, GitHub Mode has performance advantages in specific domains:

### 3.1 Parallel Execution

Multiple GitHub Actions workflows can run concurrently, limited only by runner concurrency quotas. A team running 10 independent eval checks can complete them in the time of the slowest single check, not 10x the time of one check.

### 3.2 Consistent Environment

GitHub-hosted runners provide reproducible compute environments. Performance is predictable across runs, unlike local installations where resource contention from other applications can cause unpredictable slowdowns.

### 3.3 Elimination of Manual Scheduling Overhead

Scheduled workflows (drift checks, eval runs, dependency audits) run without human intervention. The "performance" of a task that runs automatically at 3 AM while the team sleeps is infinitely better than a task that waits until someone remembers to run it manually.

### 3.4 Team Throughput vs Individual Throughput

For a team of N people, GitHub Mode enables N concurrent agent workflows against the same repository. Local mode requires each person to run their own instance, with no shared state or coordination primitives. The aggregate team throughput of GitHub Mode can exceed local mode when collaboration is the bottleneck.

---

## 4. Performance Anti-Patterns to Avoid

### 4.1 Using GitHub Mode for Conversational Interactions

Do not use GitHub Mode for rapid back-and-forth debugging or exploratory conversations. The 30-120 second startup cost per interaction makes this impractical. Use the locally installed runtime for conversational work.

### 4.2 Over-Serializing Workflows

If tasks can run independently, run them as separate parallel workflows rather than sequential steps in a single workflow. GitHub Mode's parallelism advantage only applies when workflows are actually parallelized.

### 4.3 Ignoring Cache Configuration

Runner caching (`actions/cache`) for `node_modules`, checkpoint snapshots, and build artifacts can reduce cold-start time by 10-30 seconds. Skipping cache configuration wastes this straightforward optimization.

### 4.4 Using GitHub Mode to Replace Always-On Channel Sessions

GitHub Mode is not a replacement for persistent WhatsApp, Telegram, or Discord sessions. These require long-lived socket connections that are fundamentally incompatible with ephemeral runner execution. This is an explicit non-goal (see overview spec, Section 2.3).

---

## 5. Latency Budget Breakdown

A detailed breakdown of where time is spent in a typical GitHub Mode run:

```
GitHub Mode Run Timeline (typical PR review task)
──────────────────────────────────────────────────

0s      ── Event trigger (issue comment / PR push)
        │
1-5s    ── Webhook delivery + workflow queue
        │
6-25s   ── Runner allocation (queue depth dependent)
        │
26-40s  ── Container boot + checkout
        │
41-60s  ── Dependency install / cache restore
        │
61-75s  ── State hydration (checkpoint download + deserialize)
        │
76-80s  ── Preflight scanning (policy gates, capability checks)
        │
80-150s ── Agent execution (model calls + tool use) ← actual work
        │
151-165s── Artifact upload + checkpoint persistence
        │
166-170s── Status/comment update + finalize
        │
170s    ── Run complete
```

**Observation:** In a typical 170-second run, only 70 seconds (41%) is spent on actual agent execution. The remaining 100 seconds (59%) is infrastructure overhead. For longer-running tasks (eval suites, complex code generation), the infrastructure overhead becomes a smaller percentage of total time.

---

## 6. Optimization Levers

These optimizations can reduce but not eliminate the performance gap:

| Optimization                                | Potential Saving                     | Complexity |
| ------------------------------------------- | ------------------------------------ | ---------- |
| Aggressive `actions/cache` for node_modules | 10-25 s                              | Low        |
| Pre-built container image with dependencies | 15-40 s                              | Medium     |
| Self-hosted runners (warm pool)             | 15-30 s (runner allocation)          | High       |
| Checkpoint storage co-located with runners  | 3-10 s (hydration)                   | Medium     |
| Lightweight worker tier for simple queries  | 20-60 s (skip full runner)           | High       |
| Workflow-level concurrency for batch tasks  | Total time reduction via parallelism | Low        |

The Cloudflare Workers middle tier mentioned in existing analysis (critique-1.md) could address the lightweight query case, routing simple questions to a low-latency worker while reserving full GitHub Actions runs for complex automation tasks.

---

## 7. Framing for GitHub Mode Users

### What to tell users

1. **GitHub Mode is not a faster OpenClaw. It is a different kind of OpenClaw.** Local mode is for fast, interactive, personal work. GitHub Mode is for governed, auditable, team-scale automation.

2. **Expect 30-120 seconds before the agent starts working.** This is runner startup, not a bug. The checkpoint system makes every phase of this wait visible.

3. **Individual tasks are slower; team workflows are faster.** A single question takes longer. Ten parallel eval checks, an overnight drift scan, and a reviewer-agent loop across time zones are things local mode simply cannot do.

4. **Conversational work stays local.** GitHub Mode is not a replacement for your terminal. Use local mode for debugging, exploration, and rapid iteration. Use GitHub Mode for automation, review, and promotion.

5. **The overhead percentage shrinks with task complexity.** A 2-second question inflated to 120 seconds feels like 60x worse. A 10-minute eval suite inflated to 12 minutes feels like a 20% surcharge. For substantial tasks, the overhead is modest.

### What not to promise

- Do not promise "the same experience" across both planes. The overview spec (Section 3.3) explicitly defines this as intentional non-parity.
- Do not promise sub-minute response times for GitHub Mode interactions.
- Do not promise real-time streaming in GitHub Mode (progress is checkpoint-based, not token-streaming).
- Do not compare GitHub Mode latency against local mode latency as a regression. They are different products serving different needs under one umbrella.

---

## 8. Summary Table

| Dimension                   | Local Installed        | GitHub Mode                 | Winner            |
| --------------------------- | ---------------------- | --------------------------- | ----------------- |
| Time to first token         | < 2 s                  | 30-120 s                    | Local             |
| Conversational throughput   | 30-120 interactions/hr | 5-15 interactions/hr        | Local             |
| Batch parallelism           | Serial                 | Concurrent across runners   | GitHub            |
| Environment consistency     | Varies by machine      | Reproducible runners        | GitHub            |
| Unattended automation       | Not available          | Scheduled workflows         | GitHub            |
| Team coordination           | Manual                 | Repository-native           | GitHub            |
| Device-coupled tools        | Full access            | Not available               | Local             |
| Memory recall latency       | 5-50 ms                | 500-3000 ms                 | Local             |
| Tool execution (during run) | Baseline               | Comparable                  | Tie               |
| State continuity            | Seamless               | Checkpoint-based            | Local             |
| Audit trail                 | Minimal                | Complete                    | GitHub            |
| Cost at low volume          | Hardware owned         | Free tier (2,000 min/month) | Tie               |
| Cost at high volume         | Electricity            | Runner minutes billing      | Context-dependent |

---

## 9. Conclusion

The performance profile of GitHub Mode is fundamentally different from the locally installed runtime, not incrementally worse. Framing it as "slower local mode" misrepresents the value proposition and sets users up for disappointment.

The correct framing is: **GitHub Mode trades individual interaction speed for team-scale capabilities that have no local equivalent.** The 30-120 second startup cost per run is the price of auditability, parallelism, policy enforcement, and asynchronous multi-agent coordination.

Users who need fast, interactive, personal AI assistance should use the locally installed runtime. Users who need governed automation, team workflows, scheduled operations, and auditable outputs should use GitHub Mode. Most teams will use both, choosing the right plane for each task class.

The performance data in this report should be used to set expectations during onboarding, documentation, and product messaging so that GitHub Mode users understand what they are gaining, not just what they are giving up.
