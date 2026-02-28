##### ⚠️ WARNING: This project is under active development. Planned release in March 2026.

# 🦞 OpenClaw with GitHub Mode

### A first-class runtime plane for OpenClaw, not just a CI wrapper around source code.

<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/japer-technology/gh-openclaw/main/.GITHUB-MODE/assets/logo.png" alt="OpenClaw with GitHub Mode" width="500">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/japer-technology/gh-openclaw/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/japer-technology/gh-openclaw/ci.yml?branch=main&style=for-the-badge" alt="japer-technology/gh-openclaw CI status"></a>
  <a href="LICENCE.md"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

#### GitHub Mode is an additive runtime for **OpenClaw** that shifts orchestration to repository-native workflows while preserving compatibility with the installed runtime. It is designed for teams that need strict reviewability, policy boundaries, and durable runtime contracts.

- GitHub-Mode Docs: https://github.com/japer-technology/gh-openclaw/tree/main/.GITHUB-MODE/docs
- GitHub-Mode Runtime Contracts: https://github.com/japer-technology/gh-openclaw/tree/main/.GITHUB-MODE/runtime

This is a repository wrapper is not a framework, a library, or a platform. It is a structural pattern - a way of managing files, contracts, and workflows so that a GitHub repository becomes a participant in its own infrastructure rather than a passive occupant.

---

## Why GitHub Mode

Standard OpenClaw operation is excellent for personal/local operation. GitHub Mode exists for a different operating profile:

- **Repo-governed automation**: behavior derives from committed state and reviewed workflow changes.
- **Auditable execution**: task activity, policy checks, and artifact updates are visible in pull requests and Actions logs.
- **Contract-first design**: machine-readable runtime contracts under `.GITHUB-MODE/runtime/` are validated in CI.
- **Upstream-safe customization**: GitHub Mode changes are intended to remain additive so upstream sync stays clean.

If you need repeatability across contributors and repositories, GitHub Mode is the right abstraction.

### gh-openclaw: daily-synced GitHub runtime extension of OpenClaw - no local install required

---

## Scope and boundaries

GitHub Mode runs inside a fork that contains the full OpenClaw source tree. The fork-context execution model builds and runs the openclaw runtime from `src/` to deliver the "run as if installed" experience within GitHub Actions.

**Two layers work together:**

- **Execution layer (uses src):** Workflows build openclaw from source (`pnpm install && pnpm build`) and run the actual agent engine, routing, tool policy, providers, and memory systems. This is the core "magic" — the same runtime that powers the installed experience.
- **Governance layer (contract-driven):** Contract validation, security lint, drift detection, and policy enforcement use `.GITHUB-MODE/runtime/` contracts without importing `src/`. This adds safety and auditability on top.

**Key constraint:** `.GITHUB-MODE` PRs must not modify `src/**` files. Source changes are upstream-owned and sync separately.

For architecture rationale, read:

- ADR 0001 Runtime Boundary and Ownership (with fork-context amendment): https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/docs/adr/0001-runtime-boundary-and-ownership.md
- ADR 0002 Installed Runtime Non-Regression Guardrails: https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/docs/adr/0002-installed-runtime-non-regression-guardrails.md

---

## Repository map for GitHub Mode

Use this map to orient changes:

- `.GITHUB-MODE/assets/` — resource docs and multi-media.
- `.GITHUB-MODE/docs/` — architecture, security, planning, and analysis docs.
- `.GITHUB-MODE/runtime/` — runtime contracts and schemas.
- `.GITHUB-MODE/scripts/` — contract validation and upstream-guard scripts.
- `.GITHUB-MODE/test/` — validation and upstream-sync guard test coverage.
- `.github/workflows/github-mode-*` — GitHub Mode CI and policy workflows.

---

## Quick start (GitHub Mode contributors)

### 1) Prerequisites

- Node.js 22+
- pnpm
- GitHub repository access with Actions permissions

Install dependencies:

```bash
pnpm install
```

### 2) Validate contracts

```bash
pnpm contracts:github:validate
```

### 3) Run guardrail checks

```bash
node --import tsx .GITHUB-MODE/scripts/check-upstream-additions-only.ts
pnpm test -- .GITHUB-MODE/test/validate-github-runtime-contracts.test.ts .GITHUB-MODE/test/check-upstream-additions-only.test.ts
```

### 4) Run full project checks before opening a PR

```bash
pnpm build
pnpm check
pnpm test
```

---

## Development workflow

1. **Start from a clear intent**
   - Decide whether the change is contract, workflow, docs, or policy.
2. **Keep changes additive when possible**
   - Prefer extending GitHub Mode-owned directories rather than modifying upstream-owned core files.
3. **Update docs with code**
   - If you modify behavior, update the corresponding `.GITHUB-MODE/docs/**` pages and ADR references.
4. **Validate locally**
   - Run contract validation + targeted tests before full suite.
5. **Open a focused PR**
   - Keep PR scope narrow and include rationale, risk, and rollback guidance.

---

## Security model highlights

GitHub Mode documentation emphasizes risk-aware operation instead of informal trust assumptions.

- Trigger trust and privilege expectations: https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/docs/security/0001-github-trigger-trust-matrix.md
- Skills quarantine pipeline: https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/docs/security/0002-skills-quarantine-pipeline.md

Recommended practice:

- Treat workflow inputs and repository events as untrusted until validated.
- Keep secrets handling explicit and minimal.
- Require code review for policy/workflow changes that affect execution boundaries.

---

## Planning documents

GitHub Mode planning is staged:

- MVP: https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/docs/planning/mvp.md
- MVVP: https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/docs/planning/mvvp.md
- MVVVP: https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/docs/planning/mvvvp.md
- Implementation plan: https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/docs/planning/implementation-plan.md
- Task breakdown: https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/docs/planning/implementation-tasks.md

Use these as the canonical roadmap before introducing new architecture branches.

---

## CI and policy checks

GitHub Mode depends on guardrails that should stay green for every PR touching mode-owned paths.

### Activation gate (fail-closed)

Every `github-mode-*` workflow includes an explicit activation guard as its first blocking step:

- `node --import tsx .GITHUB-MODE/scripts/check-github-mode-active.ts`

The guard requires `.GITHUB-MODE/ACTIVE.md` to exist. If it is missing, workflows fail immediately with:

- `GitHub Mode disabled by missing ACTIVE.md`

This enforcement applies to all GitHub Mode entry workflows under `.github/workflows/github-mode-*.yml`.

Core checks:

- Runtime contracts validation (`pnpm contracts:github:validate`)
- Upstream additive-change guard (`.GITHUB-MODE/scripts/check-upstream-additions-only.ts`)
- Targeted guardrail tests under `test/`

If a change requires broadening owned paths or guard behavior, update docs/ADR rationale in the same PR.

---

## Relationship to standard OpenClaw README

This document is a **full alternative entrypoint** oriented toward repository/runtime governance.

Use the standard README when you want product onboarding and personal deployment guidance:

- https://github.com/openclaw/openclaw/blob/main/README.md

Use this GitHub Mode README when you need:

- repository-first runtime architecture,
- contract and policy development workflow,
- security/governance references for collaborative operation.

---

## Additional references

- GitHub Mode overview: https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/docs/overview.md
- The Idea: https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/docs/idea.md
- Runtime contracts README: https://github.com/japer-technology/gh-openclaw/blob/main/.GITHUB-MODE/runtime/README.md
- OpenClaw docs portal: https://docs.openclaw.ai
- Community Discord: https://discord.gg/clawd

---

## License

MIT. See [LICENCE](LICENCE.md).
