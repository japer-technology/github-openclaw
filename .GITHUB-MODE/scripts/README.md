# 🦞 GitHub Mode: Scripts

### Automation scripts for GitHub Mode policy checks, contract validation, and workflow guardrails.

<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/japer-technology/gh-openclaw/main/.GITHUB-MODE/assets/logo.png" alt="OpenClaw with GitHub Mode" width="500">
  </picture>
</p>

## Script categories

- Activation gate (`check-github-mode-active.ts`) used by all `github-mode-*` entry workflows.
- Contract validation (`validate-github-runtime-contracts.ts`).
- Security and policy linting (`github-mode-security-lint.ts`, `lint-github-mode-workflows.ts`).
- Environment and credential guardrails (`verify-github-environments.ts`, `check-github-mode-oidc-credentials.ts`).
- Governance approval validation (`validate-governance-approvals.ts`).
- Upstream safety checks (`check-upstream-additions-only.ts`).
- Docs boundary consistency checks (`check-runtime-boundary-doc-consistency.ts`).
- Implementation scoreboard guard + summary (`check-implementation-scoreboard.ts`).

## Usage

Run scripts through project commands when available (for consistent tooling and CI parity), for example:

```bash
pnpm contracts:github:validate
```

## Authoring guidance

- Keep script output actionable (clear failure reason + next step).
- Prefer deterministic checks; avoid network dependencies unless required.
- Coordinate script changes with tests in `.GITHUB-MODE/test/`.
