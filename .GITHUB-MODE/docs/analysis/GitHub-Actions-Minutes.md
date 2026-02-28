# GitHub Actions Minutes Analysis

**Date:** 2026-02-18

**Status:** Analysis snapshot

**Scope:** Quantitative analysis of GitHub Actions minute consumption across all workflows in `japer-technology/gh-openclaw`, with billing implications, optimization assessment, and projections for GitHub Mode scaling.

---

## 1. Executive Summary

The `japer-technology/gh-openclaw` repository currently runs **9 user-defined workflows** plus dynamic workflows (Copilot coding agent). As of 2026-02-18, the repository has accumulated **702 workflow runs** since its creation on 2026-02-16.

**Key findings:**

- The repository is **public**, so GitHub-hosted runner minutes are **free and unlimited** under GitHub's current billing model. Billable minutes show as 0ms across all runs.
- Despite zero billing, minute consumption still matters for **queue contention**, **feedback loop speed**, and **organizational runner limits** if the repository ever moves to a private fork or GitHub Enterprise.
- The CI workflow is the dominant consumer, with up to **11 parallel jobs** per run across Linux, Windows, and macOS runners.
- Existing cost optimizations (docs-only skip, scope-based job skipping, concurrency cancellation, path filters) are well-designed and prevent significant waste.
- If this repository were **private**, estimated monthly consumption at current activity would be **8,000-15,000 minutes/month**, exceeding the free tier (2,000 min) by 4-7x.

---

## 2. Workflow Inventory

### 2.1 Workflow Summary Table

| Workflow                  | Trigger                              | Runner Type                                                     | Jobs | Multiplier | Est. Minutes/Run | Frequency          |
| ------------------------- | ------------------------------------ | --------------------------------------------------------------- | ---- | ---------- | ---------------- | ------------------ |
| **CI**                    | push (main), PR                      | blacksmith-4vcpu-ubuntu, blacksmith-4vcpu-windows, macos-latest | 11   | 1x/2x/10x  | 30-90            | Every push/PR      |
| **Docker Release**        | push (main, tags)                    | ubuntu-latest, ubuntu-24.04-arm                                 | 3    | 1x         | 6-10             | Every push to main |
| **Install Smoke**         | push (main), PR, dispatch            | ubuntu-latest                                                   | 2    | 1x         | 8-10             | Every push/PR      |
| **GitHub Mode Contracts** | PR, push (main) on `.GITHUB-MODE/**` | ubuntu-latest                                                   | 2    | 1x         | 2-3              | Path-filtered      |
| **Sandbox Common Smoke**  | push/PR on Dockerfile.sandbox\*      | ubuntu-latest                                                   | 1    | 1x         | 5-8              | Path-filtered      |
| **Workflow Sanity**       | PR, push (main)                      | ubuntu-latest                                                   | 1    | 1x         | 1-2              | Every push/PR      |
| **Auto Response**         | issues, PR (labeled)                 | self-hosted                                                     | 1    | 0x         | 0                | Event-driven       |
| **Labeler**               | PR, issues                           | self-hosted                                                     | 3    | 0x         | 0                | Event-driven       |
| **Stale**                 | schedule (daily), dispatch           | self-hosted                                                     | 1    | 0x         | 0                | Daily              |

### 2.2 Runner Type Billing Multipliers

GitHub applies different billing multipliers based on runner OS (relevant only for private repositories):

| Runner         | Multiplier | Used By                                                       |
| -------------- | ---------- | ------------------------------------------------------------- |
| Ubuntu (Linux) | 1x         | CI, Docker Release, Install Smoke, Contracts, Sandbox, Sanity |
| Windows        | 2x         | CI (checks-windows)                                           |
| macOS          | 10x        | CI (macos job)                                                |
| Self-hosted    | 0x (free)  | Auto Response, Labeler, Stale                                 |

**The macOS job is the single most expensive job per minute.** One 15-minute macOS run consumes 150 billed minutes. The CI workflow's decision to consolidate 4 separate macOS jobs into 1 sequential job (documented in the workflow comments) is a critical cost optimization.

---

## 3. Per-Workflow Minute Consumption Analysis

### 3.1 CI Workflow (Dominant Consumer)

