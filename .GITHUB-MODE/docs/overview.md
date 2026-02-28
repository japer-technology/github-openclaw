# OpenClaw GitHub Mode

## Document Purpose

This document defines a **high-fidelity GitHub Runtime Plane** for OpenClaw that can run substantial assistant behavior from repository commits and workflows, while preserving the existing installed/runtime experience on user devices.

It is a product and architecture spec, not an implementation checklist (that lives in `.GITHUB-MODE/docs/planning/implementation-plan.md`).

---

## 1) Why GitHub Mode Exists

OpenClaw already ships a broad assistant runtime:

- Multi-channel messaging surfaces (core + extension channels)
- Agent orchestration (`src/auto-reply/reply`, `src/agents/pi-embedded-runner`)
- Tooling and policy gates (`src/agents/tools`, `src/agents/pi-tools.ts`, `src/agents/tool-policy.ts`)
- CLI-first operations plus gateway/web/app control surfaces
- Safety, routing, pairing/allowlist, and model failover behavior

GitHub mode exists to bring this runtime into repository workflows so teams can:

- validate behavior contracts and policy changes continuously
- run replay/eval/cost checks from source control
- execute trusted command-driven automation
- generate durable outputs (issues, PRs, attestations, artifacts)
- promote with approvals and auditable evidence

### 1.1 Core Principle

**Reuse OpenClaw behavior contracts at interface boundaries; extract shared libraries where needed and keep runtime implementations behind adapters.**

### 1.2 Hard Constraint

**No installed-runtime regressions are allowed.** GitHub mode is additive.

---

## 2) Runtime Planes and Boundaries

### 2.1 Installed Runtime Plane (existing, unchanged)

OpenClaw installed on macOS/Linux/Windows (WSL), with long-lived gateway and channel sessions, keeps all current behavior:

- persistent channel connections/sockets
- local hardware/node features (camera/mic/location/screen/system actions)
- app-level integrations (macOS menu bar app, iOS/Android node flows)
- existing onboarding, pairing, and allowlist safety paths

### 2.2 GitHub Runtime Plane (new)

OpenClaw executes from repo state in GitHub Actions/Environments:

- pull request checks and simulations
- issue/PR comment command workflows
- scheduled drift/eval monitoring
- policy-gated bot PRs
- approval-gated promotions with attestations

### 2.3 Explicit non-goals for initial rollout

- replacing installed always-on channel session handling
- directly exposing device-bound hardware actions in untrusted workflows
- bypassing GitHub security primitives with custom secret infrastructure

---

## 3) Functional Coverage Model

Every installed feature is classified in `.GITHUB-MODE/runtime/parity-matrix.json` as one of:

- `native`: runs unchanged in GitHub mode
- `adapter`: same semantics via a GitHub-safe adapter
- `emulated`: replay/mock harness with measured fidelity
- `installed-only`: explicitly out of GitHub scope (for now)

### 3.1 Coverage targets

1. Maximize `native + adapter` for high-value paths.
2. Use `emulated` for deterministic replay where persistence/device constraints exist.
3. Keep `installed-only` narrow, documented, and owner-assigned.
4. Define parity at the task outcome level, not as identical latency or interaction mechanics.

### 3.2 Initial high-value parity priorities

1. orchestration and tool-policy flow
2. routing and policy behavior contracts
3. eval/regression and cost envelopes
4. command-to-PR automation lifecycle
5. promotion/attestation/incident governance

### 3.3 Interaction model boundaries (intentional non-parity)

GitHub mode targets capability parity for approved task classes, but it does not target UX/latency parity with the installed runtime.

| Dimension            | Local synchronous loop (installed runtime)                  | GitHub asynchronous loop (GitHub Mode)                  |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Primary interaction  | conversational, turn-by-turn                                | command/event-driven, run-by-run                        |
| Feedback timing      | immediate streaming + inline follow-up                      | delayed by queueing, runner startup, job execution      |
| User control surface | terminal/app/channel session                                | issue/PR comments, checks, summaries, artifacts         |
| State continuity     | long-lived local session context                            | workflow-scoped context plus committed artifacts        |
| Best fit             | fast iteration, exploratory debugging, device-coupled tasks | governed automation, reviewable changes, team approvals |
| UX expectation       | tight loop and low interaction latency                      | auditable loop with higher end-to-end latency           |

