# ADR 0002 Installed runtime non regression guardrails

- Status: Accepted
- Date: 2026-02-16
- Owners: Runtime maintainers, release maintainers
- Decision scope: Non regression policy while GitHub mode is introduced

## Context

GitHub mode changes must not alter installed runtime behavior. A written and enforced non regression contract is required before implementation phases proceed.

## Decision

### Non regression rules

GitHub mode work must preserve these installed runtime guarantees:

- CLI command behavior remains backward compatible unless separately versioned and documented.
- Gateway startup, channel lifecycle, and provider auth flows remain unchanged by default.
- Existing release and operator workflows for installed runtime remain functional without GitHub mode dependencies.
- Installed runtime can be built, tested, and run when GitHub mode workflows are unavailable.

### Verification policy

- Installed runtime smoke checks are mandatory in CI for any GitHub mode touching pull request.
- Failing installed runtime smoke checks block merge.
- Smoke checks are versioned and tracked with owner assignments.

### Backout trigger

Backout trigger is declared as **runtime coupling detected** when any one of the following occurs:

- A GitHub mode change introduces a required runtime dependency from installed runtime into `.github/**` artifacts.
- Installed runtime smoke baseline fails due to GitHub mode linked changes.
- Security review finds privileged workflow path that can mutate protected branches outside PR flow.

When trigger fires, maintainers must:

1. Freeze GitHub mode merges.
2. Revert or disable offending workflow or coupling change.
3. Open incident issue with reproduction, impact, and remediation owner.
4. Re enable GitHub mode rollout only after boundary checks and smoke checks are green.

## Consequences

### Positive

- Clear rollback criteria reduce mean time to recovery.
- Maintainers can enforce safety without case by case policy decisions.
- Release confidence for installed runtime remains stable during rollout.

### Tradeoffs

- Temporary slowdown when backout trigger is active.
- Additional governance work for incident documentation.

## Maintainer review checklist

- [ ] Non regression guarantees are complete and testable.
- [ ] Backout trigger conditions are objective.
- [ ] Incident and rollback steps are actionable.
- [ ] CI blocking behavior aligns with this ADR.

## Approval signoff

```governance-signoff
[
  {
    "role": "runtime",
    "github": "@openclaw-runtime-lead",
    "approved_at": "2026-02-18"
  },
  {
    "role": "release",
    "github": "@openclaw-release-lead",
    "approved_at": "2026-02-18"
  }
]
```
