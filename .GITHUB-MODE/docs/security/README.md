# 🦞 GitHub Mode Security Foundation

<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/japer-technology/gh-openclaw/main/.GITHUB-MODE/assets/logo.png" alt="OpenClaw with GitHub Mode" width="500">
  </picture>
</p>

This directory contains the baseline threat modeling artifacts for GitHub mode rollout.

## Documents

- [GitHub trigger trust matrix and threat model](0001-github-trigger-trust-matrix.md)
- [Skills quarantine pipeline for trusted runs](0002-skills-quarantine-pipeline.md)
- [Secrets inventory and rotation standard](0003-secrets-inventory-and-rotation.md)
- [OIDC trust relationships and fallback policy](0004-oidc-trust-relationships-and-fallback.md)

## Workflow hardening policy

GitHub mode workflows (`.github/workflows/github-mode-*.yml`) are guarded by
`.GITHUB-MODE/scripts/lint-github-mode-workflows.ts` and enforced in
`.github/workflows/github-mode-contracts.yml`.

Policy requirements:

- Every GitHub mode workflow must declare explicit `permissions` (top-level or per-job).
- Third-party actions must use immutable refs (full commit SHA); mutable refs like `@v*`,
  `@main`, and `@master` are rejected.
- `actions/checkout` is pinned to a full commit SHA in the contracts workflow, and all jobs
  in that workflow explicitly keep `permissions` at `contents: read`.
- GitHub mode cloud deployments must use OIDC federation; static cloud credentials in workflow env/secrets patterns are rejected by `.GITHUB-MODE/scripts/check-github-mode-oidc-credentials.ts`.

## Environment protection baseline (Task 2.2)

Task 2.2 is enforced by `.GITHUB-MODE/scripts/verify-github-environments.ts` and CI workflow `.github/workflows/github-mode-security.yml`.

Required environments and exact expected settings:

### `github-mode-dev`

- Required reviewers protection rule enabled.
- At least **1 reviewer**.
- `prevent_self_review=true`.
- Deployment branch policy shape:
  - `protected_branches=false`
  - `custom_branch_policies=true`
- Allowed deployment branch/tag policies:
  - branch `github-mode/dev`
  - tag `github-mode-dev-*`

### `github-mode-staging`

- Required reviewers protection rule enabled.
- At least **1 reviewer**.
- `prevent_self_review=true`.
- Deployment branch policy shape:
  - `protected_branches=false`
  - `custom_branch_policies=true`
- Allowed deployment branch/tag policies:
  - branch `github-mode/staging`
  - tag `github-mode-staging-*`

### `github-mode-prod`

- Required reviewers protection rule enabled.
- At least **2 reviewers**.
- Reviewer types must include at least one **User** and one **Team** reviewer.
- `prevent_self_review=true`.
- Deployment branch policy shape:
  - `protected_branches=false`
  - `custom_branch_policies=true`
- Allowed deployment branch/tag policies:
  - branch `main`
  - tag `v*`

Any missing environment or policy drift fails CI.

## Scope

These artifacts define:

- trusted versus untrusted trigger contexts
- threat model boundaries separating host/platform isolation guarantees from in-sandbox malicious logic risks
- abuse cases for planned GitHub mode workflows
- preventive and detective controls required before rollout phases can proceed

## Approval process

Phase 1 and later implementation tasks are enabled only after security artifact approvals are captured in-repo in the approval signoff blocks.

Signoff block format:

```governance-signoff
[
  {
    "role": "security",
    "github": "@openclaw-security-lead",
    "approved_at": "2026-02-18"
  }
]
```

- Phase 1 gate status: ✅ Satisfied (Task 0.3 threat model approvals captured on 2026-02-16).
