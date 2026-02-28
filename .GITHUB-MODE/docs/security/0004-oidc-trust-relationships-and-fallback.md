# OIDC trust relationships and fallback policy

This document defines the baseline OIDC model for GitHub Mode workflows that deploy to cloud providers.

## Scope

- Applies to `.github/workflows/github-mode-*.yml` workflows only.
- Applies when a job exchanges a GitHub OIDC identity token for cloud credentials.
- Non-federated jobs (lint, tests, docs checks) must not request `id-token: write`.

## Trust relationships

### OIDC issuer

- Issuer (`iss`) must be GitHub Actions:
  - `https://token.actions.githubusercontent.com`

### Audience mapping

Use provider-specific audience values and enforce an allowlist in each cloud trust policy.

- AWS STS federation: `aud=sts.amazonaws.com`
- Azure workload identity federation: `aud=api://AzureADTokenExchange`
- Google workload identity federation: `aud` must match the configured workload identity provider audience string

### Subject claim patterns

Role bindings must pin `sub` to explicit repository and ref or environment conditions.

Recommended subject patterns:

- Branch-scoped: `repo:openclaw/openclaw:ref:refs/heads/<branch>`
- Environment-scoped: `repo:openclaw/openclaw:environment:github-mode-<env>`
- Tag-scoped releases: `repo:openclaw/openclaw:ref:refs/tags/<tag>`

Use exact matches when possible; if wildcard matching is required, constrain to one namespace boundary (for example `github-mode-prod-*` tags only).

## Role bindings

Bind each environment to a distinct least-privilege cloud role.

- `github-mode-dev` → dev role (non-production resources only)
- `github-mode-staging` → staging role (pre-production resources only)
- `github-mode-prod` → production role (minimum deploy and readback permissions)

Baseline controls for every binding:

- Enforce issuer and audience checks in trust policy.
- Enforce subject claim restrictions (repo + ref or environment).
- Set short session duration for exchanged credentials.
- Disallow role chaining where possible.
- Log every token exchange and assume-role event.

## Workflow permissions policy

- Default permissions for GitHub Mode workflows are `contents: read`.
- Set `permissions.id-token: write` only on jobs that perform cloud federation.
- Keep `id-token: write` off all other jobs, including build/test/lint jobs.

## Fallback policy when OIDC is unavailable

If OIDC federation is temporarily unavailable:

1. Stop automatic deployment for affected environments.
2. Route deployment through a manual break-glass process with environment approval.
3. Use short-lived credentials issued from a centralized operator vault, never long-lived static repository secrets.
4. Record incident ticket, operator identity, scope, and expiry time.
5. Revoke temporary credentials immediately after deploy and rotate any dependent tokens.
6. Restore OIDC federation before re-enabling automated deployment.

Static cloud credentials in GitHub workflow `env` values or direct `secrets.*` mappings are prohibited in normal operation and break-glass operation.

## Verification and enforcement

- CI enforcement script: `.GITHUB-MODE/scripts/check-github-mode-oidc-credentials.ts`
- CI workflow integration: `.github/workflows/github-mode-contracts.yml`
- Security baseline reference: `.GITHUB-MODE/docs/security/README.md`

## Approval signoff

```governance-signoff
[
  {
    "role": "security",
    "github": "@openclaw-security-lead",
    "approved_at": "2026-02-18"
  },
  {
    "role": "release",
    "github": "@openclaw-release-lead",
    "approved_at": "2026-02-18"
  }
]
```
