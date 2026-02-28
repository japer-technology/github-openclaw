# OpenClaw GitHub Mode Implementation Plan (OLD)

This plan operationalizes `.GITHUB-MODE/docs/overview.md` into phased execution with clear deliverables, gates, and rollback safety.

---

## 1) Program Objectives

1. Deliver a high-functionality GitHub Runtime Plane without regressing installed OpenClaw runtime behavior.
2. Reuse core orchestration/agent/tool-policy paths before introducing adapters.
3. Enforce security through standard GitHub controls (Secrets, Environments, branch protections, approvals, least privilege, OIDC, SHA-pinned actions).
4. Establish measurable functional parity using a maintained parity matrix.
5. Enable safe multi-entity template bootstrap and policy-governed cross-entity collaboration.

---

## 2) Non-Negotiable Guardrails

- Installed runtime behavior must remain unchanged unless explicitly approved by maintainers.
- GitHub mode must never require custom in-repo secret vaulting.
- No privileged workflow execution from untrusted actors/contexts.
- All third-party actions must be pinned to full commit SHA.
- All privileged branch mutations must occur via PR workflow, never direct writes to protected branches.

---

## 2.1) GitHub Actions Runtime Model: Stateless Ephemeral Workers

GitHub-mode workflows must be designed as **stateless, ephemeral workers**. Every job runs in a fresh environment and local disk state is disposable after the run ends. Treat the runner filesystem as temporary scratch space only.

### Externalize before run start

Before any workflow run starts, all state needed for deterministic execution must already exist in durable systems outside the runner:

- **Memory/context state** (agent memory, durable conversation/project context, routing/policy state) must live in managed stores or repository-tracked artifacts.
- **Artifacts and evidence history** (prior reports, summaries, attestations, review evidence) must be persisted in GitHub artifacts/releases/issues/PR metadata or approved external stores.
- **Checkpoints/resume state** (long-running process checkpoints, evaluation baselines, replay markers) must be checkpointed to external storage with stable identifiers.
- **Caches** (dependency caches, model/data caches, build outputs intended for reuse) must be provisioned through explicit cache backends (for example, GitHub cache/artifacts/registry), never implicit local disk reuse.

### Persistence anti-assumptions

Implementations must not rely on any of the following between workflow runs:

- Files written to local disk in a previous run.
- Local databases, temp directories, or process state from prior jobs/runs.
- Runner identity affinity (same host, same VM, same workspace path).
- Unpublished logs or transient job outputs that were not exported as durable artifacts.

### Design implications for this plan

- Any phase deliverable that requires continuity across runs must define its **external state location**, retention window, and recovery behavior.
- Validation and promotion gates must consume only repository content plus explicitly fetched durable state.
- Incident/debug workflows must always emit reproducible evidence bundles so run-to-run forensics never depends on runner-local residue.

### Persistent Memory Design

GitHub-mode requires a durable persistent-memory layer so useful agent context survives runner teardown. The runner filesystem is never a source of truth.

#### System of record

- **Primary system of record:** managed object storage for checkpoint/event blobs and transcripts.
- **Index/query system of record:** managed database for metadata, lookup, and conflict coordination.
- **Optional projection stores:** vector/search indexes may be built as derived views, but they are rebuildable and never authoritative.

#### Read/write timing

- **Run start (hydrate):** load the latest committed memory snapshot plus unapplied deltas for the target scope (`entity`, `repo`, `branch`, `thread`, or `run lineage`).
- **Periodic checkpoints (heartbeat):** persist incremental deltas at deterministic boundaries (for example: command completion, tool batch completion, or fixed wall-clock interval) with monotonic sequence IDs.
- **Run end (finalize):** attempt a final commit that compacts deltas into a new snapshot and records final run status/evidence references.
- **Crash-safe fallback:** if a run exits unexpectedly, previously persisted checkpoints must be replayable without runner-local recovery.

#### Consistency model and conflict handling

- **Consistency target:** read-your-writes within a run scope; eventual consistency across concurrent runs.
- **Versioning:** each write carries `baseVersion` and `newVersion` (or equivalent compare-and-swap token).
- **Conflict policy:** reject stale writes on version mismatch; retry by rehydrating latest state and replaying deterministic pending delta logic.
- **Merge policy:** append-only event log for auditable history, plus periodic snapshot compaction; never silently last-write-wins on structured state.
- **Idempotency:** all writes include idempotency keys (`runId` + `stepId` + `sequence`) so retries cannot duplicate logical events.

