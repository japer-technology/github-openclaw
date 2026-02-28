# Phase 2 Full-Implementation Checklist

This checklist answers: "What tasks are still needed for Phase 2 in `.GITHUB-MODE` to be fully implemented?"

## Current conclusion

- **No new code-level implementation tasks are required** for Phase 2.
- Phase 2 workstreams (Tasks 2.1–2.6) are code-complete with full scripts, tests, workflows, runtime contracts, and documentation.
- **Operational evidence from real CI runs** is the remaining requirement before each task can be promoted to ✅ Complete.

## Code-complete evidence summary

### Task 2.1 — Secrets Inventory and Rotation Standard

- Policy document: `.GITHUB-MODE/docs/security/0003-secrets-inventory-and-rotation.md`
- Runtime contract: `.GITHUB-MODE/runtime/secrets-inventory.json`
- Acceptance criteria met: inventory covers GitHub-mode workflows, rotation policy published, owners and cadence defined.

### Task 2.2 — Environment Protection Configuration

- Verification script: `.GITHUB-MODE/scripts/verify-github-environments.ts`
- CI enforcement: `.github/workflows/github-mode-security.yml`
- Documentation: `.GITHUB-MODE/docs/security/README.md` (Environment protection baseline)
- Acceptance criteria met: all three environments validated with reviewer gates and branch restrictions.

### Task 2.3 — Workflow Permission Hardening

- Security lint: `.GITHUB-MODE/scripts/github-mode-security-lint.ts`
- Workflow lint: `.GITHUB-MODE/scripts/lint-github-mode-workflows.ts`
- CI enforcement: `.github/workflows/github-mode-security-lint.yml`
- Tests: `.GITHUB-MODE/test/github-mode-security-lint.test.ts` (8 test cases)
- Acceptance criteria met: explicit permissions enforced, over-broad permissions blocked, fork PR secret access blocked.

### Task 2.4 — OIDC Adoption for Cloud Access

- Credential guard: `.GITHUB-MODE/scripts/check-github-mode-oidc-credentials.ts`
- OIDC workflow: `.github/workflows/github-mode-oidc-deploy-scaffold.yml` (OIDC token exchange, evidence artifact upload)
- Policy document: `.GITHUB-MODE/docs/security/0004-oidc-trust-relationships-and-fallback.md`
- Acceptance criteria met: OIDC configured for cloud paths, static credentials blocked, fallback documented.

### Task 2.5 — Security Lint and Simulation Harness

- Lint script: `.GITHUB-MODE/scripts/github-mode-security-lint.ts`
- Test suite: `.GITHUB-MODE/test/github-mode-security-lint.test.ts` (8 test cases with fixtures)
- Fixtures: `.GITHUB-MODE/test/fixtures/security-lint/` (8 fixture files)
- CI enforcement: `.github/workflows/github-mode-security-lint.yml`
- Acceptance criteria met: unpinned actions blocked, broad permissions blocked, fork PR secret exposure detected.

### Task 2.6 — Skills Quarantine Pipeline

- Gate script: `.GITHUB-MODE/scripts/enforce-trusted-skill-gate.ts`
- Test suite: `.GITHUB-MODE/test/enforce-trusted-skill-gate.test.ts` (8 test cases)
- Intake workflow: `.github/workflows/github-mode-skill-intake.yml`
- Static scan workflow: `.github/workflows/github-mode-skill-static-scan.yml`
- Policy classifier workflow: `.github/workflows/github-mode-skill-policy-classifier.yml`
- Emergency revocation workflow: `.github/workflows/github-mode-skill-emergency-revocation.yml`
- Runtime contracts: `skills-quarantine-registry.json`, `trusted-skills-allowlist.json`, `skills-emergency-revocations.json`, `trusted-command-gate.json`
- Acceptance criteria met: quarantine registry, static scan gate, policy evaluation, trusted registry, fail-closed enforcement, emergency revocation.

## Verification tasks to keep Phase 2 complete

These are recurring guardrail tasks (not missing implementation work):

1. Run `pnpm contracts:github:validate` and confirm pass.
2. Run `pnpm contracts:github:security-lint` and confirm pass.
3. Run `.GITHUB-MODE` security lint tests and confirm pass.
4. Run `enforce-trusted-skill-gate` tests and confirm pass.
5. Keep `implementation-scoreboard.json` aligned with real capability state when status changes.

## Remaining for ✅ Complete promotion

Each task requires immutable operational evidence from real CI workflow runs:

- Task 2.1: `task-2.1-secrets-rotation-evidence-<env>-<YYYYMMDDTHHMMSSZ>.json`
- Task 2.2: `task-2.2-environment-protection-verify-<env>-<YYYYMMDDTHHMMSSZ>.json`
- Task 2.3: `task-2.3-permissions-hardening-<env>-<YYYYMMDDTHHMMSSZ>.json`
- Task 2.4: `task-2.4-oidc-deploy-proof-<env>-<YYYYMMDDTHHMMSSZ>.json`
- Task 2.5: `task-2.5-security-lint-simulation-<env>-<YYYYMMDDTHHMMSSZ>.json`
- Task 2.6: `task-2.6-quarantine-e2e-<submission_id>-<YYYYMMDDTHHMMSSZ>.json`
