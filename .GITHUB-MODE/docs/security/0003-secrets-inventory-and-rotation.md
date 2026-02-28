# 0003 — Secrets Inventory and Rotation Standard

## Status

- State: Draft
- Owners: GitHub Mode Runtime Owners, Security Owners
- Last reviewed: 2026-02-18
- Scope: GitHub Mode workflows (`.github/workflows/github-mode-*.yml`)

## Purpose

Define the canonical inventory for GitHub Mode workflow secret material, including owners, rotation cadence, storage location, and emergency revocation steps.

This document implements Task 2.1 in `.GITHUB-MODE/docs/planning/implementation-tasks.md`.

## Guardrails

- GitHub Mode uses only GitHub-native secret primitives (repository secrets, environment secrets, or GitHub-managed ephemeral tokens).
- No in-repo secret vaulting is allowed.
- Untrusted fork PR contexts must never receive secret material.

## Inventory

Current state: GitHub Mode workflows currently require **no user-managed repository or environment secrets**. They only rely on the GitHub-managed ephemeral `GITHUB_TOKEN`.

| Secret                                          | Used by workflows           | Owner                      | Rotation interval                              | Storage location                                                 | Emergency revocation flow                                                                                                                                                                                                                           |
| ----------------------------------------------- | --------------------------- | -------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN` (GitHub-managed ephemeral token) | `github-mode-contracts.yml` | GitHub Mode Runtime Owners | Per job run (ephemeral, auto-issued by GitHub) | `repo` (GitHub-managed runtime token; not a user-defined secret) | 1) Disable affected workflow(s). 2) Set repository workflow permissions to read-only. 3) Remove/limit branch write permissions for `GITHUB_TOKEN`. 4) Re-run compromised jobs after policy fix. 5) Open incident issue with timeline + remediation. |

## Rotation and Review Standard

- Quarterly review cadence for this inventory document and `.GITHUB-MODE/runtime/secrets-inventory.json`.
- Any new GitHub Mode workflow that introduces `${{ secrets.* }}` must update both files in the same pull request.
- New entries must include:
  - named owner (team or role)
  - explicit cadence (for example `30d`, `90d`, or `per-run`)
  - storage location (`repo` or `environment`)
  - emergency revocation steps

## Emergency Revocation Runbook (Generic)

Use this flow for any compromised GitHub Mode secret:

1. **Containment**
   - Disable affected workflow(s).
   - If environment-scoped, temporarily remove required secret(s) from the environment.
   - Restrict workflow permissions to minimum read-only while triaging.
2. **Revoke / Rotate**
   - Rotate compromised secret in the source system.
   - Update GitHub secret value (`repo` or `environment`) with rotated credential.
3. **Verification**
   - Re-run security lint and affected workflows.
   - Confirm no secret exposure in logs/artifacts.
4. **Recovery**
   - Re-enable workflows after green validation.
   - Restore least-privilege permissions as intended.
5. **Post-incident evidence**
   - Open/append incident issue.
   - Record secret name, blast radius, timeline, and prevention actions.

## Machine-readable source

The machine-readable companion file is:

- `.GITHUB-MODE/runtime/secrets-inventory.json`

CI and policy checks should consume that file to validate required metadata fields (`owner`, `rotationCadence`).

## Approval signoff

```governance-signoff
[
  {
    "role": "security",
    "github": "@openclaw-security-lead",
    "approved_at": "2026-02-18"
  },
  {
    "role": "runtime",
    "github": "@openclaw-runtime-lead",
    "approved_at": "2026-02-18"
  }
]
```