#### Failure-mode matrix (implementation contract)

Every storage/checkpoint path in GitHub-mode runtime must implement the following behaviors before Phase 1 is considered complete.

| Failure mode                      | Detection                                                                                                                    | User-visible error                                                       | Retry policy                                                                                                              | Rollback/recovery path                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Storage unavailable               | Any checkpoint hydrate/finalize storage probe returns network timeout, auth error, or backend 5xx.                           | `Persistence backend unavailable; state checkpointing paused.`           | Exponential backoff (`jittered`) with bounded attempts per phase; stop at terminal `failed` once budget is consumed.      | Keep latest committed `MemorySnapshot`/`RunCheckpoint` pointer unchanged; rerun hydrates from last committed version and replays idempotent deltas only.                       |
| Snapshot schema mismatch          | `schemaVersion` unsupported or deserialization/validation rejects hydrated snapshot payload.                                 | `Stored checkpoint format is incompatible with this runtime version.`    | No automatic payload retry. Retry only after schema migrator or runtime compatibility update lands.                       | Write migration-required incident marker in `RunJournal`, preserve original blob immutable, and resume from newly migrated snapshot reference.                                 |
| Scan failures                     | `skill-package-scan`, `lockfile-provenance`, or `policy-eval` gate returns `FAIL` or `INDETERMINATE` after timeout.          | `Preflight scan blocked execution before any agent mutation.`            | One retry permitted for transient scanner infrastructure failures; policy denials are non-retryable without input change. | Fail closed before execution phase; operator remediates policy/inputs and starts new run from hydration boundary.                                                              |
| Runner timeout/preemption         | Job receives cancellation/preemption signal or exceeds watchdog timeout before finalize checkpoint commit.                   | `Runner preempted/timed out; resumable from last durable checkpoint.`    | Auto-resume once when same trust tier + policy hash + commit scope still match; otherwise require explicit rerun.         | New workflow run loads latest `RunCheckpoint` and resumes deterministic remaining steps using `sequence` and idempotency keys.                                                 |
| Partial upload/corrupt checkpoint | Uploaded checkpoint fails checksum/length verification, CAS pointer update fails, or read-after-write integrity check fails. | `Checkpoint finalize failed integrity checks; state promotion canceled.` | Retry upload to new object key using same idempotency key, bounded by finalize retry limit.                               | Preserve previous snapshot pointer, tombstone invalid object key, emit integrity-failure evidence, and re-finalize from in-memory delta buffer or rerun from prior checkpoint. |

#### Retention and TTL policy

- **Hot memory window:** keep frequently-read snapshots/checkpoints for a short operational window (for example, 7-30 days) for fast resume.
- **Warm audit window:** keep append-only event history and run metadata for governance/forensics (for example, 90-365 days).
- **Expiration handling:** TTL expiry must be explicit, policy-driven, and logged in an auditable tombstone record.
- **Legal/compliance overrides:** retention holds supersede TTL deletion when required.

#### Minimal persistent data model (survives runner teardown)

Implementers must persist at least the following records outside the runner:

| Record           | Required fields (minimum)                                                                                              | Purpose                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `MemorySnapshot` | `snapshotId`, `scopeKey`, `version`, `createdAt`, `stateBlobRef`, `schemaVersion`                                      | Latest compacted memory image used for run hydration.      |
| `MemoryDelta`    | `deltaId`, `scopeKey`, `baseVersion`, `newVersion`, `sequence`, `idempotencyKey`, `patchBlobRef`, `createdAt`, `runId` | Ordered incremental updates between snapshots.             |
| `RunCheckpoint`  | `checkpointId`, `runId`, `scopeKey`, `snapshotId`, `lastDeltaSequence`, `status`, `createdAt`                          | Resume marker for in-progress or interrupted runs.         |
| `RunJournal`     | `runId`, `entityId`, `workflowRef`, `commitSha`, `startedAt`, `endedAt`, `outcome`, `artifactRefs`                     | Audit trail tying memory evolution to GitHub run evidence. |

Anything not persisted in this model (or a strict superset) is treated as ephemeral and must be assumed lost after runner teardown.

---

## 3) Workstreams

