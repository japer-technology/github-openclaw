# ADR 0001 Runtime boundary and ownership

- Status: Accepted (amended 2026-02-19 for fork-context src usage)
- Date: 2026-02-16
- Amended: 2026-02-19
- Owners: Runtime maintainers, GitHub mode maintainers
- Decision scope: Installed runtime and GitHub mode architecture boundaries

## Context

OpenClaw now has two execution surfaces:

1. Installed runtime flows (CLI, gateway, channels, and local automation)
2. GitHub mode flows (workflow based automation and repository orchestration)

Without strict boundaries, features can couple across surfaces and create regressions in installed runtime behavior.

### Fork-context amendment (2026-02-19)

The original decision assumed GitHub Mode was a pure overlay added to an external upstream. In practice, `.GITHUB-MODE` lives inside a **fork** of the OpenClaw repository. The fork contains the full `src/` tree, and the entire purpose of the project is to run the OpenClaw runtime — agents, routing, tool policy, providers, memory — inside GitHub Actions as if openclaw were installed locally.

Strict prohibition of `src/` imports made the mode a governance-only layer unable to execute the core "magic." This amendment introduces a **fork-context execution path** that allows GitHub Mode workflows to build and run the openclaw source directly while preserving upstream sync safety and the governance overlay.

## Decision

### Ownership boundaries

- Installed runtime owns:
  - `src/**` runtime and provider execution
  - channel adapters and routing
  - local process lifecycle and CLI runtime semantics
- GitHub mode owns:
  - `.github/workflows/**` GitHub native orchestration
  - `.github/actions/**` reusable workflow action logic
  - `.GITHUB-MODE/**` contracts, policy metadata, docs, scripts, and tests for GitHub mode
- Shared ownership (contract only):
  - machine readable schemas and validators used to verify boundaries

### Fork-context execution path (amended)

When GitHub Mode runs inside a fork that contains the full OpenClaw source tree, workflows may **build and execute** the openclaw runtime from `src/` to leverage the actual agent execution engine, routing, tool policy, providers, and memory systems. This is the primary mechanism for delivering the "run as if installed" experience.

Permitted fork-context patterns:

- GitHub Actions workflows that run `pnpm install && pnpm build` and then invoke the built openclaw CLI or runtime modules.
- Workflow steps that run `pnpm openclaw ...` commands to execute agent tasks, process commands, or perform evaluations.
- Workflow steps that import from the built `dist/` output (e.g. `dist/index.js`, `dist/plugin-sdk/index.js`) for programmatic access.
- `.GITHUB-MODE/scripts/**` that import from `src/` for runtime behavior (agent execution, routing, policy evaluation) when running inside a fork-context workflow.

Fork-context constraints (must hold):

- The fork must not modify `src/**` files as part of `.GITHUB-MODE` — src changes are upstream-owned and sync separately.
- Fork-context execution must pass the same pre-agent security gates (skill scan, lockfile/provenance, policy evaluation) before agent execution.
- Governance scripts (contract validation, security lint, drift detection) remain contract-driven and do not require `src/` imports.
- The `check-upstream-additions-only` guard continues to block `.GITHUB-MODE` PRs that modify `src/**` files.

### Allowed shared modules

GitHub mode may depend on:

- Contract artifacts in `.GITHUB-MODE/runtime/**`
- Pure utility packages with no runtime side effects and no installed runtime service dependencies
- Shared validation libraries that do not import `src/**` runtime implementations
- **Fork-context only:** The built openclaw runtime (`dist/**`) and direct `src/` module imports for agent execution, routing, tool invocation, memory, and provider access within GitHub Actions workflows

### Prohibited coupling patterns

The following remain prohibited:

- `.GITHUB-MODE` PRs that modify files in `src/**` (upstream-owned; enforced by `check-upstream-additions-only`)
- Installed runtime command paths requiring GitHub workflow outputs to run core behaviors
- Shared modules that perform runtime side effects (network calls, process control, provider auth) at import time in governance scripts
- Any direct branch mutation from privileged workflows outside PR mediated flow

### Coupling examples

Allowed patterns:

- A shared package exports pure command schema validators consumed by both installed runtime and GitHub mode.
- GitHub mode adapter implements an orchestration interface and maps it to GitHub workflow/job primitives.
- Contract tests replay the same fixture set against installed runtime and GitHub adapters without importing `src/**` internals.
- **(Fork-context)** A workflow builds openclaw from source and runs `pnpm openclaw agent --message "explain this PR"` to execute an agent task.
- **(Fork-context)** A workflow step imports `src/agents/pi-embedded-runner` to execute agent loops inside a GitHub Actions job after passing pre-agent gates.
- **(Fork-context)** A workflow uses the built runtime to evaluate routing decisions, tool policies, or model provider calls for command execution.

Prohibited patterns:

- A `.GITHUB-MODE` PR modifies `src/agents/pi-embedded-runner` to add GitHub-specific behavior (must not touch upstream src).
- A governance script (contract validation, security lint) imports `src/routing/*` instead of using contract artifacts.
- A shared helper package imports installed runtime provider auth modules on load, then is required by governance checks.

### Guardrails

- Boundary checks must run in CI for changes touching `.github/**`, `.GITHUB-MODE/**`, or `src/**`.
- Reviews for boundary files require CODEOWNERS from both installed runtime and GitHub mode maintainers.
- The `check-upstream-additions-only` script enforces that `.GITHUB-MODE` PRs do not modify `src/**` files.
- Fork-context execution workflows must pass all pre-agent security gates before running agent tasks.

## Consequences

### Positive

- Runtime teams can evolve independently with explicit contracts.
- Security review surface is reduced by deny by default coupling policy.
- Regression risk for installed runtime is lower.
- **(Fork-context amendment)** GitHub Mode can leverage the full OpenClaw runtime — agents, routing, tool policy, providers, memory — enabling the "run as if installed" experience within GitHub Actions.
- **(Fork-context amendment)** No need for complex source-copy, scrape, or extraction strategies; the fork already has everything.

### Tradeoffs

- Additional schema and review overhead for cross boundary changes.
- New shared helpers may require extraction into neutral utility modules.
- **(Fork-context amendment)** Fork-context workflows require a full `pnpm install && pnpm build` step, which adds CI time but delivers the complete runtime.

## Maintainer review checklist

- [ ] Ownership assignment is explicit and current.
- [ ] Allowed shared modules remain narrow and auditable.
- [ ] No prohibited coupling pattern is introduced.
- [ ] CI boundary checks are still mandatory.
- [ ] Fork-context execution passes pre-agent security gates.
- [ ] No `.GITHUB-MODE` PR modifies `src/**` files.

## Approval signoff

```governance-signoff
[
  {
    "role": "runtime",
    "github": "@openclaw-runtime-lead",
    "approved_at": "2026-02-18"
  },
  {
    "role": "github-mode",
    "github": "@openclaw-github-mode-lead",
    "approved_at": "2026-02-18"
  },
  {
    "role": "fork-context-amendment",
    "github": "@openclaw-github-mode-lead",
    "approved_at": "2026-02-19"
  }
]
```