### 3.4 UX contract for asynchronous GitHub runs

GitHub mode UX should behave like a visible asynchronous queue, not a hanging terminal session.

#### Expected delay profile

- **Queueing delay:** usually short, but may spike during org-wide CI load or constrained runner capacity.
- **Provisioning delay:** runner startup and checkout add fixed overhead before assistant logic starts.
- **Execution delay:** task complexity (tests, policy checks, artifact generation, PR updates) determines run duration.
- **Human-gated delay:** runs that request clarification or approvals can pause indefinitely until input arrives.

The product requirement is not to eliminate delay, but to make delay legible with explicit state transitions and timestamps.

#### Required progress checkpoints

GitHub mode remote runs must report the same checkpoint lifecycle so operators can correlate workflow runs, comments, and local CLI status output.

Always emit checkpoints in this order:

1. **Provisioning:** resolve trust level, runner target, credentials, and workflow prerequisites.
2. **Runner startup:** allocate/start the runner and launch the job environment.
3. **Hydration:** fetch checkout + checkpoint context and load run inputs/contracts.
4. **Scanning:** run preflight probes (policy gates, capability checks, route/permission checks).
5. **Execution:** execute the requested command/task automation.
6. **Upload/finalize:** persist artifacts/checkpoints, emit final status, and publish handoff output.

If a checkpoint is intentionally not needed, emit it with `skipped` so timelines stay phase-aligned.

#### Checkpoint mapping to CLI + status surfaces

Use existing terminal primitives for local operator visibility:

- progress/spinner rendering: `src/cli/progress.ts`
- tabular status rendering: `src/terminal/table.ts`

| Checkpoint      | Live progress label (operator CLI)    | `openclaw status --all` expectation                                | `openclaw status --deep` expectation                                            |
| --------------- | ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Provisioning    | `Provisioning GitHub run…`            | Show trigger source, trust context, and queue/provisioning reason. | Include remote reachability or queue constraints before deep probes.            |
| Runner startup  | `Starting GitHub runner…`             | Show runner allocation/startup state and elapsed timing.           | Include job/runner probe evidence when available.                               |
| Hydration       | `Hydrating workflow context…`         | Show checkout/config/checkpoint readiness and contract load state. | Include hydration probe details for fetch/auth/contract load failures.          |
| Scanning        | `Scanning policy and capabilities…`   | Show gate outcomes and actionable warnings before execution.       | Include failing probe identifiers, timeout class, and first actionable blocker. |
| Execution       | `Executing GitHub task…`              | Show active phase or last confirmed active phase.                  | Include deep probe deltas tied to execution failures or runtime constraints.    |
| Upload/finalize | `Uploading artifacts and finalizing…` | Show terminal outcome with artifact/handoff availability.          | Include final probe state plus completion-time regressions if detected.         |

#### Fallback when telemetry is unavailable

When telemetry is delayed, partial, or unavailable:

1. Preserve deterministic checkpoint ordering and continue showing the **last confirmed checkpoint**.
2. Mark unresolved state as `unknown` (never infer completion from silence).
3. Add an explicit degraded-telemetry note to `status --all`.
4. Include timeout/failure probe details in `status --deep` to explain visibility gaps.
5. On terminal transition, emit a best-effort end state (`completed`, `failed`, or `unknown`) so automation can stop waiting.

#### User-facing state model

| State              | What it means for the user                                                     | CLI surface (local operator view)                                                                   | GitHub surface (issue/PR/checks)                                                                    |
| ------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `queued`           | Request accepted, waiting for runner slot or prior workflow completion         | Show an active wait line/spinner with queue reason and elapsed time                                 | Post an acknowledgement comment and show pending check/status                                       |
| `provisioning`     | Runner starting, repository/checkpoint hydration, baseline setup in progress   | Update status text to provisioning phases (runner start, checkout, hydrate) with elapsed timer      | Check/status remains in-progress; optional progress comment edit with current provisioning step     |
| `running`          | Assistant logic is actively executing tools/policies/tasks                     | Stream coarse phase updates (planning, edits, validation, packaging) and keep elapsed timer visible | In-progress check with step summary in job logs and workflow summary artifact                       |
| `waiting_on_input` | Automation is blocked on human decision, clarification, or privileged approval | Mark run as paused and print exactly what input is needed plus how to resume                        | Comment requesting input, apply waiting label/status marker, and stop further execution until reply |
| `completed`        | Run finished successfully with final outputs ready for review/merge/handoff    | Print final summary with outcome, changed files/artifacts, and next command hints                   | Final success check plus completion comment linking PR/artifacts/attestations                       |
| `failed`           | Run terminated with an error or policy block that requires intervention        | Print failure class, first actionable error, and rerun/resume guidance                              | Failed check with concise failure summary and links to failing step/log section                     |