- **WS-A: Runtime contracts and parity**
- **WS-B: GitHub security foundation**
- **WS-C: Validation/policy/eval/cost workflows**
- **WS-D: Command runtime and bot PR loop**
- **WS-E: Promotion, attestation, and incident operations**
- **WS-F: Multi-entity template and collaboration**
- **WS-G: Observability, compliance, and governance**

---

## 4) Phase-by-Phase Plan

### Phase 0 - Baseline and design locks

### Deliverables

- ADR(s) for installed vs GitHub runtime boundaries.
- Installed runtime regression baseline definition and smoke checks.
- GitHub runtime threat model (trusted/untrusted trigger matrix, abuse cases, mapped controls).

### Task 0 acceptance lock (must all be true before Phase 1)

- **Task 0.1 - Runtime Boundary ADR Package**
  - ADR set is approved by maintainers.
  - Boundaries define ownership, allowed shared modules, and prohibited coupling patterns.
  - Backout trigger (`runtime coupling detected`) is documented and linked in review workflow.
- **Task 0.2 - Installed Runtime Regression Baseline**
  - Baseline smoke checks run in CI and are green on mainline.
  - Baseline failures block merges for GitHub-mode-touching changes.
- **Task 0.3 - GitHub Threat Model + Trigger Matrix**
  - Matrix covers fork PR, internal PR, push, schedule, and manual dispatch.
  - Every abuse case maps to at least one preventive or detective control.
  - Threat model explicitly forbids privileged execution in untrusted contexts and privileged branch mutation outside PR flow.

### Task 0 acceptance evidence snapshot

Status: ✅ Locked and satisfied (2026-02-16).

- ✅ **Task 0.1 evidence captured**
  - ADR package approved in `.GITHUB-MODE/docs/adr/0001-runtime-boundary-and-ownership.md` and `.GITHUB-MODE/docs/adr/0002-installed-runtime-non-regression-guardrails.md`.
  - ADR index records gate status in `.GITHUB-MODE/docs/adr/README.md`.
- ✅ **Task 0.2 evidence captured**
  - Installed-runtime non-regression policy and backout trigger (`runtime coupling detected`) documented in `.GITHUB-MODE/docs/adr/0002-installed-runtime-non-regression-guardrails.md`.
  - CI baseline hooks live in existing install smoke workflows (`.github/workflows/install-smoke.yml` and `.github/workflows/sandbox-common-smoke.yml`) and provide the installed-runtime smoke baseline foundation referenced by Task 0.
- ✅ **Task 0.3 evidence captured**
  - Trigger trust matrix and abuse/control mapping approved in `.GITHUB-MODE/docs/security/0001-github-trigger-trust-matrix.md`.
  - Security index records gate status in `.GITHUB-MODE/docs/security/README.md`.

Phase 1 is authorized to proceed only while this evidence remains valid and approvals remain current.

### Exit criteria

- Maintainers approve ADR + threat model.
- Baseline checks are runnable and green in CI.

### Backout strategy

- If parity work causes runtime coupling, revert to boundary ADR and block merge.

---

### Phase 1 - Contract scaffolding and parity framework

### Deliverables

Create `.GITHUB-MODE/runtime/` core contracts and schemas:

- `manifest.schema.json`
- `runtime-manifest.json`
- `adapter-contracts.json`
- `command-policy.json`
- `trust-levels.json`
- `entity-manifest.schema.json`
- `collaboration-policy.schema.json`
- `collaboration-envelope.schema.json`
- `workspace-convergence-map.json`
- `parity-matrix.json`

Add validators:

- schema validation for all runtime contracts
- parity matrix validator requiring owners + rationale for `installed-only`
- convergence map validator that fails on unmapped high-value installed workflows

### Exit criteria

- Contract validation check is mandatory in CI.
- Parity report artifact generated per PR for changed subsystems.

### Backout strategy

- Contract schema changes are versioned; incompatible changes require migration notes and compatibility validator updates.

---

### Phase 2 - Security foundation (GitHub-native)

### Deliverables

- Secret inventory and rotation policy document.
- Environments: `github-mode-dev`, `github-mode-staging`, `github-mode-prod` with required reviewers and branch/tag restrictions.
- Explicit least-privilege `permissions:` in every GitHub-mode workflow/job.
- OIDC integration for cloud access where applicable.
- Lint check that fails on:
  - unpinned third-party actions
  - over-broad workflow permissions
  - secrets exposed in untrusted triggers

### Exit criteria

