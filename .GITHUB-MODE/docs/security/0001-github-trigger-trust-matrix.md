# GitHub Trigger Trust Matrix and Threat Model

- Status: Accepted
- Date: 2026-02-16
- Owners: GitHub mode maintainers, security maintainers
- Task mapping: Phase 0 Task 0.3 in `.GITHUB-MODE/docs/planning/implementation-tasks.md`

## Purpose

Define trusted and untrusted trigger boundaries, enumerate abuse cases, and map required controls for planned GitHub mode workflows.

## Security invariants (must hold)

1. No privileged workflow execution occurs in untrusted contexts.
2. Privileged branch mutation is allowed only through pull request flow.
3. Secrets are never exposed to fork pull request execution.
4. All privilege elevation requires explicit environment approval gates.

## Threat model boundaries

### Host and platform isolation guarantees

These guarantees come from GitHub-hosted runner and repository platform controls. The workflow design assumes these controls are present and treats any reduction as a blocking security regression.

- GitHub-hosted runners provide ephemeral execution hosts per job, limiting persistence across jobs and reducing cross-run contamination.
- Fork pull requests execute without repository/environment secrets.
- `GITHUB_TOKEN` defaults are explicitly bounded by workflow `permissions`; writes are denied unless declared.
- Environment protection rules (required reviewers, scoped secrets) gate privileged steps.
- Protected branch rules enforce reviewed PR merge flow for branch mutation.

### In-sandbox malicious logic risks

Even with platform isolation, untrusted or compromised logic can still execute _inside_ the workflow sandbox and abuse granted capabilities.

- Untrusted PR code can execute data-exfiltration attempts through logs, artifacts, network calls, or covert encoding.
- Workflow logic changes can widen token scopes or add unexpected write pathways.
- Third-party dependencies (actions, npm packages, scripts) can run attacker-controlled payloads at runtime.
- Semi-trusted maintainers can intentionally or accidentally introduce policy drift that weakens future runs.

Mitigation strategy for these in-sandbox risks:

1. Keep runtime privileges minimal by trigger trust level.
2. Gate privileged operations behind environment approvals and policy checks.
3. Continuously detect drift (permissions, trigger patterns, dependency pinning, artifact leakage).

## Trigger trust matrix

| Trigger                             | Context trust level          | Typical actor                          | Secrets allowed                 | Privileged actions allowed               | Required branch mutation path                  |
| ----------------------------------- | ---------------------------- | -------------------------------------- | ------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| `pull_request` from fork            | Untrusted                    | External contributor                   | No                              | No                                       | Pull request only                              |
| `pull_request` from internal branch | Semi-trusted                 | Maintainer/contributor with repo write | Limited, environment-gated only | Only after explicit gate and policy pass | Pull request only                              |
| `push` to protected branches        | Trusted (policy constrained) | Maintainer automation                  | Yes (minimum needed)            | Yes, only if all required checks pass    | Pull request merged into protected branch      |
| `schedule`                          | Trusted automation           | Repository scheduler                   | Yes (minimum needed)            | Yes, read/write only for scoped tasks    | Never direct to protected branch without PR    |
| `workflow_dispatch`                 | Trusted with operator intent | Maintainer/operator                    | Yes (environment scoped)        | Yes, only in approved environments       | Pull request flow for protected branch changes |

### Planned workflow coverage

The matrix applies to planned Phase 3 workflows:

- `github-mode-build`
- `github-mode-check`
- `github-mode-test`
- `github-mode-policy`
- `github-mode-route-sim`
- `github-mode-eval-tier0`
- `github-mode-cost`
- `github-mode-sync-templates`

## Threat scenarios and control mapping

