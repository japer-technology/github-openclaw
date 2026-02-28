# GitHub Mode — Task 0 Impact Analysis

## Task 0 completion status

- ✅ Task 0 complete: ADR 0001 + ADR 0002 + Security 0001 are accepted with maintainer signoff metadata recorded in-repo.
- ✅ Phase 1 unlocked: all Task 0 acceptance locks are satisfied as of 2026-02-16.

---

## Scope and Intent

This document analyzes the implementation impact of **Phase 0 (Tasks 0.1–0.3)** from `.GITHUB-MODE/docs/planning/implementation-tasks.md`:

- **Task 0.1:** Runtime Boundary ADR Package
- **Task 0.2:** Installed Runtime Regression Baseline
- **Task 0.3:** GitHub Threat Model and Trigger Matrix

The focus is on delivery impact, non-regression risk, security posture changes, developer workflow effects, and downstream dependency enablement for later phases.

---

## Implementation Ordering Validation (Deep Check)

Task 0 is in good order only if work is done in this sequence:

1. **0.1 before 0.2/0.3 enforcement details**
   - Runtime boundary ADRs define what can and cannot be shared, so baseline and threat controls validate against stable boundaries rather than moving assumptions.
2. **0.2 and 0.3 can execute in parallel after 0.1 is approved**
   - Regression baseline protects installed behavior while threat modeling protects trust boundaries.
3. **Phase 1 starts only after all Task 0 acceptance locks pass**
   - Contract schemas/parity validators should not be authored on top of unresolved boundary or trigger-trust ambiguity.

### Task 0 Traceability Matrix

| Task                              | Required artifact(s)                                                        | CI/Policy gate                                             | Downstream dependency                  |
| --------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| 0.1 Runtime boundary ADR          | Approved ADR package with ownership + prohibited coupling + backout trigger | Review checklist references ADR constraints                | 1.1 contracts, 1.3 parity/convergence  |
| 0.2 Regression baseline           | Installed-runtime smoke suite definition + deterministic fixtures           | Merge-blocking baseline check for GitHub-mode-touching PRs | All build-out phases (1-7)             |
| 0.3 Threat model + trigger matrix | Trusted/untrusted trigger matrix + abuse/control mapping                    | Workflow policy/lint checks consume matrix rules           | 2.x security hardening, 7.4 compliance |

### Order Risk Flags (what to reject)

- Starting Phase 1 schema work while 0.1 ownership/coupling rules are unresolved.
- Treating 0.2 as informational-only (non-blocking) while claiming installed-runtime non-regression.
- Approving workflow changes that introduce privileged paths before 0.3 trigger trust model is adopted.

---

## Executive Summary

Implementing Task 0 is a **high-leverage, low-regret foundation investment** with three major consequences:

1. **Architecture control is formalized before code scaling.**
   Runtime boundary ADRs reduce accidental coupling between installed runtime and GitHub mode and create an enforceable design baseline.

2. **Regression risk moves from “implicit trust” to measurable guardrails.**
   Installed runtime smoke baselines convert non-regression intent into CI policy, making accidental breakage visible and merge-blocking.

3. **Security assumptions become explicit and testable early.**
   Trigger trust modeling and abuse-to-control mapping prevents unsafe workflow patterns from becoming entrenched before Phase 2 hardening.

Without Task 0 completion, later phases (contracts, policy validators, environment protection, attestations, compliance automation) are likely to accumulate rework and policy drift.

---

## Baseline Problem Statement

Before Task 0 implementation, GitHub-mode work typically has four structural failure modes:

- **Boundary ambiguity:** Shared modules grow opportunistically, causing hidden dependency inversion and migration deadlocks.
- **Regression invisibility:** Installed-runtime behavior changes are detected late (often post-merge) without baseline smoke checks.
- **Trigger confusion:** Workflow authors conflate trusted and untrusted contexts (`pull_request`, `pull_request_target`, `push`, dispatches), leading to privilege escalation risk.
- **Control scatter:** Security controls exist ad hoc in workflow files rather than as policy-derived constraints.

Task 0 directly addresses each failure mode at planning time rather than during incident response.

---

## Task-by-Task Impact Analysis