- Security lint passes across all GitHub-mode workflows.
- No secrets accessible in fork PR contexts (verified by tests/simulation).
- Environment approvals enforce promotion paths.

### Backout strategy

- Any security control regression blocks release; revert offending workflow changes.

---

### Phase 3 - Core validation, simulation, eval, and cost workflows

### Deliverables

Implement:

- `github-mode-build.yml`
- `github-mode-check.yml`
- `github-mode-test.yml`
- `github-mode-policy.yml`
- `github-mode-route-sim.yml`
- `github-mode-eval-tier0.yml`
- `github-mode-cost.yml`
- `github-mode-sync-templates.yml`

Required behavior:

- deterministic artifacts + markdown summaries
- untrusted-safe behavior for fork PRs
- policy/route drift detection
- threshold gates for eval/cost
- template drift detection with migration guidance or PR output

### Exit criteria

- Required checks gating merges are active.
- Failing policy/eval/cost thresholds block promotion workflows.

### Backout strategy

- If flakiness exceeds tolerance, downgrade workflow from required to informational temporarily and open reliability incident.

---

### Phase 4 - Command runtime and bot PR loop

### Deliverables

Implement:

- `github-mode-command.yml`
- `github-mode-agent-run.yml`
- `github-mode-bot-pr.yml`

Command support baseline:

- `explain`
- `refactor`
- `test`
- `diagram`

Required behavior:

- trust-aware command authorization
- policy-gated adapter invocation
- blocking pre-agent gates for skill/package scan, lockfile/provenance checks, and policy evaluation
- required state adapter pipeline (snapshot hydrate/validate/run/persist/record)
- provenance metadata embedded in outputs (source command, commit SHA, run id, policy version)
- no direct writes to protected branches

Gate semantics for `github-mode-command.yml` and `github-mode-agent-run.yml`:

- fail-closed execution: gate failures (or missing/indeterminate gate verdicts) stop workflow before any agent step
- deterministic gate ordering: skill/package scan → lockfile/provenance checks → policy evaluation
- minimal pass/fail reporting emitted to markdown summary and machine-readable artifact:

```text
gate=<skill-package-scan|lockfile-provenance|policy-eval>
result=<PASS|FAIL>
reason=<short machine-parseable reason>
evidence=<artifact-or-log-reference>
```

State adapter pipeline acceptance criteria:

1. Download snapshot at workflow start.
2. Validate version/schema compatibility.
3. Run agent.
4. Upload snapshot/checkpoint atomically.
5. Record run metadata and snapshot ID.

Candidate storage targets and selection criteria:

| Storage target                                  | Latency profile                                      | Cost profile                                    | Access control profile                                                     |
| ----------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| GitHub Actions artifacts                        | Low in-run retrieval in same repository workflows    | Included quota + overage for retention growth   | GitHub repo permissions + workflow-scoped access; good default for MVP     |
| GitHub Releases assets                          | Medium retrieval; optimized for versioned publishing | Low/medium depending on release retention       | Repository release permissions; stronger change visibility than artifacts  |
| Cloud object storage via OIDC (S3/GCS/Azure)    | Low/medium depending on region placement             | Pay-per-request + storage tiers; highly tunable | Fine-grained IAM via OIDC federation; strongest policy isolation controls  |
| Managed KV/database metadata index + blob store | Low lookup for metadata, medium for blob fetch       | Higher operational cost but predictable scaling | Service-level RBAC + row/object policy; good for multi-tenant coordination |

Selection criteria:

- Pick the lowest-latency option that keeps end-to-end command flow within SLO for snapshot hydrate + finalize.
- Minimize total cost at expected checkpoint frequency and retention window (hot + warm tiers).
- Require least-privilege access control, auditable writes, and environment-scoped credentials.
- Prefer options that support atomic write semantics or transactional indirection (upload then pointer swap).
- Ensure lifecycle controls support TTL, legal hold overrides, and reproducible incident forensics.

### Exit criteria

- Trusted users can trigger command-to-PR flow end-to-end.
- Agent execution cannot run unless all three pre-agent gates pass.
- Untrusted users cannot invoke privileged adapters or secret-backed paths.

### Backout strategy

- If command abuse is detected, disable privileged command handlers and keep read-only explain flows.

---

### Phase 5 - Promotion, attestation, and incident operations

### Deliverables

Implement:

- `github-mode-promote-dev.yml`
- `github-mode-promote-staging.yml`
- `github-mode-promote-prod.yml`
- `github-mode-drift.yml`
- `github-mode-incident.yml`