| ID    | Abuse case                                                                             | Affected triggers                                 | Preventive controls                                                                                                    | Detective controls                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| TM-01 | Attacker opens fork PR that attempts secret exfiltration using workflow steps          | Fork `pull_request`                               | No secrets on fork PR, deny `pull_request_target` for untrusted code paths, `permissions` set to read-only             | CI security lint asserts zero secrets on untrusted triggers, simulated fork PR test job validates environment variables are absent |
| TM-02 | Malicious workflow change widens token permissions and mutates protected branches      | Internal `pull_request`, `push`                   | Required reviews for `.github/workflows/**`, branch protection required checks, least-privilege explicit `permissions` | Workflow policy lint flags broad permissions, CODEOWNERS review audit on security-sensitive paths                                  |
| TM-03 | Third-party GitHub Action is compromised and executes arbitrary code                   | All triggers                                      | Pin all third-party actions to full commit SHA, allowlist trusted action publishers                                    | Scheduled action pin scanner reports drift, security workflow fails on non-SHA-pinned actions                                      |
| TM-04 | Privileged deployment is triggered from untrusted context via logic bug                | Fork/internal `pull_request`, `workflow_dispatch` | Trust-level gates in workflow conditions, environment protection reviewers, separate untrusted-safe jobs               | Audit log alerts on environment access attempts, policy simulation ensures privileged jobs are skipped for untrusted contexts      |
| TM-05 | Direct branch mutation bypasses review and lands privileged config changes             | `push`, `workflow_dispatch`, `schedule`           | Protected branch rules with "require pull request", disable bypass except administrators with audit                    | Branch protection violation alerts, periodic rule drift checks in governance workflow                                              |
| TM-06 | Scheduled workflow executes with stale/over-privileged credentials                     | `schedule`                                        | OIDC short-lived credentials where possible, secret scope minimization, rotation standards                             | Credential age/usage report, failed OIDC policy check blocks workflow                                                              |
| TM-07 | Manual dispatch used by unauthorized actor to run privileged workflow                  | `workflow_dispatch`                               | Restrict dispatch to maintainers, environment required reviewers, explicit input validation and allowlists             | GitHub audit log monitoring for dispatch events, weekly review of dispatch history                                                 |
| TM-08 | Workflow artifacts leak sensitive policy/eval outputs                                  | All triggers                                      | Redaction policy for logs/artifacts, no secret material in summaries, retention limits                                 | Artifact scanning for tokens/secrets, DLP-style check on uploaded artifacts                                                        |
| TM-09 | Route/policy drift silently weakens controls                                           | `push`, `pull_request`, `schedule`                | Mandatory policy and route drift checks as required checks before merge/promotion                                      | Drift report artifacts and summary annotations, fail-on-drift enforcement                                                          |
| TM-10 | Insider attempts to change workflow trigger from PR-gated to push-only privileged path | Internal `pull_request`, `push`                   | Workflow guardrail validator enforces approved trigger patterns, required security maintainer review                   | Trigger matrix conformance check in CI, review bot flags forbidden trigger mutations                                               |

## Attacker pathways in workflow runtime and required mitigations

| Pathway                   | Runtime risk pattern                                                                                                       | Required mitigations                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token misuse              | Workflow/job obtains write-capable token and uses it outside intended scope (branch writes, issue spam, release mutation). | Explicit per-job `permissions`; deny defaults; environment approval gates for write scopes; protected branch PR-only mutation path; periodic permission drift checks.                    |
| Data exfiltration         | Malicious logic emits secrets/sensitive outputs via logs, artifacts, cache keys, or outbound network requests.             | No secrets for fork PR; redact logs and summaries; artifact retention limits; secret scanning on artifacts/logs; separate trusted vs untrusted jobs with hard skip conditions.           |
| Dependency abuse          | Compromised action/package/script executes during CI and inherits runner/network/token context.                            | Pin third-party actions to commit SHA; maintain allowlist for action sources; lock dependency inputs where feasible; scheduled dependency integrity scans and fail-closed policy checks. |
| Trigger/context confusion | Logic bug misclassifies trust level and runs privileged steps for untrusted contexts.                                      | Centralized trigger trust matrix; reusable guardrail condition helpers; conformance tests simulating fork/internal/trusted triggers; audit alerts on unexpected environment access.      |

## Control baseline by trigger

### Fork `pull_request` (untrusted)

- Workflow jobs must run in untrusted-safe mode.
- Token permissions are read-only unless a documented exception exists.
- No environment or repository secrets may be exposed.
- Privileged jobs (deploy, promotion, branch mutation, secret access) must be hard-skipped.

### Internal `pull_request` (semi-trusted)

- All security-sensitive workflow changes require CODEOWNERS approval.
- Privileged jobs must be gated behind explicit policy checks plus environment approval.
- Branch mutation is disallowed from PR jobs; output is proposal artifacts or PR comments only.

### `push`, `schedule`, `workflow_dispatch` (trusted)

- Must still use least-privilege token scopes.
- Protected branch mutation must originate from reviewed PR merges.
- Privileged jobs require environment protections and auditable approvals.

## Conformance checks required for Phase 0 completion

1. Trigger matrix exists and covers: fork PR, internal PR, push, schedule, manual dispatch.
2. Every abuse case has at least one preventive and one detective control.
3. Security invariants are encoded in docs and referenced by implementation tasks.
4. Maintainers approve this document in PR review.

## Maintainer review checklist

- [ ] Trigger trust levels are accurate for repository policy.
- [ ] Matrix covers all planned workflow triggers.
- [ ] Abuse cases are realistic and mapped to enforceable controls.
- [ ] Guardrails prohibit privileged execution in untrusted contexts.
- [ ] Guardrails restrict privileged branch mutation to PR flow.

## Approval signoff

```governance-signoff
[
  {
    "role": "security",
    "github": "@openclaw-security-lead",
    "approved_at": "2026-02-18"
  },
  {
    "role": "github-mode",
    "github": "@openclaw-github-mode-lead",
    "approved_at": "2026-02-18"
  },
  {
    "role": "runtime",
    "github": "@openclaw-runtime-lead",
    "approved_at": "2026-02-18"
  }
]
```