The CI workflow is the most complex and expensive workflow in the repository.

**Job breakdown (full non-docs PR touching Node + macOS + Android paths):**

| Job                            | Runner                   | Est. Duration | Billed Minutes |
| ------------------------------ | ------------------------ | ------------- | -------------- |
| docs-scope                     | blacksmith-4vcpu-ubuntu  | 0.2 min       | 0.2            |
| changed-scope                  | blacksmith-4vcpu-ubuntu  | 0.3 min       | 0.3            |
| check (types + lint + format)  | blacksmith-4vcpu-ubuntu  | 3-5 min       | 3-5            |
| check-docs                     | blacksmith-4vcpu-ubuntu  | 2-4 min       | 2-4            |
| secrets                        | blacksmith-4vcpu-ubuntu  | 1-2 min       | 1-2            |
| build-artifacts                | blacksmith-4vcpu-ubuntu  | 3-5 min       | 3-5            |
| release-check (main only)      | blacksmith-4vcpu-ubuntu  | 2-3 min       | 2-3            |
| checks (node test)             | blacksmith-4vcpu-ubuntu  | 8-15 min      | 8-15           |
| checks (node protocol)         | blacksmith-4vcpu-ubuntu  | 2-4 min       | 2-4            |
| checks (bun test)              | blacksmith-4vcpu-ubuntu  | 6-12 min      | 6-12           |
| checks-windows (node lint)     | blacksmith-4vcpu-windows | 3-5 min       | 6-10 (2x)      |
| checks-windows (node test)     | blacksmith-4vcpu-windows | 10-18 min     | 20-36 (2x)     |
| checks-windows (node protocol) | blacksmith-4vcpu-windows | 2-4 min       | 4-8 (2x)       |
| macos (TS + Swift)             | macos-latest             | 15-25 min     | 150-250 (10x)  |
| android (test)                 | blacksmith-4vcpu-ubuntu  | 5-8 min       | 5-8            |
| android (build)                | blacksmith-4vcpu-ubuntu  | 5-8 min       | 5-8            |
| **Total (full run)**           |                          |               | **~210-370**   |
| **Total (Node-only PR)**       |                          |               | **~55-100**    |
| **Total (docs-only PR)**       |                          |               | **~0**         |

**Critical insight:** A single full CI run touching macOS paths can consume **210-370 billed minutes** (if on a private repo). The macOS job alone accounts for **60-70%** of the total billed cost despite being a single job.

#### Cost Optimizations Present

1. **Docs-only skip**: Detects docs-only changes and skips all heavy jobs. Estimated saving: 100% of test/build minutes for docs PRs.
2. **Scope-based job skipping**: `changed-scope` job detects which areas are touched (Node, macOS, Android) and only runs relevant jobs. Estimated saving: 50-70% for targeted PRs.
3. **Concurrency cancellation**: `cancel-in-progress` for PRs ensures superseded runs are terminated. Estimated saving: 20-40% during active development (rapid pushes).
4. **macOS consolidation**: 4 separate macOS jobs (TS test, Swift lint, Swift build, Swift test) are combined into 1 sequential job. This reduces from 4 macOS runners (40x multiplied minutes in aggregate) to 1 (10x). Estimated saving: 300% reduction in macOS billing.
5. **Build artifact sharing**: `build-artifacts` job builds once and shares via `actions/upload-artifact`, avoiding redundant builds in downstream jobs.

### 3.2 Docker Release Workflow

| Job             | Runner           | Observed Duration | Billed Minutes |
| --------------- | ---------------- | ----------------- | -------------- |
| build-amd64     | ubuntu-latest    | 2.6 min           | 2.6            |
| build-arm64     | ubuntu-24.04-arm | 5.7 min           | 5.7            |
| create-manifest | ubuntu-latest    | 0.2 min           | 0.2            |
| **Total**       |                  | **8.4 min**       | **~8.5**       |

Observed from run 22121720405 (2026-02-18). Uses registry-based caching (`type=registry`) which keeps build times low after the first build. Path filters exclude docs changes.

### 3.3 Install Smoke Workflow