#### Status notification pattern

- Emit notifications on **state change**, not on every log line.
- Include **run id**, **current state**, **elapsed time**, and **next expected transition** when known.
- Prefer **single-thread progress updates** (comment edits or one canonical status thread) over noisy comment spam.
- Keep state wording stable across CLI and GitHub so users can map local and remote views without translation.

#### Completion handoff pattern

When a run reaches `completed` or `failed`, handoff must be explicit:

1. **Outcome statement:** one-line final state with timestamp.
2. **Evidence bundle:** links to workflow run, logs, artifacts, and produced PR/commit if any.
3. **Operator action:** clear next step (`review PR`, `approve`, `provide input`, `retry with command ...`).
4. **Ownership continuity:** identify who/what should act next (requester, reviewer, release owner, or automation).

---

## 4) Architecture

### 4.1 Fork-context runtime execution

GitHub Mode runs inside a fork that contains the full OpenClaw source tree. The fork already has all of `src/` — agents, auto-reply, routing, tool policy, providers, memory, security, config, plugins, and infrastructure. GitHub Mode workflows build and run this runtime directly.

**Build-from-source execution model:**

1. Workflows run `pnpm install && pnpm build` to produce the full openclaw runtime.
2. Agent execution uses `src/agents/pi-embedded-runner` and `src/auto-reply/reply` — the same orchestration that powers the installed runtime.
3. Routing uses `src/routing/` — the same agent route resolution logic.
4. Tool policy uses `src/agents/tool-policy.ts` and `src/agents/tools/` — the same policy gates.
5. Provider calls use `src/providers/` — the same model integrations (Anthropic, OpenAI, etc.).
6. Memory uses `src/memory/` — the same conversation context system.
7. Config uses `src/config/` — the same configuration loading and validation.

This means GitHub Mode is not a separate reimplementation or a governance-only overlay — it runs the actual OpenClaw "magic" inside GitHub Actions. The governance layer (contracts, security lint, policy validation) adds safety and auditability on top.

**What the governance layer provides (contract-driven, no src imports):**

- Contract artifacts and schemas in `.GITHUB-MODE/runtime/**`
- Security lint, drift detection, and policy validation scripts
- Pre-agent security gates (skill scan, lockfile/provenance, policy evaluation)
- Trust-level enforcement and adapter authorization
- Provenance metadata embedding and verification

**What the execution layer provides (fork-context src usage):**

- Agent execution engine (`src/agents/`) for AI reasoning and task completion
- Auto-reply orchestration (`src/auto-reply/`) for model interaction and conversation flow
- Routing logic (`src/routing/`) for agent selection and message handling
- Tool invocation (`src/agents/tools/`) for code editing, file operations, web search, etc.
- Provider integrations (`src/providers/`) for model API calls
- Memory and sessions (`src/memory/`, `src/sessions/`) for conversation context
- Plugin system (`src/plugins/`, `src/plugin-sdk/`) for extensibility
- Security checks (`src/security/`) for runtime audit and tool policy

**Boundary rule:** `.GITHUB-MODE` PRs must not modify `src/**` files. Source changes are upstream-owned and sync separately. See [ADR 0001 fork-context amendment](adr/0001-runtime-boundary-and-ownership.md).

### 4.2 GitHub overlay components

### Ingress

- `issue_comment`
- `pull_request_review_comment` / PR comment surfaces
- `workflow_dispatch`
- `schedule`
- (trusted) `repository_dispatch` and `workflow_call`

### Runtime

- openclaw built from source (`pnpm install && pnpm build`)
- same agent orchestration loop (`src/agents/pi-embedded-runner`, `src/auto-reply/reply`)
- same routing and agent selection (`src/routing/`)
- same tool policy and activation gates (`src/agents/tool-policy.ts`)
- same model provider integrations (`src/providers/`)
- trust-aware command parsing
- policy-gated tool activation via pre-agent security gates

