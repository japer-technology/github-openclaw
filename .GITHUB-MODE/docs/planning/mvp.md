# OpenClaw GitHub Mode MVP

This document defines the **minimum viable implementation** of GitHub Mode for OpenClaw.

Terminology note: in product practice, **MVP** means **Minimum Viable Product**. The term is widely credited to Frank Robinson and later popularized through Eric Ries and the Lean Startup model.

It intentionally narrows scope from `.GITHUB-MODE/docs/overview.md` and `.GITHUB-MODE/docs/planning/implementation-plan.md` so we can ship a secure, useful first version quickly while preserving the current installed runtime.

---

## 1) MVP Outcomes

The MVP is successful when a maintainer can:

1. Run GitHub-mode validation on pull requests with deterministic artifacts.
2. Trigger a trusted command from GitHub and receive a bot PR instead of direct branch mutation.
3. Verify that trust/policy gates block untrusted privileged actions.
4. See a parity snapshot that explains what is currently native, adapter-based, emulated, or installed-only.

Non-goal: full parity with device-bound or long-lived installed runtime behavior.

Working definition used here: the smallest product increment that enables validated learning with minimal effort.

---

## 2) MVP Scope

### 2.1 In scope

- **Fork-context src execution** — workflows build and run the openclaw runtime from `src/` for agent execution, routing, tool policy, and provider calls (per [ADR 0001 fork-context amendment](../adr/0001-runtime-boundary-and-ownership.md)).
- `.GITHUB-MODE/runtime/` contract scaffolding with schema validation in CI.
- Security baseline for GitHub workflows (least privilege, SHA-pinned actions, trust-tiered behavior).
- Three baseline workflow classes:
  - PR validation/checks
  - Trusted command-to-bot-PR flow (using the built openclaw agent engine from `src/agents/`)
  - Drift/policy visibility artifacts

### 2.2 Explicitly out of scope for MVP

- Promotion pipeline with full attestation chain across dev/staging/prod.
- Multi-entity collaboration dispatch/receive protocol.
- Replacement of installed always-on channel sessions.
- Device hardware actions in untrusted GitHub execution contexts.

---

## 3) MVP Runtime Contracts

Create `.GITHUB-MODE/runtime/` with the smallest contract set needed to operate safely:

- `runtime-manifest.json`
- `adapter-contracts.json`
- `command-policy.json`
- `trust-levels.json`
- `parity-matrix.json`
- `workspace-convergence-map.json`

MVP contract rules:

- Every contract must have a schema and CI validator.
- `parity-matrix.json` entries marked `installed-only` require owner + rationale.
- Changes to contract versions must include migration notes in PR description.

---

## 4) MVP Workflows

### 4.1 PR validation workflow (required)

Implement `github-mode-check.yml` (or equivalent naming) as a required check:

- Validate .GITHUB-MODE/runtime schemas and contracts.
- Run policy and routing checks relevant to changed files.
- Publish deterministic artifacts + a concise markdown summary.
- Run safely for fork PRs with no secrets exposure.

### 4.2 Trusted command workflow (MVP command set)

Implement `github-mode-command.yml` with trust-aware command parsing from issue/PR comments.

MVP commands:

- `explain`
- `test`
- `refactor` (scoped)

Command constraints:

- Untrusted actors: read-only/analysis-safe command handling.
- Trusted actors: policy-gated adapter usage.
- Before agent execution, run blocking gates in order: skill/package scan, lockfile/provenance checks, policy evaluation.
- Gates are fail-closed: any gate failure (or missing verdict) halts workflow before agent execution.
- Emit minimal pass/fail gate output in workflow summary/artifacts:
  - `gate=<skill-package-scan|lockfile-provenance|policy-eval>`
  - `result=<PASS|FAIL>`
  - `reason=<short machine-parseable reason>`
  - `evidence=<artifact-or-log-reference>`
- All mutation paths end in bot branch + PR; never direct writes to protected branches.

### 4.3 Bot PR workflow

Implement `github-mode-bot-pr.yml`:

- Opens PR with provenance block (command, actor, SHA, run id, policy version).
- Attaches artifact links and summary.
- Marks PR clearly as automation-generated.

### 4.4 Drift visibility workflow

Implement a lightweight scheduled workflow (`github-mode-drift.yml`) that:

- Re-validates contracts/parity assumptions.
- Opens or updates an issue when drift is detected.
- Includes machine-readable artifact for follow-up automation.

---

## 5) Security Baseline (MVP Gate)

All MVP workflows must satisfy:

1. Explicit minimal `permissions:` at workflow/job level.
2. Third-party actions pinned to full commit SHA.
3. No secret access in untrusted fork contexts.
4. No secret values written to logs/artifacts/cache keys.
5. Trusted operations require trusted actor and/or protected environment approval.
6. Protected branches are mutated only via reviewed PR flow.