| Job           | Runner        | Observed Duration | Billed Minutes |
| ------------- | ------------- | ----------------- | -------------- |
| docs-scope    | ubuntu-latest | 0.2 min           | 0.2            |
| install-smoke | ubuntu-latest | 8.1 min           | 8.1            |
| **Total**     |               | **8.3 min**       | **~8.3**       |

Observed from run 22121720404 (2026-02-18). The installer docker tests step (`pnpm test:install:smoke`) dominates at ~7.7 minutes.

### 3.4 Lightweight Workflows

| Workflow              | Runner        | Observed Duration | Billed Minutes |
| --------------------- | ------------- | ----------------- | -------------- |
| GitHub Mode Contracts | ubuntu-latest | 1-2 min           | 1-2            |
| Workflow Sanity       | ubuntu-latest | 0.5-1 min         | 0.5-1          |
| Sandbox Common Smoke  | ubuntu-latest | 3-5 min           | 3-5            |

### 3.5 Self-Hosted Workflows (Zero Billed Minutes)

| Workflow      | Purpose                    | Cost             |
| ------------- | -------------------------- | ---------------- |
| Auto Response | Issue/PR triage automation | $0 (self-hosted) |
| Labeler       | PR/issue labeling          | $0 (self-hosted) |
| Stale         | Daily stale cleanup        | $0 (self-hosted) |

Smart allocation: administrative/triage workflows use self-hosted runners, keeping billing at zero for high-frequency, low-compute tasks.

---

## 4. Activity Profile and Monthly Projections

### 4.1 Observed Activity (2026-02-16 to 2026-02-18, ~2 days)

| Workflow              | Runs | Successful | Cancelled | Failed |
| --------------------- | ---- | ---------- | --------- | ------ |
| CI                    | 14   | 0          | 9         | 0      |
| Install Smoke         | 14   | 10         | 3         | 0      |
| Workflow Sanity       | 14   | 13         | 0         | 0      |
| GitHub Mode Contracts | 11   | 11         | 0         | 0      |
| Labeler               | 3    | 0          | 0         | 0      |
| Docker Release        | 2    | 1          | 0         | 1      |
| Copilot Coding Agent  | 2    | 1          | 0         | 0      |

**Notable:** CI has a high cancellation rate (9/14 = 64%). This is the concurrency cancellation working as designed, preventing wasted minutes from superseded PR pushes.

### 4.2 Monthly Projection (if Private Repository)

Assuming moderate development pace (10 PRs/week, 5 pushes to main/week):

| Scenario                            | Est. Billed Minutes/Month |
| ----------------------------------- | ------------------------- |
| **Docs-only PRs (30%)**             | ~0                        |
| **Node-only PRs (50%)**             | 50 PRs x 75 min = 3,750   |
| **Full PRs with macOS (10%)**       | 10 PRs x 290 min = 2,900  |
| **Full PRs with Android (10%)**     | 10 PRs x 120 min = 1,200  |
| **Main pushes (CI)**                | 20 x 100 min = 2,000      |
| **Main pushes (Docker)**            | 20 x 8.5 min = 170        |
| **Main pushes (Install Smoke)**     | 20 x 8.3 min = 166        |
| **Lightweight (Sanity, Contracts)** | 100 x 1.5 min = 150       |
| **Scheduled (Stale)**               | 0 (self-hosted)           |
| **Copilot Agent**                   | Variable                  |
| **Cancellation savings (~30%)**     | -3,100                    |
| **Total estimate**                  | **~7,200**                |

**Key takeaway:** At moderate pace, the repository would consume **~7,200 billed minutes/month** if private. This exceeds the GitHub Free tier (2,000 min) by 3.6x and would require a paid plan ($0.008/min for Linux, $0.016/min for Windows, $0.08/min for macOS).

### 4.3 Estimated Monthly Cost (if Private)

| Runner Type | Est. Minutes | Rate       | Monthly Cost    |
| ----------- | ------------ | ---------- | --------------- |
| Linux       | ~5,400       | $0.008/min | $43.20          |
| Windows     | ~900         | $0.016/min | $14.40          |
| macOS       | ~900         | $0.08/min  | $72.00          |
| Self-hosted | 0            | $0         | $0              |
| **Total**   | **~7,200**   |            | **~$130/month** |

