# 🦞 Open Claw with GitHub Mode

### GitHub Mode extends OpenClaw into repository workflows, running assistant behavior directly from repository state while preserving the installed runtime experience.

<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/japer-technology/gh-openclaw/main/.GITHUB-MODE/assets/logo.png" alt="OpenClaw with GitHub Mode" width="500">
  </picture>
</p>

## Architecture

- [Overview](overview.md) — product and architecture spec
- [The Idea](idea.md) — core thesis, parity target, and interaction model boundaries

## Planning

- [MVP](planning/mvp.md) — minimum viable implementation
- [MVVP](planning/mvvp.md) — minimum viable vision product
- [MVVVP](planning/mvvvp.md) — minimum viable valuable product
- [Implementation Plan](planning/implementation-plan.md) — phased execution plan
- [Implementation Tasks](planning/implementation-tasks.md) — tactical task breakdown
- [Task 0 Analysis](planning/task-0-analysis.md) — Phase 0 impact analysis

## Architecture Decision Records

- [ADR Index](adr/README.md)
- [ADR 0001: Runtime Boundary and Ownership](adr/0001-runtime-boundary-and-ownership.md)
- [ADR 0002: Installed Runtime Non-Regression Guardrails](adr/0002-installed-runtime-non-regression-guardrails.md)

## Security

- [Security Index](security/README.md)
- [Trigger Trust Matrix](security/0001-github-trigger-trust-matrix.md)
- [Skills Quarantine Pipeline](security/0002-skills-quarantine-pipeline.md)

## Analysis

- [Why](analysis/why.md) — rationale for GitHub as runtime platform
- [Magic](analysis/magic.md) — where the LM reasoning lives in the codebase
- [WWWWWH](analysis/wwwwwh.md) — the 5 Ws and 1 H
- [Libraries](analysis/libraries.md) — external dependency inventory
- [Directories](analysis/directories.md) — codebase directory map
- [Non-goals](analysis/non-goals.md) — task classes that should stay outside GitHub Mode
- [General Theory](analysis/GitHub-Mode-General-Theory.md) — the repository wrapper pattern and why it works

## Writing Style for GitHub Mode Docs

When describing local mode risk in this docs area, use **risk-focused, non-dismissive** language:

- State concrete risk classes and operating constraints (for example: secrets exposure, weak isolation, missing governance controls).
- Avoid ridicule, absolutist labels, or language that dismisses existing users and workflows.
- Prefer comparative framing: local mode is appropriate for some contexts, while GitHub mode is designed for stronger control, auditability, and team governance.

## Runtime Contracts

Runtime contract artifacts live in [`runtime/`](../runtime/README.md) and are validated by `pnpm contracts:github:validate`.

GitHub Mode package requirements are documented in [`../assets/github-mode-required-packages.json`](../assets/github-mode-required-packages.json). This list is additive and must be merged with the current root `package.json` dependency set, never used as a replacement list. Sync and validate coverage with `node --import tsx .GITHUB-MODE/scripts/validate-github-mode-package-list.ts` (it checks and auto-adds any missing GitHub Mode packages in root `package.json`).

## Extension Architecture and Fork-Context Execution

GitHub Mode uses **two complementary patterns** for running OpenClaw behavior:

### Fork-context src execution (primary)

Since the fork contains the full OpenClaw source tree, execution workflows build and run the openclaw runtime directly from `src/`. This is the primary mechanism for delivering the "run as if installed" experience — the same agent engine, auto-reply orchestration, routing, tool policy, providers, and memory that power the installed runtime also power GitHub Mode commands.

- Workflows run `pnpm install && pnpm build` then invoke the built openclaw CLI or runtime modules.
- `.GITHUB-MODE` PRs must not modify `src/**` files (upstream-owned; enforced by `check-upstream-additions-only`).
- See [ADR 0001 fork-context amendment](adr/0001-runtime-boundary-and-ownership.md) for the full rationale.

### Extension pattern (optional, for GitHub-specific runtime code)

When GitHub Mode needs TypeScript runtime code that is specific to the GitHub execution environment (not present in upstream `src/`), it should follow the [extension pattern](../../extensions/) by implementing that code in `extensions/github/`.

### Governance layer (contract-driven, no src imports)

Governance scripts (contract validation, security lint, drift detection) remain contract-driven and do not require `src/` imports. They validate `.GITHUB-MODE/runtime/` contracts and lint workflow YAML files.

## Upstream Sync Guard

GitHub Mode changes must be purely additive to ensure the fork can cleanly pull upstream OpenClaw upgrades. The `check-upstream-additions-only` script enforces this:

```bash
node --import tsx .GITHUB-MODE/scripts/check-upstream-additions-only.ts
```

This runs automatically in the [`github-mode-contracts`](../../.github/workflows/github-mode-contracts.yml) CI workflow for PRs touching GitHub Mode paths.

**Owned paths** (safe to add or modify):

- `.GITHUB-MODE/**`
- `.github/workflows/github-mode-*`

Everything else is upstream-owned. Modifications to upstream files will fail the guard.

## Maintenance During Ongoing Development

These docs are designed to withstand continuous OpenClaw core evolution by following these isolation principles:

1. **Fork-context execution leverages `src/` directly.** Execution workflows build and run `src/` as-is. When `src/` changes via upstream sync, the fork automatically picks up improvements — no manual adaptation needed.

2. **Governance scripts do not import `src/`.** Contract validation, security lint, and drift detection use `.GITHUB-MODE/runtime/` contracts. Core refactors do not break governance validation.

3. **`.GITHUB-MODE` PRs must not modify `src/**`files.** The`check-upstream-additions-only` script enforces this. Source changes arrive via upstream sync.

4. **Contract-first validation.** Runtime contracts in `.GITHUB-MODE/runtime/` are the only machine-validated governance artifacts. The validation script (`.GITHUB-MODE/scripts/validate-github-runtime-contracts.ts`) checks contract structure, not doc prose.

5. **Analysis snapshots are explicitly dated.** `analysis/directories.md` and `analysis/libraries.md` are point-in-time snapshots with staleness notes. Regenerate them when the codebase structure or dependency set changes materially.

When touching these docs during core development:

- Keep internal links relative (not root-relative) so they resolve on GitHub without Mintlify navigation.
- Do not add `src/` imports to governance scripts (contract validation, security lint).
- Update analysis snapshots only when relevant structure changes; do not block unrelated PRs on snapshot freshness.