A workflow failing these rules is blocked from merge.

---

## 6) Parity Strategy for MVP

MVP does not attempt full feature parity. It focuses on high-value confidence loops:

1. Orchestration + tool-policy behavior validation.
2. Routing/policy contract confidence in PR checks.
3. Command-to-PR lifecycle under trust constraints.

Initial parity target:

- Prioritize `native + adapter` coverage for these loops.
- Allow `emulated` for deterministic replay paths where needed.
- Keep `installed-only` documented and intentionally narrow.

---

## 7) MVP Acceptance Criteria

GitHub Mode MVP is complete when all are true:

1. Required PR check enforces .GITHUB-MODE/runtime contract validity and trust-safe execution.
2. Trusted maintainer command can produce a bot PR end-to-end.
3. Untrusted actor cannot trigger privileged adapters or secret-backed paths.
4. Parity matrix artifact is produced and visible in CI summaries.
5. Installed runtime behavior remains unchanged for existing users.

---

## 8) MVP Rollout Plan

### 8.1 Phase A (internal-only)

- Enable workflows on default branch with maintainer-only command triggers.
- Measure reliability/flakiness and harden summaries/artifacts.

### 8.2 Phase B (limited trusted users)

- Expand trusted command users.
- Keep privileged adapters scoped and audited.

### 8.3 Phase C (default-on required checks)

- Enforce PR checks as required branch protection status checks.
- Keep command workflow guardrails unchanged unless explicitly reviewed.

Rollback policy:

- If abuse or reliability regressions occur, disable mutation-capable command paths and retain read-only validation checks.

---

## 9) Follow-on Work (Post-MVP)

After MVP stability, expand toward the full plan:

- Promotion workflows with attestations.
- Cost/eval threshold gating at broader coverage.
- Multi-entity template bootstrap and collaboration envelope enforcement.
- Governance dashboards and incident automation depth.

This sequencing keeps MVP practical while staying aligned with the long-term GitHub Mode architecture.

---

## 10) MVP from Task 0 (Execution Slice)

With Task 0 complete, the fastest path to MVP is a constrained execution slice across Phases 1–4, with lightweight drift visibility.

### 10.1 Required next steps

1. **Finish contract enforcement (Phase 1 MVP cut)**
   - Ensure the runtime contract set is complete and CI-validated (`runtime-manifest`, `adapter-contracts`, `command-policy`, `trust-levels`, `parity-matrix`, `workspace-convergence-map`).
   - Enforce installed-only owner/rationale and contract version migration notes.

2. **Ship required PR validation workflow**
   - Implement `github-mode-check.yml` as a required status check.
   - Validate contracts/schemas, run policy-routing checks for relevant changes, and emit deterministic artifacts + concise markdown summary.
   - Preserve fork safety (no secrets in untrusted contexts).

3. **Implement trusted command → bot PR loop (MVP commands only)**
   - Implement command handling for `explain`, `test`, and scoped `refactor`.
   - Enforce trust-aware authorization and policy-gated adapter calls.
   - Route all mutations through bot branch + PR flow; never direct writes to protected branches.

4. **Add scheduled drift visibility**
   - Implement lightweight `github-mode-drift.yml` to re-validate contracts/parity assumptions.
   - Open/update drift issue with machine-readable artifact when drift is detected.

5. **Make MVP security baseline merge-blocking**
   - Explicit minimal workflow/job permissions.
   - SHA-pinned third-party actions.
   - No secret access in untrusted fork runs.
   - No secret leakage into logs/artifacts/cache keys.
   - Trusted operations gated by trusted actor and/or approval.
   - Protected branch mutation only via reviewed PR flow.

### 10.2 Explicit deferrals (post-MVP)

- Promotion pipeline with full attestation chain.
- Multi-entity bootstrap/collaboration protocol.
- Deeper governance dashboards and incident automation.

### 10.3 MVP completion gate (unchanged)

MVP is complete only when all section 7 acceptance criteria are satisfied. This execution slice is intended to reach those criteria quickly without pulling in non-MVP scope.

---

## 11) Spec Growth Guardrail (Implementation Ratio)

To prevent planning docs from outpacing delivered runtime behavior, maintainers must satisfy this gate **before adding new phase-spec artifacts** under `.GITHUB-MODE/docs/planning/`:

- Minimum operational capability count: **2** capabilities marked `operational` in `.GITHUB-MODE/runtime/implementation-scoreboard.json`.
- New phase spec additions must update the scoreboard in the same PR so implementation-vs-spec drift stays explicit and reviewable.

If this minimum is not met, defer new phase specs and prioritize converting existing `spec-only`/`scaffold` capabilities to `operational` first.
