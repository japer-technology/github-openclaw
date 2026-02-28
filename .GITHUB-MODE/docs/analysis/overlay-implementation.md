# Overlay Implementation Analysis: GitHub Mode Without Source Modification

**Date:** 2026-02-17

**Status:** Analysis snapshot

**Scope:** How GitHub Mode can be installed and removed around existing OpenClaw forks without modifying upstream source, while preserving the ability to sync with upstream at will.

## 1. Problem Statement

GitHub Mode must satisfy three constraints simultaneously:

1. **Zero upstream mutation** — No file in `src/` is added, modified, or removed.
2. **Fork-safe install/uninstall** — A fork owner can enable GitHub Mode, then fully remove it, returning to a state identical to upstream.
3. **Upstream sync freedom** — `git pull upstream main` (or rebase) must remain conflict-free at all times, regardless of whether GitHub Mode is active.

These constraints rule out embedded approaches (patching source, injecting imports, modifying build config). They demand an **overlay architecture** — a layer that sits alongside the codebase, references it descriptively, and never couples to it structurally.

## 2. Overlay Architecture

### 2.1 Owned Path Contract

ADR 0001 already establishes the ownership boundary. GitHub Mode may only create or modify files within these paths:

| Path                              | Purpose                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `.GITHUB-MODE/docs/**`            | Planning, analysis, ADRs, security docs                    |
| `.GITHUB-MODE/runtime/**`         | Machine-validated contracts (manifests, schemas, policies) |
| `.github/workflows/github-mode-*` | CI/CD workflows scoped by naming convention                |
| `.github/actions/github-mode-*`   | Reusable composite actions                                 |
| `.GITHUB-MODE/scripts/**`         | Validation and maintenance scripts                         |
| `.GITHUB-MODE/test/**`            | Isolated test suites for contract validation               |
| `extensions/github/`              | Extension package (plugin architecture)                    |

No path outside this set is touched. The `.GITHUB-MODE/scripts/check-upstream-additions-only.ts` script enforces this at CI time — any PR that modifies a file outside the owned set is blocked.

### 2.2 Why This Guarantees Conflict-Free Sync

Git merge conflicts occur when two branches modify the same file regions. Since GitHub Mode only creates new files in directories that upstream does not use (or uses only for its own scoped content), there is no overlapping modification surface.

- Upstream evolves `src/`, `package.json`, build config, core workflows — GitHub Mode never touches these.
- GitHub Mode evolves `.GITHUB-MODE/runtime/`, `extensions/github/`, `.github/workflows/github-mode-*` — upstream never touches these.

The only theoretical conflict point is `.github/workflows/` if upstream adds a workflow with the `github-mode-` prefix. The naming convention makes this practically impossible, and the CI guard script provides a safety net.

### 2.3 Extension Architecture as the Runtime Bridge

OpenClaw's plugin system (`src/plugins/`) provides the runtime integration point without source modification:

1. **Discovery**: The plugin loader scans `extensions/*/package.json` for `openclaw.extensions` declarations.
2. **Registration**: Plugins declare channels, tools, CLI commands, hooks, and HTTP handlers via `openclaw.plugin.json`.
3. **Isolation**: Plugin dependencies live in the extension's own `package.json`, not in the root.
4. **SDK aliasing**: Runtime resolves `openclaw/plugin-sdk` via jiti, so extensions never import from `src/` directly.

GitHub Mode's runtime component would live in `extensions/github/`, following the exact same pattern as the 40+ existing extensions (matrix, msteams, slack, etc.). It registers as a plugin, receives events through the hook system, and exposes capabilities through the standard registry — all without a single line changed in `src/`.

## 3. Install and Uninstall Mechanics

### 3.1 Installation

Installing GitHub Mode onto an existing fork is a purely additive file operation:

```
# From a fork of openclaw
git remote add github-mode-overlay <overlay-repo-or-branch>
git merge github-mode-overlay/main --no-edit
```

Or, for a more controlled approach:

```
# Cherry-pick or copy only the owned paths
cp -r <overlay>/.GITHUB-MODE/runtime/ ./.GITHUB-MODE/runtime/
cp -r <overlay>/extensions/github/ ./extensions/github/
cp -r <overlay>/.github/workflows/github-mode-* ./.github/workflows/
cp -r <overlay>/.GITHUB-MODE/scripts/ ./.GITHUB-MODE/scripts/
cp -r <overlay>/.GITHUB-MODE/docs/ ./.GITHUB-MODE/docs/
```

The extension is then discovered automatically on the next `pnpm install` + gateway restart. No configuration change is needed in the core — the plugin loader picks up `extensions/github/` by convention.

### 3.2 Uninstallation

Removing GitHub Mode is the inverse — delete the owned paths:

```
rm -rf .GITHUB-MODE/runtime/
rm -rf extensions/github/
rm -rf .github/workflows/github-mode-*
rm -rf .github/actions/github-mode-*
rm -rf .GITHUB-MODE/scripts/
rm -rf .GITHUB-MODE/test/
rm -rf .GITHUB-MODE/docs/
```

After removal:

- The plugin loader finds no `extensions/github/` and registers nothing — no error, no degradation.
- CI workflows with the `github-mode-` prefix no longer exist, so they do not run.
- The runtime contracts directory is gone, so the contract validation workflow (`github-mode-contracts.yml`) is gone too.
- The installed runtime is byte-identical to what it was before installation.

**No orphaned state.** No config entries to clean up, no database migrations to reverse, no environment variables to unset. The overlay leaves no trace.

### 3.3 Verification Script

A verification script can confirm clean state after uninstall:

```bash
# Confirm no github-mode artifacts remain
! test -d .GITHUB-MODE && \
! test -d extensions/github && \
! ls .github/workflows/github-mode-* 2>/dev/null && \
echo "Clean: no GitHub Mode artifacts found"
```

