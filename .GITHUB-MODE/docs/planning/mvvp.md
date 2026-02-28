# OpenClaw GitHub Mode MVVP

This document defines the **minimum viable vision product (MVVP)** for OpenClaw GitHub Mode.

It builds on `.GITHUB-MODE/docs/planning/mvp.md` by adding one critical bar: the first release must not only be shippable, it must demonstrate a clear long-term product direction.

Terminology note: MVVP is an informal extension of MVP language with no single canonical originator. In this repo, MVVP emphasizes early proof of product vision and strategic trajectory.

---

## 1) MVVP Objective

Ship the smallest GitHub Mode slice that proves four things in production-like repository use:

1. **Safety:** trust and policy controls prevent privileged misuse.
2. **Vision clarity:** maintainers can see the intended end-state and why this direction matters.
3. **Reliability:** workflows are stable enough to become required checks.
4. **Continuity:** installed OpenClaw runtime behavior remains unchanged.

MVP answers “can we ship it?”
MVVP answers “does this clearly communicate where the product is going?”

---

## 2) Vision-Critical User Jobs

The MVVP is scoped around jobs that make the future product shape explicit:

1. Validate routing/policy/runtime contracts in PRs with deterministic artifacts.
2. Accept trusted command inputs and produce bot PRs with full provenance.
3. Block untrusted privileged actions with clear denial reasons.
4. Surface parity and drift signals so coverage gaps are explicit and trackable.

If a capability does not improve one of these jobs or clarify long-term direction, it is out of MVVP scope.

---

## 3) MVVP Scope (What Must Exist)

### 3.1 Contracts and policy baseline

Required `.GITHUB-MODE/runtime/` contracts:

- `runtime-manifest.json`
- `adapter-contracts.json`
- `command-policy.json`
- `trust-levels.json`
- `parity-matrix.json`
- `workspace-convergence-map.json`

Requirements:

- schema validation in CI,
- versioned contract changes,
- owner + rationale for all `installed-only` parity entries.

### 3.2 Workflow minimum set

1. **PR validation workflow**
   - validates contracts and policy/routing checks,
   - publishes machine-readable + human-readable artifacts,
   - runs safely for forks without secrets.

2. **Trusted command workflow**
   - supports an MVP-safe command set (`explain`, `test`, scoped `refactor`),
   - enforces trust tiers before adapter execution,
   - never performs protected branch direct writes.

3. **Bot PR workflow**
   - creates automation PRs with provenance block,
   - links artifacts and policy version,
   - clearly marks bot-generated changes.

4. **Drift visibility workflow**
   - scheduled parity/contract re-validation,
   - opens or updates a drift issue when necessary,
   - emits machine-readable output for follow-up automation.

### 3.3 Security gate (non-negotiable)

- least-privilege workflow permissions,
- SHA-pinned third-party actions,
- secret isolation for untrusted contexts,
- no secret leakage to logs/artifacts/cache keys,
- privileged operations gated by trust + environment controls,
- protected branches modified only through PR review flow.

---

## 4) MVVP Vision Metrics (Required)

MVVP must be measured, not asserted. A weekly rollup must report progress toward strategy-aligned outcomes:

1. **Adoption**
   - number of PRs with GitHub Mode checks,
   - number of trusted command invocations.

2. **Effectiveness**
   - bot PR acceptance rate,
   - median time from command invocation to bot PR open,
   - policy/routing issues caught pre-merge.

3. **Safety**
   - blocked privileged attempts from untrusted actors,
   - secret exposure incidents (target: zero).

4. **Reliability**
   - workflow success rate,
   - rerun rate caused by flake,
   - median workflow duration by class.

5. **Parity clarity**
   - parity matrix freshness,
   - count of `installed-only` items and trend.

---

## 5) MVVP Exit Criteria

GitHub Mode reaches MVVP when all are true for a sustained window (for example, 2 continuous weeks):

1. Required PR check is enforced and stable.
2. Trusted commands produce bot PRs end-to-end with provenance.
3. Untrusted privileged paths are consistently denied and auditable.
4. Vision metrics show repeat usage and increasing alignment with the target operating model.
5. Installed runtime parity is preserved (no regressions attributable to GitHub Mode changes).

If these criteria are not met, stay in MVP hardening and do not expand scope.

---

## 6) Explicit Non-Goals for MVVP

- full promotion + attestation chain automation,
- multi-entity collaboration protocol rollout,
- installed runtime replacement for long-lived channels,
- device-bound hardware actions in untrusted GitHub contexts,
- broad command expansion before safety/reliability/value targets are met.

---

## 7) Rollout Order

1. **Internal maintainers only:** harden reliability and summaries.
2. **Trusted cohort expansion:** controlled increase in command users/adapters.
3. **Default-on required checks:** enforce as branch protection once stable.
4. **Post-MVVP expansion:** proceed to implementation-plan later phases (promotion, collaboration, governance depth).

---

## 8) Practical Decision Rule

When prioritization is ambiguous, choose work that maximizes this sequence:

**Safety -> Determinism -> Maintainer time saved -> Scope expansion.**

If a proposal increases scope without improving those first three, defer it.
