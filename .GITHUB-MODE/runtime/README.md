# 🦞 GitHub Mode: Runtime Contracts

### This directory contains contract artifacts used by GitHub mode planning and validation.

<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/japer-technology/gh-openclaw/main/.GITHUB-MODE/assets/logo.png" alt="OpenClaw with GitHub Mode" width="500">
  </picture>
</p>

## Required artifacts

- `manifest.schema.json`: schema contract for the runtime manifest.
- `runtime-manifest.json`: component identifiers, versions, and owners.
- `adapter-contracts.json`: adapter capability and trust gating contracts.
- `command-policy.json`: allowed actions, constraints, and enforcement mode.
- `trust-levels.json`: trust tier definitions and privilege boundaries.
- `parity-matrix.json`: expected parity mapping between installed runtime and GitHub mode.
- `workspace-convergence-map.json`: acceptance criteria and reconciliation signals.
- `entity-manifest.schema.json`: schema for entity manifest (multi-entity collaboration).
- `entity-manifest.json`: entity identity, ownership, trust tier, and capabilities.
- `collaboration-policy.schema.json`: schema for collaboration policy (deny-by-default routing).
- `collaboration-policy.json`: allowed collaboration routes and trust requirements.
- `collaboration-envelope.schema.json`: schema for cross-entity collaboration message envelopes.
- `skills-quarantine-registry.json`: intake/pending registry with scan + policy states.
- `trusted-skills-allowlist.json`: immutable digest keyed trusted allowlist and dual approvals.
- `trusted-command-gate.json`: fail-closed runtime gate requirements for trusted workflows.
- `skills-emergency-revocations.json`: emergency revocation records and incident linkage.

## Task 1 consumption contract

Task 1 implementations must treat these files as required inputs:

1. Load and validate `runtime-manifest.json` against `manifest.schema.json`.
2. Load and validate `entity-manifest.json` against `entity-manifest.schema.json`.
3. Load and validate `collaboration-policy.json` against `collaboration-policy.schema.json`.
4. Validate `collaboration-envelope.schema.json` compiles as a valid JSON Schema.
5. Parse and enforce required fields in `command-policy.json`:
   - `policyVersion`
   - `enforcementMode`
   - `allowedActions`
   - `constraints`
6. Parse `parity-matrix.json` and enforce:
   - every mapping has `workflow`, `installedRuntime`, `githubMode`, and `parity`
   - `installed-only` parity rows include both `owner` and `rationale`
7. Parse `workspace-convergence-map.json` and enforce:
   - non-empty `acceptanceCriteria`
   - at least one `reconciliationSignals[]` entry with `required: true`
8. Verify `collaboration-policy.json` has `defaultAction: "deny"` (deny-by-default).
9. Parse and enforce `skills-quarantine-registry.json`:
   - classifier outcomes include `approved_limited`, `approved_trusted`, and `rejected_policy`
   - at least one intake submission remains in `pending_scan`
10. Parse and enforce `trusted-skills-allowlist.json`:

- entries are keyed by immutable `sha256:<digest>`
- `approved_trusted` entries include dual approvals from distinct approvers

11. Parse and enforce `trusted-command-gate.json`:

- `enforcementMode` is `fail_closed`
- runtime fetch from non-trusted registries is disabled

12. Parse and enforce `skills-emergency-revocations.json`:

- each event marks the digest `revoked`
- each event invalidates allowlist + caches and references an incident issue.

### Failure behavior

Task 1 must fail fast when any required file is missing or malformed.

- Local validation failure: non-zero exit from `pnpm contracts:github:validate`.
- CI validation failure: the `github-mode-contracts` workflow fails and blocks merge.

## Contract versioning and compatibility

All contract files include a `schemaVersion` field. When making changes:

- **Compatible changes** (adding optional fields, adding new mappings): bump the minor version of the contract's version field (e.g., `matrixVersion` from `v1.0.0` to `v1.1.0`).
- **Incompatible changes** (removing fields, changing required fields, renaming keys): bump the major version, add migration notes below, and update the contract validator.

### Migration notes

Record any incompatible schema changes here with the date and description:

- _(none yet)_

## Validation command

Run this check before opening or merging Task 1 changes:

```bash
pnpm contracts:github:validate
```