## Task 0.1 — Runtime Boundary ADR Package

### Primary Impact

- Establishes a **source-of-truth architectural contract** for what GitHub mode can share with installed runtime.
- Converts “team memory” into approved governance artifacts with explicit ownership and prohibited coupling patterns.

### Expected Positive Outcomes

- **Reduced architecture entropy:** New contributors can evaluate changes against ADR constraints.
- **Lower refactor blast radius:** Shared interfaces are intentionally chosen; internals remain isolated.
- **Faster review decisions:** Maintainers can reject coupling regressions based on documented rules instead of subjective judgment.
- **Actionable rollback trigger:** “Runtime coupling detected” becomes a formal backout condition.

### Cost / Tradeoff

- **Short-term speed tax:** Teams may spend extra design time for boundary compliance.
- **Initial disagreement overhead:** ADR approval may surface unresolved ownership ambiguities.

### If Skipped

- High probability of later-phase contract schemas encoding architecture that is already coupled and costly to unwind.

---

## Task 0.2 — Installed Runtime Regression Baseline

### Primary Impact

- Introduces **merge-time non-regression enforcement** for installed runtime behavior while GitHub mode evolves.

### Expected Positive Outcomes

- **Prevents silent user-facing regressions:** Smoke checks provide rapid signal on critical paths.
- **Enables safe parallel workstreams:** Teams can iterate on GitHub mode with confidence that installed runtime guarantees are preserved.
- **Improves release confidence:** Mainline green state becomes meaningful for both runtime domains.

### Cost / Tradeoff

- **CI runtime increase:** Additional smoke jobs consume minutes and infrastructure.
- **Flakiness management burden:** Baseline reliability work (stability, retries, deterministic fixtures) is required.

### If Skipped

- Regression detection shifts to manual QA or production feedback, dramatically increasing cost-of-fix and rollback frequency.

---

## Task 0.3 — GitHub Threat Model and Trigger Matrix

### Primary Impact

- Defines a **trust-segmented execution model** for GitHub events, preventing unsafe privilege assumptions.

### Expected Positive Outcomes

- **Clear trigger policy language:** Fork PR, internal PR, push, schedule, and manual dispatch are explicitly categorized.
- **Control completeness:** Each abuse case maps to at least one preventive or detective control.
- **Security-by-construction for later phases:** Workflow hardening (permissions/OIDC/environment gates) has a validated threat baseline.

### Cost / Tradeoff

- **Upfront analysis effort:** Requires cross-functional review (maintainers + security-minded reviewers).
- **Policy strictness friction:** Some existing convenience patterns may become disallowed.

### If Skipped

- Phase 2 security hardening risks becoming checklist-driven rather than threat-driven, leaving exploitable coverage gaps.

---

## Cross-Task Systemic Impact

### 1) Delivery Predictability

Task 0 shifts execution from “build and patch” to **design-gated delivery**:

- Scope decisions are made once (ADR), not re-litigated in each PR.
- Regression criteria become objective (CI smoke baseline).
- Security gates derive from a matrix, reducing inconsistent interpretation.

### 2) Rework Avoidance Across Phases 1–7

Task 0 completion significantly lowers expected rework in:

- **Phase 1:** Contract schemas and validators align to approved boundaries.
- **Phase 2:** Permission and trigger hardening map cleanly to threat matrix.
- **Phase 3–5:** Promotion and attestation pipelines inherit clearer trust assumptions.
- **Phase 6:** Multi-entity collaboration policies are easier to formalize when trust zones already exist.
- **Phase 7:** Compliance automation can verify explicit controls rather than inferred behavior.

### 3) Governance and Auditability

Task 0 creates auditable rationale for architectural and security decisions, enabling:

- Faster incident triage (“which boundary/control failed?”).
- Stronger maintainer onboarding (decision history is documented).
- Better external/internal compliance narratives.

---

## Security Impact Deep Dive

## Privilege Separation

Task 0.3 enforces that privileged operations are not reachable from untrusted trigger paths. This reduces exploitability in classes such as:

- Token exfiltration via unsafe PR contexts.
- Privileged workflow execution from fork-controlled changes.
- Unauthorized branch mutation outside PR-mediated processes.

