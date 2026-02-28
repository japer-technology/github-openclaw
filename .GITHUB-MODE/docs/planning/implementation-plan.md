# OpenClaw GitHub Mode Implementation Plan

## Purpose

This plan turns the GitHub Mode vision ([idea.md](../idea.md), [overview.md](../overview.md)) into phased, executable work with clear deliverables, dependency gates, risk controls, and maturity checkpoints.

It is the single execution-level reference. For tactical task breakdowns, see [implementation-tasks.md](implementation-tasks.md). For product maturity definitions, see [mvp.md](mvp.md), [mvvp.md](mvvp.md), and [mvvvp.md](mvvvp.md).

---

## 1) Why This Plan Exists

OpenClaw's core thesis is **capability convergence with interaction divergence** — the same task-level outcomes across two runtime planes, each optimized for different interaction loops.

| Plane                     | Optimized for                                         | Interaction model                           |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| Installed runtime (local) | Fast iteration, device-coupled tasks, personal flow   | Synchronous, conversational, low-latency    |
| GitHub runtime (new)      | Team collaboration, governed automation, auditability | Asynchronous, event-driven, evidence-backed |

GitHub Mode is not a migration away from local. It is a **multiplayer expansion**: agents can hand off work across time zones, reviewer-agent and implementer-agent loops run in the same PR, and async maintenance jobs execute while humans are offline. The installed runtime remains the authority for local, persistent, device-coupled behavior.

This plan delivers that expansion safely, without regressing the installed experience.

### Companion documents

| Document                                           | Role                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| [idea.md](../idea.md)                              | Core thesis, parity targets, intentional non-parity |
| [overview.md](../overview.md)                      | Product and architecture spec with UX contracts     |
| [mvp.md](mvp.md)                                   | Minimum viable product scope and exit criteria      |
| [mvvp.md](mvvp.md)                                 | Minimum viable vision product — proves direction    |
| [mvvvp.md](mvvvp.md)                               | Minimum viable valuable product — compounding value |
| [implementation-tasks.md](implementation-tasks.md) | Tactical task breakdown per phase                   |
| [task-0-analysis.md](task-0-analysis.md)           | Phase 0 impact analysis                             |
| [ADR index](../adr/README.md)                      | Architecture decision records                       |
| [Security index](../security/README.md)            | Threat model and quarantine pipeline                |
| [Non-goals](../analysis/non-goals.md)              | Task classes excluded from GitHub Mode              |

---

## 2) Program Objectives

1. Deliver a high-functionality GitHub Runtime Plane without regressing installed runtime behavior.
2. Reuse core orchestration, agent, and tool-policy paths before introducing adapters ([ADR 0001](../adr/0001-runtime-boundary-and-ownership.md)).
3. Enforce security through standard GitHub controls (Secrets, Environments, branch protections, approvals, least privilege, OIDC, SHA-pinned actions).
4. Establish measurable functional parity using a maintained parity matrix with explicit interaction-model boundaries.
5. Enable safe multi-entity template bootstrap and policy-governed cross-entity collaboration.
6. Design for asynchronous interaction with legible progress, not hidden latency ([overview.md §3.3–3.4](../overview.md)).

---

## 3) Non-Negotiable Guardrails

These hold across every phase and are enforced in CI, review, and runtime:

1. **Installed runtime non-regression.** Behavior remains unchanged unless explicitly approved by maintainers. Enforced by [ADR 0002](../adr/0002-installed-runtime-non-regression-guardrails.md) and smoke baselines.
2. **No custom secret vaulting.** GitHub mode uses only GitHub Secrets and Environment Secrets.
3. **Least-privilege by default.** No privileged workflow execution from untrusted actors or contexts. Trigger trust levels defined in [Security 0001](../security/0001-github-trigger-trust-matrix.md).
4. **SHA-pinned actions.** All third-party actions pinned to full commit SHA.
5. **PR-mediated mutation only.** All privileged branch mutations occur via PR workflow; never direct writes to protected branches.
6. **Fork-context src usage.** GitHub Mode workflows build and run the openclaw runtime from `src/` to leverage agents, routing, tool policy, providers, and memory — this is the core "run as if installed" mechanism. `.GITHUB-MODE` PRs must not modify `src/**` files (upstream-owned). Governance scripts (contract validation, security lint) remain contract-driven and do not require `src/` imports. See [ADR 0001 fork-context amendment](../adr/0001-runtime-boundary-and-ownership.md).
7. **Upstream sync safety.** All changes must be purely additive to owned paths so the fork can cleanly pull upstream OpenClaw upgrades.
8. **Vetted skill supply chain.** Only skills passing the quarantine pipeline ([Security 0002](../security/0002-skills-quarantine-pipeline.md)) can run in trusted GitHub Mode workflows.