## 4. Upstream Sync Workflow

### 4.1 Standard Fork Sync

A fork with GitHub Mode installed syncs with upstream normally:

```bash
git fetch upstream
git merge upstream/main
# Or: git rebase upstream/main
```

Because the owned paths are disjoint, this merge produces zero conflicts. The fork retains its GitHub Mode overlay, and gains all upstream improvements to `src/`, dependencies, and core workflows.

### 4.2 Automated Sync via Scheduled Workflow

GitHub Mode can include a self-maintaining sync workflow:

```yaml
# .github/workflows/github-mode-upstream-sync.yml
name: github-mode-upstream-sync
on:
  schedule:
    - cron: "0 6 * * 1" # Weekly Monday 6 AM UTC
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: |
          git remote add upstream https://github.com/openclaw/openclaw.git || true
          git fetch upstream main
          git merge upstream/main --no-edit
      - run: pnpm install && pnpm test
      - uses: peter-evans/create-pull-request@v6
        with:
          title: "chore: sync upstream openclaw"
          branch: github-mode/upstream-sync
          body: "Automated upstream sync. All tests pass."
```

This workflow lives inside the owned path (`.github/workflows/github-mode-*`), syncs upstream changes into a PR for review, and runs the full test suite to verify compatibility. The fork owner merges when ready — full control, zero risk.

### 4.3 Drift Detection

The existing `.GITHUB-MODE/scripts/check-upstream-additions-only.ts` script can be run post-sync to verify that the overlay has not drifted into upstream-owned territory. If a future GitHub Mode change accidentally modifies a core file, this check catches it before merge.

## 5. Architectural Boundaries That Make This Work

### 5.1 Contract-First, Not Import-First

GitHub Mode references core capabilities through **contracts** (JSON schemas, manifest files, policy documents in `.GITHUB-MODE/runtime/`), not through TypeScript imports. This means:

- Core can refactor `src/` internals freely — GitHub Mode does not break.
- GitHub Mode can evolve its contracts freely — core does not break.
- The contract schemas serve as the interface boundary, validated by CI but never compiled into the runtime.

### 5.2 Extension SDK as Stable API Surface

The plugin SDK (`openclaw/plugin-sdk`) provides a stable API for extensions. GitHub Mode's `extensions/github/` package imports only from this SDK, never from `src/` internals. The SDK is versioned and backward-compatible — extensions written against it survive core refactors.

### 5.3 Workflow Namespace Isolation

GitHub Actions workflows are namespaced by filename prefix (`github-mode-*`). This prevents collision with upstream workflows and makes enumeration trivial — both for humans reading the `.github/workflows/` directory and for scripts that need to list or remove GitHub Mode workflows.

### 5.4 No Shared Mutable State

GitHub Mode does not introduce database tables, config keys, or environment variables that core depends on. Its state surfaces are:

- **Repository files** (contracts, policies) — deletable without side effects.
- **GitHub Environments/Secrets** — scoped to GitHub Mode workflows; unused by core.
- **Ephemeral runner state** — destroyed after each workflow run.
- **External persistent memory** — managed outside the repository entirely.

Core never reads from these surfaces. Removing them is invisible to core.

## 6. Risk Analysis

| Risk                                                  | Likelihood | Mitigation                                           |
| ----------------------------------------------------- | ---------- | ---------------------------------------------------- |
| Upstream adds files in `.GITHUB-MODE/runtime/`        | Very low   | Naming convention + CI guard script                  |
| Plugin loader changes break extension discovery       | Low        | Plugin SDK versioning; extension tests               |
| Workflow naming collision (`github-mode-*` prefix)    | Very low   | Convention + CI enforcement                          |
| Fork owner forgets to uninstall before PR to upstream | Medium     | `check-upstream-additions-only.ts` blocks the PR     |
| Contract schema drift after major core refactor       | Medium     | Scheduled drift detection workflow                   |
| Extension requires core change for new capability     | Medium     | Feature request to core; never patch `src/` directly |

## 7. Comparison With Alternative Approaches

| Approach                | Source modification | Sync conflicts | Clean uninstall         | Verdict                    |
| ----------------------- | ------------------- | -------------- | ----------------------- | -------------------------- |
| **Overlay (current)**   | None                | None           | Yes, delete owned paths | Recommended                |
| Patch files (`*.patch`) | Applied at build    | On every sync  | Revert patches          | Fragile                    |
| Git submodule           | None                | Rare           | Remove submodule        | Complex UX                 |
| Monorepo embedding      | Heavy               | Frequent       | Impossible cleanly      | Rejected                   |
| Separate repository     | None                | N/A            | N/A                     | Loses co-location benefits |

The overlay approach is the only one that satisfies all three constraints (zero mutation, clean uninstall, conflict-free sync) without introducing operational complexity.

## 8. Conclusion

GitHub Mode is implementable as a pure overlay because OpenClaw's architecture already provides the necessary extension points:

1. The **plugin loader** discovers extensions by convention, not by import.
2. The **owned-path contract** (ADR 0001) prevents structural coupling.
3. The **CI guard script** enforces the boundary at merge time.
4. The **workflow namespace** (`github-mode-*`) isolates CI/CD.
5. The **contract-first design** decouples evolution of core and overlay.

A fork owner can install GitHub Mode by adding files to owned paths, sync with upstream at any cadence without conflicts, and fully remove the overlay by deleting those same paths — returning to a state indistinguishable from vanilla upstream. The installed runtime is never aware that GitHub Mode existed.

Alternative approaches were compared — patches, submodules, monorepo embedding, and separate repos were all evaluated and found inferior to this overlay approach.