### Adapters

- patch-planning + repository write adapters
- docs/diagram generation adapters
- route/policy simulation adapters
- replay/memory/channel emulation adapters

### 4.3 Failure-mode contract for checkpointed GitHub runs

GitHub-mode architecture must fail closed with deterministic recovery semantics whenever durability or execution guarantees degrade.

| Failure mode                      | Detection                                                                                                                             | User-visible error                                                                                | Retry policy                                                                                                                | Rollback/recovery path                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage unavailable               | Hydration/finalize read-write probe fails (timeout, auth denial, or 5xx) before `MemorySnapshot`/`RunCheckpoint` operations complete. | `Persistence backend unavailable; run paused before state mutation. No new checkpoint committed.` | Exponential backoff with bounded attempts per checkpoint boundary; mark run `failed` when retry budget is exhausted.        | Keep last committed snapshot/checkpoint as source of truth; next run rehydrates from previous committed version and replays only idempotent pending deltas.    |
| Snapshot schema mismatch          | Snapshot manifest `schemaVersion` is unsupported or validation fails during hydration.                                                | `Checkpoint schema mismatch; this runner cannot safely load stored state.`                        | Do not blindly retry the same payload; retry only after migration or compatibility shim is available.                       | Preserve original snapshot immutably, mark run `failed` as migration-required, and resume from migrated snapshot ID after conversion success.                  |
| Scan failures                     | Preflight gate (`skill-package-scan`, `lockfile-provenance`, `policy-eval`) returns FAIL or cannot produce a verdict within timeout.  | `Preflight security scan failed; execution blocked before agent steps.`                           | Retry once for transient execution errors; never auto-retry policy-denied verdicts.                                         | Keep fail-closed state with zero execution side effects; operator fixes scan/policy inputs and reruns from hydration checkpoint.                               |
| Runner timeout/preemption         | GitHub cancellation signal, runner eviction, or watchdog timeout before terminal checkpoint.                                          | `Runner stopped before completion; run can resume from last durable checkpoint.`                  | Auto-resume only when trust/policy context is unchanged and retry budget remains; otherwise require explicit rerun command. | Start a new run, hydrate latest `RunCheckpoint`, and replay deterministic remaining work from the last acknowledged sequence.                                  |
| Partial upload/corrupt checkpoint | Finalize checksum/size verification fails, pointer-swap CAS fails, or immediate read-back decode fails.                               | `Checkpoint upload incomplete or corrupt; new state was not promoted.`                            | Retry upload with same idempotency key and fresh object target; cap retries to avoid duplicate promotions.                  | Leave previous snapshot pointer unchanged, tombstone corrupt object references, and re-finalize from buffered deltas or rerun from prior committed checkpoint. |

### Egress

- checks/statuses
- workflow summaries
- artifacts (machine + human readable)
- issue/PR comments
- bot branches/PRs
- attestations

---

## 5) Repository Contracts

GitHub mode uses repository-native contracts as control surfaces:

- `routing/`
- `policies/`
- `agents/`
- `datasets/`
- `eval/`
- `attestations/`
- `docs/ai/`
- `.GITHUB-MODE/runtime/` (GitHub mode contracts)

### 5.1 Required `.GITHUB-MODE/runtime/` artifacts

- `runtime-manifest.json`
- `adapter-contracts.json`
- `command-policy.json`
- `trust-levels.json`
- `parity-matrix.json`
- `workspace-convergence-map.json`

Schemas are versioned and validated in CI.

---

## 6) Multi-Entity Template Model

GitHub mode must support creating **multiple OpenClaw entities** in one user/org account with repeatable scaffold and safe collaboration.

Each entity repo must define (Phase 6 deliverables; not yet implemented):

- `.GITHUB-MODE/runtime/entity-manifest.json`
- `.GITHUB-MODE/runtime/collaboration-policy.json`
- `.GITHUB-MODE/runtime/remote-entities.json`

### 6.1 Bootstrap baseline

Every entity template includes:

- issue forms
- PR templates
- labels
- CODEOWNERS
- branch protection expectations
- environment placeholders and required secrets/variables docs
- baseline GitHub-mode workflows in known-good state