## Policy Precedence

Task 0 turns security constraints into **first-order design inputs** before workflow proliferation, reducing later exceptions.

## Residual Risks After Task 0

Task 0 is foundational, not sufficient. Residual risk remains until later controls land:

- Missing technical enforcement (pinning, permission linting, OIDC migration).
- Incomplete artifact/log scrubbing.
- Human approval process variance until standardized.

---

## Operational and CI Impact

## CI Topology Changes

Expected additions once Task 0 is implemented:

- Baseline smoke workflow(s) for installed runtime invariants.
- Gate logic that blocks merges when baseline fails for GitHub-mode-touching changes.
- Artifacted reports for regression and threat-model conformance signals.

### Interpreting Formal Conformance Drift Warnings

One concrete example of an "artifacted conformance signal" is the informational warning:

> ⚠️ Formal models conformance drift detected

This warning indicates that extracted constants in the formal-models repository (for example `generated/*`) changed when regenerated against the PR branch. In this model, the warning is expected behavior, not an automatic defect: Task 0 intentionally makes drift visible early so teams can decide whether the change is expected and then either:

- update/regenerate the formal-models artifacts as a follow-up, or
- adjust the PR if drift is unintended.

Operationally, this should be triaged the same way as other baseline/conformance signals: a documented owner assesses intent, attaches remediation, and closes the loop so drift does not become permanent policy debt.

## Reliability Implications

- CI noise must be managed through deterministic checks and owner-runbooks.
- Baseline failures should be triaged by ownership rules defined in ADR package.

## Developer Experience Implications

- **Pros:** clearer constraints, fewer late-stage surprises.
- **Cons:** stricter PR requirements and possible queue friction during early adoption.

---

## Dependency and Sequencing Impact

Task 0 is a hard prerequisite for high-quality execution of later phases:

- **0.1 → 1.1/1.3:** ADR boundaries inform contract and parity validation rules.
- **0.2 → all implementation phases:** non-regression baseline protects installed runtime while iterating.
- **0.3 → 2.x/7.4:** threat matrix anchors permission model, trigger safety, and compliance automation.

Delaying Task 0 effectively multiplies uncertainty and introduces architecture/security debt into every subsequent milestone.

---

## Quantitative Impact Model (Recommended)

To measure whether Task 0 delivers intended value, track:

- **Boundary violation rate:** PRs flagged for prohibited coupling per sprint.
- **Regression escape rate:** installed-runtime regressions discovered after merge/release.
- **Security policy exception count:** workflow exceptions to trigger/permission policy.
- **Mean review time for GitHub-mode PRs:** should stabilize after initial adoption.
- **Rollback frequency linked to coupling/security regressions:** expected to decline.

A practical success threshold is sustained downward trends in violation/escape metrics over 2–3 release cycles.

---

## Failure Modes and Mitigations

1. **ADRs are written but not enforced**
   - Mitigation: link ADR constraints to CI validators and PR templates.

2. **Smoke baseline is flaky**
   - Mitigation: use deterministic fixtures, quarantine unstable checks, and assign clear owners.

3. **Threat model is stale**
   - Mitigation: require review on workflow trigger changes and schedule periodic model refresh.

4. **Guardrails over-constrain delivery**
   - Mitigation: define a formal exception process with expiry and maintainer approval.

---

## Recommended Definition of “Task 0 Complete” (Operational)

Beyond acceptance criteria, treat Task 0 as operationally complete only when:

- ADR rules are referenced by code review templates/checklists.
- Baseline failures automatically route to accountable owners.
- Trigger matrix is consumed by at least one policy/lint gate (not doc-only).
- A backout drill is executed once to validate “runtime coupling detected” procedures.

---

## Overall Conclusion

Task 0 implementation is the critical enabling layer for the full GitHub-mode roadmap.

- It **reduces systemic risk early** (architecture, regression, security).
- It **improves execution throughput later** by minimizing rework and review ambiguity.
- It **raises governance quality** by making design intent and trust boundaries auditable and enforceable.

If there is schedule pressure, Task 0 should be protected rather than compressed; cutting it is likely to increase total delivery time and incident risk across Phases 1–7.