The macOS runner cost ($72) is **56% of total cost** despite representing only **12% of total minutes**. This is the 10x multiplier effect.

---

## 5. Comparison with Upstream (openclaw/openclaw)

The upstream repository runs **30 workflows** (vs 9 in the fork), including:

- Security-focused: CodeQL, zizmor, dependency-review, security-tests
- Quality: actionlint, codespell, test-coverage, formal-conformance
- Platform: Helm chart tests, Windows package build, OpenClaw CN Desktop
- Automation: Claude code review, Feature PR, Hotfix PR, PR Triage
- Deployment: Deploy to Fly.io, pages-build-deployment

**Scaling implications for GitHub Mode:** If GitHub Mode workflows are added on top of the existing 9, the combined workflow set could approach upstream's count. Each new workflow adds to the minute budget. The repository should plan for:

1. **Path filtering** on all new workflows to avoid unnecessary runs.
2. **Self-hosted runners** for administrative/triage workflows (already implemented).
3. **Concurrency groups** to prevent duplicate runs (already implemented for most workflows).
4. **Tiered execution** (lightweight workers for simple queries, full runners for complex tasks).

---

## 6. GitHub Mode Minute Budget Implications

GitHub Mode introduces a new consumption pattern: **agent-driven workflow runs** triggered by repository events rather than developer pushes.

### 6.1 Projected GitHub Mode Consumption Per Task

Based on the performance analysis (`performance.md` Section 5):

| Task Type                      | Runner Time | Billed Minutes (Linux) | Runs/Day (Est.) |
| ------------------------------ | ----------- | ---------------------- | --------------- |
| PR review agent                | 2-3 min     | 2-3                    | 5-20            |
| Command execution              | 1-5 min     | 1-5                    | 2-10            |
| Eval suite                     | 5-15 min    | 5-15                   | 1-3             |
| Drift monitoring (scheduled)   | 2-5 min     | 2-5                    | 1-4             |
| Batch policy checks (parallel) | 2-5 min x N | 2-5 x N                | 1-2             |

### 6.2 Monthly GitHub Mode Budget (Conservative to Aggressive)

| Activity Level            | Daily Runs | Avg Min/Run | Monthly Minutes |
| ------------------------- | ---------- | ----------- | --------------- |
| Conservative (small team) | 10         | 3           | 900             |
| Moderate (active team)    | 30         | 4           | 3,600           |
| Aggressive (multi-entity) | 100        | 5           | 15,000          |

**Combined budget (existing CI + GitHub Mode):**

| Scenario     | CI Minutes | GitHub Mode Minutes | Total  | Free Tier Status       |
| ------------ | ---------- | ------------------- | ------ | ---------------------- |
| Conservative | 7,200      | 900                 | 8,100  | 4x over (if private)   |
| Moderate     | 7,200      | 3,600               | 10,800 | 5.4x over (if private) |
| Aggressive   | 7,200      | 15,000              | 22,200 | 11x over (if private)  |

### 6.3 Infrastructure Overhead Ratio

Per the latency budget analysis (`performance.md` Section 5), **59% of each GitHub Mode run is infrastructure overhead** (runner allocation, checkout, dependency install, hydration) and **41% is actual agent work**.

For every 1 minute of useful agent computation, GitHub Mode consumes ~1.4 minutes of infrastructure time. Optimization levers:

| Optimization                        | Potential Saving          | Implementation Status                        |
| ----------------------------------- | ------------------------- | -------------------------------------------- |
| Aggressive `actions/cache`          | 10-25 sec/run             | Implemented for CI; needed for GitHub Mode   |
| Pre-built container image           | 15-40 sec/run             | Not implemented                              |
| Self-hosted warm runner pool        | 15-30 sec/run             | Partially implemented (admin workflows only) |
| Checkpoint storage co-location      | 3-10 sec/run              | Not implemented                              |
| Cloudflare Workers lightweight tier | Skip full runner entirely | Not implemented                              |

---

## 7. Optimization Recommendations

### 7.1 Already Implemented (Strengths)

These optimizations are already present and should be preserved in all new workflows:

1. **Docs-only detection** with full job skip
2. **Scope-based job skipping** (Node/macOS/Android path detection)
3. **Concurrency groups with `cancel-in-progress`** for PR workflows
4. **Path-based filtering** for specialized workflows (Docker, contracts, sandbox)
5. **Self-hosted runners** for lightweight administrative tasks
6. **macOS job consolidation** (4 jobs → 1 sequential job)
7. **Build artifact sharing** via `actions/upload-artifact`

### 7.2 Recommended for GitHub Mode Workflows

1. **Mandatory path filters**: Every GitHub Mode workflow should filter on `.GITHUB-MODE/**` or relevant paths to prevent runs on unrelated changes.
2. **Agent task caching**: Cache hydrated state snapshots and dependency installs across agent runs. The 59% infrastructure overhead can be reduced to ~35% with aggressive caching.
3. **Lightweight worker tier**: Route simple queries (variable lookups, doc searches) to Cloudflare Workers or similar, avoiding full runner allocation for sub-second tasks.
4. **Runner budget alerting**: Implement a scheduled workflow that checks cumulative monthly usage against a threshold and posts alerts (especially important if the repository ever becomes private).
5. **Self-hosted runners for agent workloads**: For high-frequency agent runs, self-hosted runners with warm pools eliminate the 15-90 second runner allocation overhead entirely.

### 7.3 Cost Sensitivity Analysis

| Change                          | Impact on Monthly Minutes |
| ------------------------------- | ------------------------- |
| Move repository to private      | +$0 → ~$130/month         |
| Add GitHub Mode (moderate)      | +$29/month (Linux only)   |
| macOS CI for every PR           | +$72/month → $144/month   |
| Remove scope-based skipping     | +50-70% (~$65/month)      |
| Remove concurrency cancellation | +20-40% (~$40/month)      |

---

## 8. Conclusions

1. **Current cost: $0.** The repository is public and benefits from GitHub's unlimited free minutes for public repositories. All billable amounts show as 0ms.

2. **Shadow cost matters.** Even at $0, minute consumption affects queue contention, feedback loop speed, and sets baseline expectations for private forks or enterprise deployments.

3. **macOS is the billing wildcard.** The 10x multiplier means macOS testing dominates cost projections. The existing consolidation (4 jobs → 1 job) is a crucial optimization that should not be reverted.

4. **GitHub Mode will materially increase consumption.** Conservative estimates add 900 minutes/month; aggressive multi-entity usage adds 15,000+ minutes/month. This is acceptable for a public repository but requires planning for private/enterprise contexts.

5. **The optimization foundation is solid.** Existing workflows demonstrate mature cost awareness (docs-only skip, scope detection, concurrency cancellation, self-hosted for admin). New GitHub Mode workflows should follow the same patterns.

6. **The 59% infrastructure overhead is the primary target.** More than half of every GitHub Mode run is setup, not work. Pre-built images, warm runner pools, and the Cloudflare Workers lightweight tier are the highest-leverage optimizations remaining.

---

## Appendix A: Data Sources

- Workflow run data: GitHub Actions API (`list_workflow_runs`, 702 total runs as of 2026-02-18)
- Job timing: GitHub Actions API (`list_workflow_jobs`) for runs 22121720404, 22121720405
- Billing data: GitHub Actions API (`get_workflow_run_usage`) showing $0 billable for public repo
- Workflow definitions: `.github/workflows/*.yml` (9 workflow files)
- Upstream comparison: `openclaw/openclaw` Actions API (30 workflows)
- Performance baselines: `.GITHUB-MODE/docs/analysis/performance.md`

## Appendix B: Runner Minute Billing Reference

| Runner OS   | Per-Minute Rate (Private Repos) | Multiplier | Free Tier Included                |
| ----------- | ------------------------------- | ---------- | --------------------------------- |
| Linux       | $0.008                          | 1x         | 2,000 min/month                   |
| Windows     | $0.016                          | 2x         | 2,000 min/month (1,000 effective) |
| macOS       | $0.08                           | 10x        | 2,000 min/month (200 effective)   |
| Self-hosted | $0                              | 0x         | Unlimited                         |

Note: Free tier minutes are shared across all runner types. The 2,000 minute budget depletes faster when using Windows (2x) or macOS (10x) runners.