---

## 4) Architectural Constraints

### 4.1 Stateless ephemeral workers

GitHub Actions runners are stateless and ephemeral. Every job starts fresh; local disk is temporary scratch space. All durable state must be externalized.

**Must be externalized before run start:**

- Memory and context state (agent memory, routing/policy state) — managed stores or repository-tracked artifacts.
- Artifacts and evidence history (reports, attestations, summaries) — GitHub artifacts/releases/issues or approved external stores.
- Checkpoints and resume markers — external storage with stable identifiers.
- Caches (dependency, model, build) — explicit cache backends (GitHub cache/artifacts/registry).

**Must not be assumed between runs:**

- Local disk files from prior runs.
- Local databases, temp directories, or process state.
- Runner identity affinity (same host/VM/path).
- Unpublished logs or transient outputs not exported as durable artifacts.

**Design rule:** Every phase deliverable requiring cross-run continuity must define its external state location, retention window, and recovery behavior.

### 4.2 Persistent memory design

Agent context must survive runner teardown. The persistent memory layer is defined in detail in [implementation-tasks.md Task 4.7](implementation-tasks.md) and summarized here.

**System of record:**

- Primary: managed object storage for checkpoint/event blobs.
- Index: managed database for metadata, lookup, and coordination.
- Projection stores (vector/search) are derived views, never authoritative.

**Lifecycle:** hydrate at run start → periodic checkpoints at deterministic boundaries → finalize at run end → crash-safe fallback from persisted checkpoints.

**Consistency:** read-your-writes within a run; eventual consistency across concurrent runs. Compare-and-swap versioning. Append-only event log with snapshot compaction. Idempotency keys on all writes (`runId` + `stepId` + `sequence`).

**Minimal data model:**

| Record           | Purpose                                            |
| ---------------- | -------------------------------------------------- |
| `MemorySnapshot` | Latest compacted memory image for run hydration    |
| `MemoryDelta`    | Ordered incremental updates between snapshots      |
| `RunCheckpoint`  | Resume marker for in-progress or interrupted runs  |
| `RunJournal`     | Audit trail tying memory evolution to run evidence |

**Retention:** hot window (7–30 days) for fast resume, warm window (90–365 days) for governance/forensics, explicit TTL expiration with auditable tombstones, legal hold overrides.

### 4.3 Failure-mode contract

Every storage and checkpoint path must implement deterministic failure handling. Full failure-mode matrix with detection, user-visible errors, retry policies, and recovery paths is specified in [implementation-tasks.md Task 4.8](implementation-tasks.md) and [overview.md §4.3](../overview.md).

Summary of required failure modes:

| Failure                           | Response                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Storage unavailable               | Exponential backoff; preserve last committed snapshot; rehydrate on retry        |
| Snapshot schema mismatch          | No automatic retry; preserve original; require migration                         |
| Scan failures                     | One retry for transient errors; policy denials are non-retryable; fail closed    |
| Runner timeout/preemption         | Auto-resume when context unchanged; replay from last checkpoint                  |
| Partial upload/corrupt checkpoint | Retry with idempotency key; tombstone corrupt objects; preserve previous pointer |

---

## 5) Workstreams and Ownership

Each workstream represents a coherent area of responsibility. Tasks in [implementation-tasks.md](implementation-tasks.md) are tagged by workstream.

