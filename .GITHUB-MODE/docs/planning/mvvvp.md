# OpenClaw GitHub Mode MVVVP

This document defines the **minimum viable valuable product (MVVVP)** for OpenClaw GitHub Mode.

It is the next bar above `.GITHUB-MODE/docs/planning/mvvp.md`: not only useful and safe, but predictably compounding value with low operational friction.

Terminology note: MVVVP is an informal practitioner term (no single canonical originator). In this repo, it means the minimum slice that is both viable and clearly valuable to users and maintainers.

---

## 1) MVVVP Objective

Deliver a GitHub Mode slice that is:

1. **Secure by default** in untrusted and trusted contexts.
2. **Operationally dependable** enough to run as required checks with low maintenance overhead.
3. **Net-positive at team scale** (measurable review throughput and reduced manual toil).
4. **Governable** with durable evidence (policy decisions, provenance, and drift signals).
5. **Non-disruptive** to installed OpenClaw runtime behavior.

MVVP asks: “does this clearly communicate where the product is going?”
MVVVP asks: “does this already deliver durable, perceivable value with low operating friction?”

---

## 2) Inputs and Alignment

This file is derived from the current GitHub Mode doc set:

- strategy and architecture in `.GITHUB-MODE/docs/overview.md`,
- rollout constraints in `.GITHUB-MODE/docs/planning/mvp.md` and `.GITHUB-MODE/docs/planning/mvvp.md`,
- analysis references (`WHY`, `MAGIC`, `LIBRARIES`, `DIRECTORIES`, `WWWWWH`),
- implementation sequencing (`IMPLEMENTATION-PLAN`, `IMPLEMENTATION-TASKS`).

MVVVP does not replace those documents; it defines the threshold where GitHub Mode should be treated as a default operating layer for repository workflows.

---

## 3) Required Capability Envelope

### 3.1 Contract and parity discipline (must be enforced)

The `.GITHUB-MODE/runtime/` contract set remains mandatory and validated:

- `runtime-manifest.json`
- `adapter-contracts.json`
- `command-policy.json`
- `trust-levels.json`
- `parity-matrix.json`
- `workspace-convergence-map.json`

Additional MVVVP expectations:

- contract changes include migration notes,
- parity deltas are highlighted in workflow summaries,
- every `installed-only` entry has owner, rationale, and review date,
- stale contract versions trigger explicit warnings/failures.

### 3.2 Workflow portfolio baseline

MVVVP requires the four MVVP workflows and operationally useful extensions:

1. **PR validation/checks** with deterministic outputs and change-focused policy assertions.
2. **Trusted command execution** with strict trust-tier gating.
3. **Bot PR generation** with full provenance block and artifact linkage.
4. **Drift detection** with issue lifecycle management.
5. **Cost/eval visibility** for command and check workloads (budget guardrails).
6. **Governance reporting** rollups for adoption, reliability, safety, and parity trends.

### 3.3 Security and trust controls

All prior gates remain mandatory, plus:

- explicit deny logs for blocked privileged attempts,
- environment protection for mutation-capable paths,
- immutable provenance fields (actor, SHA, run id, policy version),
- periodic policy-audit review cadence recorded in artifacts.

---

## 4) MVVVP Value Model

MVVVP is achieved only when GitHub Mode creates compounding value in three layers.

### 4.1 Layer A: Immediate execution value

- Maintainers can offload repetitive analysis/refactor prep to trusted commands.
- PR authors receive actionable, deterministic check outputs quickly.
- Bot PRs are routinely merged with minimal rework.

### 4.2 Layer B: Systemic quality value

- Policy/routing regressions are caught earlier in PR lifecycle.
- Drift is surfaced before it turns into incident-level breakage.
- Parity visibility guides roadmap decisions with explicit tradeoffs.

### 4.3 Layer C: Organizational leverage

- Teams rely on shared contracts instead of tribal process knowledge.
- Review burden decreases without weakening trust boundaries.
- Expansion (promotion/collaboration) is enabled from stable primitives rather than ad-hoc workflow growth.

---

## 5) Required Metrics and Thresholds

Metrics must be emitted weekly and trended.

### 5.1 Adoption

- PR coverage by GitHub Mode required checks.
- Trusted command usage by repository and maintainer cohort.

### 5.2 Effectiveness

- Bot PR acceptance/merge rate.
- Median command-to-PR lead time.
- Count of pre-merge issues caught by policy/routing checks.

### 5.3 Safety

- Blocked privileged attempts (with actor/context class).
- Secret leakage incidents (target: zero).
- Policy bypass incidents (target: zero).

### 5.4 Reliability

- Workflow success rate by class.
- Flake-driven rerun rate.
- Median and p95 workflow duration.

### 5.5 Operability

- Manual intervention count per week.
- Mean time to recover from workflow breakage.
- Number of stale parity entries and trend direction.

---

## 6) MVVVP Exit Criteria

GitHub Mode reaches MVVVP when all conditions hold for a sustained period (for example, 4 continuous weeks):

1. Required checks are stable and trusted by maintainers (low rerun + low manual triage).
2. Trusted command-to-bot-PR loop is used repeatedly and yields high merge utility.
3. Untrusted privileged attempts are blocked with auditable, consistent denials.
4. Safety targets hold (no secret exposure/policy bypass incidents).
5. Operability targets hold (manual overhead stays low and predictable).
6. Installed runtime behavior remains unchanged by GitHub Mode rollout.
7. Parity and drift reports remain current and decision-useful.

If any condition regresses materially, freeze scope expansion and return to hardening.

---

## 7) Non-Goals at MVVVP Stage

- replacing installed always-on channel runtime,
- broadening command surface without metric-backed safety/reliability headroom,
- introducing privileged mutation paths that bypass PR review,
- rolling out multi-entity collaboration globally before trust/policy telemetry maturity,
- adding complexity that is not tied to measurable maintainer or governance value.

---

## 8) Prioritization Rule

When choosing between candidate work items, use this order:

**Trust safety -> Determinism -> Reliability -> Maintainer time saved -> Governance clarity -> Scope expansion**

Only advance scope when all prior dimensions remain healthy.