Add attestation generation + verification with required fields:

- commit/environment
- policy/routing/agent revisions
- model ids + dataset hashes
- eval/cost results
- approvers + UTC timestamp
- artifact/run references

### Exit criteria

- Promotions require green gates + environment approval + valid attestation.
- Drift and incident workflows create evidence-linked issues automatically.

### Backout strategy

- If attestation verification fails, promotion remains blocked and incident issue is auto-created.

---

### Phase 6 - Multi-entity bootstrap and collaboration

### Deliverables

Implement:

- `github-mode-bootstrap-entity.yml`
- `github-mode-collab-dispatch.yml`
- `github-mode-collab-receive.yml`

Add entity template baseline validator for:

- labels
- issue forms
- PR templates
- CODEOWNERS
- environment placeholders
- branch protection expectations

Collaboration requirements:

- enforce collaboration policy routes (deny-by-default)
- validate envelope fields (source/target entity, intent, correlation id, run id, policy version, ttl)
- audit traces via artifacts + workflow summaries

### Exit criteria

- Two template-generated entities can collaborate on allowlisted intents.
- Blocked/untrusted intents are rejected with auditable evidence.

### Backout strategy

- On repeated collaboration failures or abuse, disable dispatch permissions and leave receive validation in monitor-only mode.

---

### Phase 7 - Observability, compliance, and program handoff

### Deliverables

- Standardized artifact schemas and summary format.
- Metrics pipeline for:
  - parity coverage trend
  - workflow reliability/flakiness
  - bot PR throughput + acceptance
  - collaboration success/failure + latency
  - policy/security violation rates
  - promotion lead/rollback time
- Operational playbooks:
  - secret/API key rotation
  - emergency revocation
  - compromised token response
  - attestation audit + rollback

### Exit criteria

- Dashboards/reports available to maintainers.
- Governance playbooks reviewed and linked in docs.

### Backout strategy

- If telemetry quality is low, keep gating on hard checks while metrics instrumentation is repaired.

---

## 5) Test and Verification Strategy

Each phase must include:

- unit tests for new parser/validator/policy logic
- integration tests for workflow decision boundaries
- replay tests for emulated adapters where applicable
- regression checks proving installed runtime behavior remains unchanged

Minimum pre-merge gate for GitHub-mode codepaths:

1. contracts/parity validation
2. security lint (permissions, pinning, trigger safety)
3. policy/route checks
4. eval + cost threshold checks (for impacted subsystems)

---

## 6) Security Acceptance Checklist

All must be true before broad rollout:

1. Secrets are managed only via GitHub Secrets/Environment Secrets.
2. Fork PR workflows have zero secret access.
3. Privileged workflows require trusted actor and/or environment approval.
4. Third-party actions are SHA-pinned.
5. `GITHUB_TOKEN` permissions are explicit and minimal.
6. OIDC replaces static cloud credentials where possible.
7. Bots cannot write directly to protected branches.
8. Promotion requires successful checks and valid attestation.
9. Logs/artifacts are scrubbed for secret leakage risk.
10. Compliance checks enforce these controls continuously.

---

## 7) Milestones

- **M1:** Phase 0-1 complete (contracts + parity + threat model + baseline checks)
- **M2:** Phase 2 complete (security foundation)
- **M3:** Phase 3 complete (validation/policy/eval/cost/template drift workflows)
- **M4:** Phase 4 complete (command + agent-run + bot PR)
- **M4.1 (required):** State adapter pipeline complete with acceptance criteria satisfied and storage target selected by latency/cost/access-control review
- **M5:** Phase 5 complete (promotion + attestation + drift/incident)
- **M6:** Phase 6 complete (multi-entity bootstrap/collaboration)
- **M7:** Phase 7 complete (observability + compliance + governance handoff)

---

## 8) Definition of Done

GitHub mode implementation is complete when:

1. Installed runtime remains behaviorally stable under regression checks.
2. High-value OpenClaw orchestration/policy/eval paths run in GitHub mode using shared core modules.
3. Security controls are fully GitHub-native and continuously enforced.
4. Command-to-PR automation is policy-governed, auditable, and safe by default.
5. Promotions are approval-gated with verified attestations.
6. Parity matrix is maintained and improving over time.
7. Template-generated entities can collaborate through validated, deny-by-default GitHub-native channels.