| Workstream                                       | Scope                                                                          | Phase coverage          |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------- |
| **WS-A** Runtime contracts and parity            | Contract schemas, parity matrix, convergence map, validators                   | Phases 0–1              |
| **WS-B** GitHub security foundation              | Secrets, environments, permissions, OIDC, security lint, skill quarantine      | Phases 0, 2, 3, 4, 6, 7 |
| **WS-C** Validation, policy, eval, cost          | PR checks, policy/route simulation, eval/cost gates, drift detection           | Phases 3–4              |
| **WS-D** Command runtime and bot PR loop         | Command workflows, agent runs, bot PRs, UX checkpoints, state adapters         | Phase 4                 |
| **WS-E** Promotion, attestation, incident ops    | Promotion pipelines, attestation, drift/incident automation, fault containment | Phases 5–6              |
| **WS-F** Multi-entity template and collaboration | Entity bootstrap, template validators, collaboration dispatch/receive          | Phases 3, 6             |
| **WS-G** Observability, compliance, governance   | Artifact standards, metrics, playbooks, compliance automation, handoff         | Phases 1, 4, 7          |

---

## 6) Phase Dependency Graph

Phases must be executed in dependency order. Parallel execution is possible where noted.

```
Phase 0 (Baseline + Design Locks) ✅ Complete
    │
    ▼
Phase 1 (Contract Scaffolding) ✅ Complete
    │
    ├──────────────────────┐
    ▼                      ▼
Phase 2 (Security) ✅    Phase 3 (Validation Workflows) ✅
    │                      │        [can run in parallel]
    └──────┬───────────────┘
           ▼
    Phase 4 (Command Runtime + Bot PR)
           │
           ▼
    Phase 5 (Promotion + Attestation)
           │
           ▼
    Phase 6 (Multi-Entity Collaboration)
           │
           ▼
    Phase 7 (Observability + Handoff)
```

**Key dependency rules:**

- Phase 1 before Phases 2 and 3 (contracts must exist before security lint and validation workflows consume them).
- Phases 2 and 3 can execute in parallel (security foundation and validation workflows are independent).
- Phase 4 requires both Phase 2 and Phase 3 (command runtime needs security gates and validation infrastructure).
- Phases 5–7 are sequential (promotion needs commands; collaboration needs promotion; observability wraps everything).

---

## 7) Phase-by-Phase Plan

### Phase 0 — Baseline and design locks

**Status:** ✅ Complete (2026-02-16). See [task-0-analysis.md](task-0-analysis.md) for impact analysis.

**Deliverables completed:**

- Runtime boundary ADRs ([ADR 0001](../adr/0001-runtime-boundary-and-ownership.md), [ADR 0002](../adr/0002-installed-runtime-non-regression-guardrails.md))
- Installed runtime regression baseline via existing smoke workflows
- GitHub trigger trust matrix and threat model ([Security 0001](../security/0001-github-trigger-trust-matrix.md))

<details>
<summary>Phase 0 acceptance evidence</summary>

- ✅ **Task 0.1** — ADR package approved. Boundaries define ownership, shared modules, prohibited coupling. Backout trigger documented.
- ✅ **Task 0.2** — Non-regression policy and smoke baseline in `.github/workflows/install-smoke.yml` and `.github/workflows/sandbox-common-smoke.yml`.
- ✅ **Task 0.3** — Trigger trust matrix covers fork PR, internal PR, push, schedule, dispatch. All abuse cases mapped to controls.

Phase 1 proceeds only while this evidence remains valid.

</details>

---

### Phase 1 — Contract scaffolding and parity framework

**Status:** ✅ Complete. See [implementation-tasks.md Tasks 1.1–1.4](implementation-tasks.md) for evidence.

**Deliverables completed:**

- All `.GITHUB-MODE/runtime/` contract artifacts (manifest, adapters, command policy, trust levels, parity matrix, convergence map, entity/collaboration schemas)
- Schema validators via `pnpm contracts:github:validate`
- Parity and convergence validators
- Contract versioning and compatibility policy

**Exit criteria satisfied:**