### 6.2 Collaboration envelope requirements

Cross-entity messages must include:

- source entity id
- target entity id
- intent/command type
- source commit SHA + run id
- trust level + policy version
- correlation id
- created timestamp + ttl

Collaboration is deny-by-default: only allowlisted routes in collaboration policy can execute.

---

## 7) Security Model (GitHub-native)

### 7.1 Control requirements

- secrets only via GitHub Secrets / Environment Secrets
- non-sensitive config via Variables
- no secrets in logs/artifacts/cache keys/workflow inputs
- no secret access for untrusted fork PR contexts
- explicit least-privilege `permissions:` on every workflow/job
- third-party actions pinned by full commit SHA
- OIDC federation preferred over static cloud credentials
- protected branches cannot be written directly by bots

### 7.2 CI data persistence anti-pattern

Do **not** commit binary vector database snapshots (for example LanceDB files) into the source repository during normal CI cycles. This is an anti-pattern because it inflates repository history, reduces reviewability, and creates avoidable supply-chain and governance risk around opaque binary blobs.

Approved alternatives:

- store snapshot binaries in object storage with explicit retention and access controls
- use GitHub Actions artifacts for transient exchange between CI jobs
- commit only compact textual summaries when they are low-frequency and explicitly human-reviewed

### 7.3 Trust tiers

- **Untrusted**: forks/unknown actors; read-only and constrained adapters only
- **Semi-trusted**: internal PR contexts; moderate capabilities, no production mutation
- **Trusted**: maintainers/approved env; privileged command and promotion paths

Command authorization occurs before any privileged tool execution.

---

## 8) Workflow Portfolio

### 8.1 Validation and simulation

- `github-mode-build.yml`
- `github-mode-check.yml`
- `github-mode-test.yml`
- `github-mode-policy.yml`
- `github-mode-route-sim.yml`
- `github-mode-eval-tier0.yml`
- `github-mode-cost.yml`

### 8.2 Conversational and PR automation

- `github-mode-command.yml`
- `github-mode-agent-run.yml`
- `github-mode-bot-pr.yml`

Before any agent execution job starts, `github-mode-command.yml` and `github-mode-agent-run.yml` must enforce blocking preflight gates for:

- skill/package scan
- lockfile/provenance checks
- policy evaluation

These gates are fail-closed: if any gate cannot produce a passing decision, the workflow terminates before agent execution.

Minimal gate reporting format (markdown summary + JSON artifact):

```text
gate=<skill-package-scan|lockfile-provenance|policy-eval>
result=<PASS|FAIL>
reason=<short machine-parseable reason>
evidence=<artifact-or-log-reference>
```

### 8.3 Collaboration and template governance

- `github-mode-bootstrap-entity.yml`
- `github-mode-sync-templates.yml`
- `github-mode-collab-dispatch.yml`
- `github-mode-collab-receive.yml`

### 8.4 Promotion and operations

- `github-mode-promote-dev.yml`
- `github-mode-promote-staging.yml`
- `github-mode-promote-prod.yml`
- `github-mode-drift.yml`
- `github-mode-incident.yml`

---

## 9) Attestation and Promotion

Every promotion emits a tamper-evident attestation with at least:

- commit/environment
- policy/routing/agent revisions
- model ids + dataset hashes
- eval summary + cost budget result
- approvers + timestamp
- artifact/run references

Promotion gates require green validation + explicit environment approvals.

---

## 10) Observability and Governance

GitHub mode produces standardized summaries/artifacts for:

- parity score trends
- workflow reliability/flakiness
- command throughput and bot PR acceptance
- collaboration success/failure and latency
- policy/security violations
- promotion lead time and rollback time

All metrics are reproducible from commit + artifacts.

---

## 11) Success Criteria

GitHub mode is successful when all of the following are true:

1. Installed runtime behavior remains unchanged under regression suite.
2. High-value OpenClaw paths run in GitHub mode through shared core modules.
3. Security posture is fully enforced by GitHub native controls.
4. Command-driven automation produces auditable, policy-governed PR outputs.
5. Promotions are approval-gated and backed by valid attestations.
6. Parity matrix is maintained and trending upward.
7. Template-generated entities can safely collaborate via governed GitHub-native channels.

This preserves OpenClaw's local-first installed experience while making repository-native operations first-class.