- Contract validation is mandatory in CI.
- Parity report artifact (`github-mode-parity-report`) generated per PR for changed subsystems via `.github/workflows/github-mode-contracts.yml` (`validate-contracts` artifact upload step).

---

### Phase 2 — Security foundation (GitHub-native)

**Status:** ✅ Complete. **Depends on:** Phase 1 ✅.

**Completion evidence:** See [implementation-tasks.md Task 2.1–2.6 evidence references](implementation-tasks.md#phase-2--security-foundation-github-native) and [security index](../security/README.md).

**Deliverables:**

1. Secret inventory and rotation policy document with ownership and review cadence ([Security 0003](../security/0003-secrets-inventory-and-rotation.md) + runtime companion `.GITHUB-MODE/runtime/secrets-inventory.json`).
2. GitHub Environments: `github-mode-dev`, `github-mode-staging`, `github-mode-prod` with required reviewers and branch/tag restrictions.
3. Explicit least-privilege `permissions:` at workflow/job level for all GitHub-mode pipelines.
4. OIDC integration for cloud access where applicable.
5. Security lint that fails on unpinned third-party actions, over-broad permissions, and secrets exposed in untrusted triggers.
6. Skills quarantine pipeline ([Security 0002](../security/0002-skills-quarantine-pipeline.md)) with intake, static scan, policy evaluation, two-party approval, trusted registry, and emergency revocation.

**Exit criteria:**

- Security lint passes across all GitHub-mode workflows.
- No secrets accessible in fork PR contexts (verified by tests/simulation).
- Environment approvals enforce promotion paths.
- Skills quarantine pipeline enforces deny-by-default for untrusted skill sources.

**Backout:** Any security control regression blocks release; revert offending workflow changes.

**Risk:** Quarantine pipeline friction may slow skill adoption. Mitigate by automating scan gates and keeping the approval loop fast.

---

### Phase 3 — Core validation, simulation, eval, and cost workflows

**Status:** ✅ Code-complete. **Depends on:** Phase 1 ✅. **Can run in parallel with:** Phase 2 ✅.

**Deliverables:**

Implement these workflows with deterministic artifacts and markdown summaries:

- `github-mode-build.yml`
- `github-mode-check.yml` (required PR check)
- `github-mode-test.yml`
- `github-mode-policy.yml`
- `github-mode-route-sim.yml`
- `github-mode-eval-tier0.yml`
- `github-mode-cost.yml`
- `github-mode-sync-templates.yml`

Required behaviors:

- Untrusted-safe execution for fork PRs (no secret access).
- Policy and route drift detection with remediation pointers.
- Eval and cost threshold gates that block promotion workflows on failure.
- Template drift detection with migration guidance.

**Exit criteria:**

- Required checks gate merges.
- Failing policy/eval/cost thresholds block promotion workflows.

**Backout:** Downgrade flaky workflows from required to informational temporarily; open reliability incident.

**Risk:** Flakiness in drift detection. Mitigate with deterministic fixtures and quarantine for unstable checks.

---

### Phase 4 — Command runtime and bot PR loop

**Status:** Not started. **Depends on:** Phase 2 + Phase 3.

This is the largest and most complex phase. It delivers the core collaborative value: trusted commands from GitHub surfaces produce bot PRs with full provenance. **This phase leverages the fork-context execution path** ([ADR 0001 amendment](../adr/0001-runtime-boundary-and-ownership.md)) — workflows build the openclaw runtime from `src/` and run it inside GitHub Actions to deliver the full "run as if installed" experience.

**Core execution model:**

Workflows run `pnpm install && pnpm build` to produce the openclaw runtime, then invoke it for agent execution, routing decisions, tool policy enforcement, and provider calls. This means the same agent engine (`src/agents/`), auto-reply orchestration (`src/auto-reply/`), routing logic (`src/routing/`), tool policy gates (`src/agents/tool-policy.ts`), provider integrations (`src/providers/`), memory management (`src/memory/`), and security checks (`src/security/`) that power the installed runtime also power GitHub Mode commands.

**Deliverables:**

1. **Command and agent workflows:** `github-mode-command.yml`, `github-mode-agent-run.yml`, `github-mode-bot-pr.yml` — all build from source and invoke the openclaw runtime.
2. **MVP command set:** `explain`, `refactor`, `test`, `diagram` — executed via the actual openclaw agent engine from `src/agents/`.
3. **Trust-aware authorization:** command authorization checked against trust levels before any adapter invocation.
4. **Pre-agent security gates** (fail-closed, deterministic order):
   - Skill/package scan → lockfile/provenance checks → policy evaluation.
   - Each gate emits `gate`, `result`, `reason`, `evidence` to summary and artifact.
5. **State adapter pipeline:** hydrate snapshot → validate schema → run agent (using `src/agents/pi-embedded-runner` and `src/auto-reply/`) → upload snapshot atomically → record run metadata. Storage target selected by latency/cost/access-control evaluation (see [implementation-tasks.md Task 4.7](implementation-tasks.md)).
6. **Provenance metadata:** source command, commit SHA, run id, policy version embedded in every output.
7. **Protected branch controls:** all mutations via bot branch + PR; never direct writes.
8. **UX progress checkpoints** ([overview.md §3.3–3.4](../overview.md)):
   - 6-checkpoint lifecycle: Provisioning → Runner startup → Hydration → Scanning → Execution → Upload/finalize.
   - User-facing states: `queued`, `provisioning`, `running`, `waiting_on_input`, `completed`, `failed`.
   - CLI progress labels via `src/cli/progress.ts` and tabular status via `src/terminal/table.ts`.
   - Completion handoff: outcome statement, evidence bundle, operator action, ownership continuity.
   - Fallback when telemetry is unavailable: show last confirmed checkpoint, mark unknown, emit degraded-telemetry note.
9. **Failure-mode contract** for all checkpointed runs (see §4.3 above).
10. **Issue-thread loop MVP (gitclaw-inspired):** add `issues`/`issue_comment` trigger path with reaction-based in-progress signaling, guaranteed reaction cleanup, and git-backed issue→session pointer mapping for deterministic resume (see [design note](../design/github-mode-issue-loop-mvp.md)).

**Exit criteria:**

- Trusted users can trigger command-to-PR flow end-to-end using the built openclaw runtime.
- Agent execution uses `src/agents/` and `src/auto-reply/` for actual AI reasoning and tool invocation.
- Agent execution cannot run unless all three pre-agent gates pass.
- Untrusted users cannot invoke privileged adapters or secret-backed paths.
- UX checkpoints render correctly in CLI and GitHub surfaces.

**Backout:** Disable privileged command handlers; keep read-only explain flows.

**Risk:** State adapter complexity may delay delivery. Mitigate by starting with GitHub Actions artifacts as MVP storage and upgrading to cloud object storage in a follow-on.

---

### Phase 5 — Promotion, attestation, and incident operations

**Status:** Not started. **Depends on:** Phase 4.

**Deliverables:**

1. **Promotion workflows:** `github-mode-promote-dev.yml`, `github-mode-promote-staging.yml`, `github-mode-promote-prod.yml`.
2. **Attestation generation and verification** with required fields: commit/environment, policy/routing/agent revisions, model ids + dataset hashes, eval/cost results, approvers + UTC timestamp, artifact/run references.
3. **Drift and incident automation:** `github-mode-drift.yml`, `github-mode-incident.yml` with evidence-linked issue creation.
4. **Promotion failure controls:** auto-block on attestation failure, auto-create incident issue, attach rollback/runbook links.

**Exit criteria:**

- Promotions require green gates + environment approval + valid attestation.
- Drift and incident workflows create evidence-linked issues automatically.

**Backout:** Attestation verification failure blocks promotion and auto-creates incident.

---

### Phase 6 — Multi-entity bootstrap and collaboration

**Status:** Not started. **Depends on:** Phase 5.

**Deliverables:**

1. **Entity bootstrap:** `github-mode-bootstrap-entity.yml` for template-based entity creation with idempotent re-runs.
2. **Entity baseline validator** covering labels, issue forms, PR templates, CODEOWNERS, environment placeholders, branch protection expectations.
3. **Collaboration workflows:** `github-mode-collab-dispatch.yml`, `github-mode-collab-receive.yml`.
4. **Deny-by-default policy:** collaboration routes enforced; envelope validation (source/target entity, intent, correlation id, run id, policy version, TTL).
5. **Fault containment:** toggle to disable dispatch while keeping receive validation in monitor-only mode.

**Exit criteria:**

- Two template-generated entities can collaborate on allowlisted intents.
- Blocked/untrusted intents are rejected with auditable evidence.

**Backout:** Disable dispatch permissions; leave receive validation in monitor-only mode.

---

### Phase 7 — Observability, compliance, and program handoff

**Status:** Not started. **Depends on:** Phase 6.

**Deliverables:**

1. **Artifact and summary standards:** schemas and format validated across all workflows.
2. **Metrics pipeline** covering all dimensions from [mvvp.md §4](mvvp.md) and [mvvvp.md §5](mvvvp.md):
   - Adoption: PR coverage, trusted command usage.
   - Effectiveness: bot PR acceptance rate, command-to-PR lead time, pre-merge catches.
   - Safety: blocked privileged attempts, secret/policy incident counts (target: zero).
   - Reliability: workflow success rate, flake-driven reruns, duration percentiles.
   - Operability: manual interventions, mean time to recover, stale parity entries.
   - Parity: matrix freshness, coverage trends, installed-only item count.
   - Collaboration: success/failure rates and latency.
   - Promotion: lead time and rollback time.
3. **Operational playbooks:** secret rotation, emergency revocation, compromised token response, attestation audit + rollback.
4. **Compliance automation:** continuous enforcement of security acceptance checklist controls.
5. **Program handoff:** milestone evidence rollup (M1–M7), owner assignment, runbook handoff, maintainer sign-off.

**Exit criteria:**

- Dashboards/reports available to maintainers with weekly rollup cadence.
- Governance playbooks reviewed, linked, and executable without tribal knowledge.
- Compliance checks run continuously; violations block promotion.

**Backout:** Keep gating on hard checks while metrics instrumentation is repaired.

---

## 8) Milestones and Maturity Gates

### Milestone map

| Milestone | Phases  | What it proves                                                                |
| --------- | ------- | ----------------------------------------------------------------------------- |
| **M1**    | 0 + 1   | Contracts, parity framework, threat model, and baseline are locked            |
| **M2**    | 2       | Security foundation is enforced across all GitHub-mode workflows              |
| **M3**    | 3       | Validation, policy, eval, and cost workflows gate merges                      |
| **M4**    | 4       | Command-to-bot-PR flow works end-to-end with trust gates                      |
| **M4.1**  | 4 (sub) | State adapter pipeline satisfies acceptance criteria; storage target selected |
| **M5**    | 5       | Promotions are approval-gated with verified attestations                      |
| **M6**    | 6       | Multi-entity bootstrap and governed collaboration work                        |
| **M7**    | 7       | Observability, compliance, and governance are operational                     |

### Product maturity progression

Maturity stages gate scope expansion. Each stage has explicit exit criteria in its planning document.

| Stage     | Exit criteria document  | Minimum sustained window | Key gate                                                                             |
| --------- | ----------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| **MVP**   | [mvp.md §7](mvp.md)     | —                        | Required PR check + trusted command-to-bot-PR + untrusted denial + parity artifact   |
| **MVVP**  | [mvvp.md §5](mvvp.md)   | 2 continuous weeks       | MVP criteria hold + vision metrics show repeat usage and alignment                   |
| **MVVVP** | [mvvvp.md §6](mvvvp.md) | 4 continuous weeks       | MVVP criteria hold + operability targets + compounding value + zero safety incidents |

**Rule:** Do not advance beyond MVP scope until MVP exit criteria hold. Likewise for MVVP → MVVVP.

### MVP fast path from current state

With Phases 0–1 complete, the fastest path to MVP is a constrained execution slice across Phases 2–4. See [mvp.md §10](mvp.md) for the detailed next steps.

---

## 9) Risk Register

| ID  | Risk                                                     | Likelihood | Impact   | Mitigation                                                                       | Phase |
| --- | -------------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------- | ----- |
| R1  | Runtime coupling between `src/` and GitHub Mode          | Medium     | High     | ADR 0001 boundary checks in CI; extension architecture enforcement               | All   |
| R2  | Installed runtime regression from GitHub Mode changes    | Medium     | Critical | ADR 0002 smoke baseline; merge-blocking checks                                   | All   |
| R3  | Malicious skills in trusted workflows (ClawHavoc vector) | Medium     | Critical | Skills quarantine pipeline; deny-by-default; static scan gates                   | 2, 4  |
| R4  | State adapter complexity delays Phase 4                  | High       | Medium   | Start with GitHub Actions artifacts as MVP storage; defer cloud storage          | 4     |
| R5  | Workflow flakiness erodes trust                          | Medium     | Medium   | Deterministic fixtures; quarantine unstable checks; reliability metrics          | 3, 7  |
| R6  | Latency expectations mismatched (UX perceived as broken) | High       | Medium   | Explicit async UX contract; progress checkpoints; CLI status rendering           | 4     |
| R7  | Security lint false positives slow development           | Low        | Low      | Exception process with expiry and maintainer approval                            | 2     |
| R8  | Multi-entity collaboration abuse                         | Low        | High     | Deny-by-default routing; fault containment toggle; dispatch disable              | 6     |
| R9  | Persistent memory schema drift across versions           | Medium     | Medium   | Schema versioning; migration-required incident markers; compatibility validators | 4, 5  |

---

## 10) Test and Verification Strategy

Each phase must include:

- Unit tests for new parser, validator, and policy logic.
- Integration tests for workflow decision boundaries.
- Replay tests for emulated adapters where applicable.
- Regression checks proving installed runtime behavior remains unchanged.

**Minimum pre-merge gate for GitHub-mode codepaths:**

1. Contracts and parity validation (`pnpm contracts:github:validate`).
2. Security lint (permissions, pinning, trigger safety).
3. Upstream sync guard (`.GITHUB-MODE/scripts/check-upstream-additions-only.ts`).
4. Policy and route checks.
5. Eval and cost threshold checks (for impacted subsystems).

---

## 11) Security Acceptance Checklist

All must be true before broad rollout:

1. Secrets are managed only via GitHub Secrets/Environment Secrets.
2. Fork PR workflows have zero secret access.
3. Privileged workflows require trusted actor and/or environment approval.
4. Third-party actions are SHA-pinned.
5. `GITHUB_TOKEN` permissions are explicit and minimal per workflow/job.
6. OIDC replaces static cloud credentials where possible.
7. Bots cannot write directly to protected branches.
8. Promotion requires successful checks and valid attestation.
9. Logs/artifacts are scrubbed for secret leakage risk.
10. Skills pass quarantine pipeline before running in trusted workflows.
11. Compliance checks enforce these controls continuously.

---

## 12) Definition of Done

GitHub Mode implementation is complete when:

1. Installed runtime remains behaviorally stable under regression checks.
2. High-value OpenClaw orchestration, agent execution, routing, tool policy, and eval paths run in GitHub Mode by building and invoking the openclaw runtime from `src/` (fork-context execution per [ADR 0001 amendment](../adr/0001-runtime-boundary-and-ownership.md)).
3. Security controls are fully GitHub-native, continuously enforced, and include supply-chain vetting.
4. Command-to-PR automation is policy-governed, auditable, and safe by default.
5. Promotions are approval-gated with verified attestations.
6. Parity matrix is maintained and improving over time, with explicit interaction-model boundaries documented.
7. Template-generated entities can collaborate through validated, deny-by-default GitHub-native channels.
8. UX progress checkpoints make asynchronous run state legible in both CLI and GitHub surfaces.
9. Metrics pipeline reports adoption, effectiveness, safety, reliability, and operability weekly.
10. MVVVP exit criteria ([mvvvp.md §6](mvvvp.md)) are sustained for 4 continuous weeks.
