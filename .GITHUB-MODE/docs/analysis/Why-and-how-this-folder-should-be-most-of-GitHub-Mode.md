# Why and How `.GITHUB-MODE/` Should Be Most of GitHub Mode

## Executive Summary

GitHub Mode currently spans **six separate directory trees** plus **four loose root files** across the OpenClaw repository. This analysis examines whether the majority of these artifacts could consolidate under the `.GITHUB-MODE/` root directory, what must stay where it is, and what a consolidated structure would look like.

**Verdict:** The bulk of GitHub Mode — documentation, analysis, planning, security docs, validation scripts, and tests — can and should live under `.GITHUB-MODE/`. Only runtime contracts consumed by CI workflows, the CI workflow file itself, and the package.json script entry must remain in their current locations. Consolidation reduces scatter from 6+ locations to 2 (`.GITHUB-MODE/` plus a thin set of integration points), makes the feature trivially installable/removable as an overlay, and aligns with the project's own ADR 0001 principle of clear ownership boundaries.

---

## Current State: Where GitHub Mode Lives Today

| Location                                      | Files   | Purpose                                         |
| --------------------------------------------- | ------- | ----------------------------------------------- |
| `.GITHUB-MODE/`                               | 1       | Directory marker + README                       |
| `.GITHUB-MODE-*.md` (root)                    | 4       | README, ACTIVE flag, LICENCE, SECURITY          |
| `.GITHUB-MODE.png` (root)                     | 1       | Branding image                                  |
| `docs/github-mode/`                           | ~26     | Architecture, security, planning, analysis docs |
| `runtime/github-mode/`                        | ~13     | Runtime contracts and JSON schemas              |
| `scripts/github-mode/`                        | 2       | Contract validation + upstream-guard scripts    |
| `test/github-mode/`                           | 2       | Vitest test suites for the scripts              |
| `.github/workflows/github-mode-contracts.yml` | 1       | CI workflow                                     |
| `package.json`                                | 1 entry | `contracts:github:validate` script              |

**Total: ~50 artifacts across 6+ locations, plus root-level scattered files.**

---

## What CAN Move Into `.GITHUB-MODE/`

### 1. Documentation (`docs/github-mode/` → `.GITHUB-MODE/docs/`)

**Current location:** `docs/github-mode/` (26 files across `analysis/`, `planning/`, `adr/`, `security/` subdirectories)

**Can it move? Yes.**

These docs are exclusively about GitHub Mode. They are not served by Mintlify (the project's doc site at docs.openclaw.ai), not imported by any source code, and not consumed by any build tool. They exist purely for contributors working on GitHub Mode.

Moving them to `.GITHUB-MODE/docs/` keeps the same subdirectory structure (`docs/analysis/`, `docs/planning/`, `docs/adr/`, `docs/security/`) and makes GitHub Mode documentation self-contained within the feature directory.

**Impact on existing references:**

- The `.GITHUB-MODE-README.md` links to `docs/github-mode/` via full GitHub URLs — these would need updating.
- The CI workflow path filter references `docs/github-mode/**` — this would need updating.
- The `validate-github-runtime-contracts.ts` script reads `docs/github-mode/planning/implementation-tasks.md` — path would need updating.
- No `src/` code references these paths.

### 2. Validation Scripts (`scripts/github-mode/` → `.GITHUB-MODE/scripts/`)

**Current location:** `scripts/github-mode/` (2 TypeScript files)

**Can it move? Yes.**

These scripts are GitHub Mode-specific tooling. They validate runtime contracts and enforce the additive-change guard. They are not shared utilities used by the core OpenClaw build, and they are only invoked by:

- The `package.json` script `contracts:github:validate` (path reference can be updated)
- The CI workflow `.github/workflows/github-mode-contracts.yml` (path reference can be updated)
- The test files (import paths can be updated)

Moving them to `.GITHUB-MODE/scripts/` groups the tooling with the feature it belongs to.

### 3. Tests (`test/github-mode/` → `.GITHUB-MODE/test/`)

**Current location:** `test/github-mode/` (2 Vitest test files)

**Can it move? Yes.**

These tests exclusively test the GitHub Mode validation scripts. They are not part of the core test suite's coverage targets and are structurally isolated. Vitest can discover tests anywhere in the repo (the project already runs tests from `src/`, `test/`, and extension directories).

Moving them to `.GITHUB-MODE/test/` co-locates tests with the scripts they validate.

### 4. Root-Level Dot Files (`.GITHUB-MODE-*.md`, `.GITHUB-MODE.png`)

**Current location:** Repository root

**Can they move? Yes, with one exception.**

| File                       | Can Move?                                | Reasoning                                                                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.GITHUB-MODE-README.md`   | **Yes → `.GITHUB-MODE/README.md`**       | The `.GITHUB-MODE/` directory already has a README.md. The root-level `-README.md` is a more detailed version that could replace or absorb the current one.                                                                                                               |
| `.GITHUB-MODE-LICENCE.md`  | **Yes → `.GITHUB-MODE/LICENCE.md`**      | Licence is specific to the GitHub Mode overlay. Belongs with the feature.                                                                                                                                                                                                 |
| `.GITHUB-MODE-SECURITY.md` | **Yes → `.GITHUB-MODE/SECURITY.md`**     | Security reporting for GitHub Mode components. Belongs with the feature.                                                                                                                                                                                                  |
| `.GITHUB-MODE-ACTIVE.md`   | **Debatable**                            | This is a feature flag file ("delete to disable"). Its root placement makes it visible and easy to find. It could live at `.GITHUB-MODE/ACTIVE.md` but the root location is intentionally prominent. Either location works — the key is that its existence is documented. |
| `.GITHUB-MODE.png`         | **Yes → `.GITHUB-MODE/assets/logo.png`** | Branding image referenced via raw GitHub URL. URL would need updating in README, but this is a one-time change.                                                                                                                                                           |

---

## What MUST Stay Outside `.GITHUB-MODE/`

### 1. `.github/workflows/github-mode-contracts.yml`

**Must stay at:** `.github/workflows/`

**Why:** GitHub Actions only discovers workflow files under `.github/workflows/`. This is a GitHub platform constraint, not a choice. There is no workaround — moving this file would silently disable CI validation.

**Mitigation:** The workflow file is already namespaced with `github-mode-` prefix, making it easy to identify. It is a thin orchestration layer (36 lines) that points to scripts that CAN live under `.GITHUB-MODE/scripts/`.

### 2. `package.json` script entry

**Must stay at:** `package.json`

**Why:** The `contracts:github:validate` npm script must be in the root `package.json` so `pnpm contracts:github:validate` works from the repo root. This is a single line — the script it points to can live anywhere.

**Mitigation:** Only the path in the script value would change. The entry remains a thin pointer:

```json
"contracts:github:validate": "node --import tsx .GITHUB-MODE/scripts/validate-github-runtime-contracts.ts"
```

### 3. Runtime Contracts (`runtime/github-mode/`) — Requires Careful Consideration

**Current location:** `runtime/github-mode/` (13 files)

**Can it move? It depends on the consumption model.**

Arguments for keeping in `runtime/github-mode/`:

- The `runtime/` directory is semantically correct — these ARE runtime contracts.
- Future GitHub Actions workflows may reference these paths with well-known conventions.
- ADR 0001 explicitly lists `runtime/github-mode/**` as a GitHub Mode-owned path.
- The overlay-implementation doc describes these as part of the "owned paths" contract.

Arguments for moving to `.GITHUB-MODE/runtime/`:

- The contracts are exclusively GitHub Mode artifacts. No core OpenClaw code reads them.
- Consolidation into `.GITHUB-MODE/` makes the feature fully self-contained (minus the workflow file).
- The overlay install/uninstall story becomes simpler: add/remove one directory tree.

**Recommendation:** Move to `.GITHUB-MODE/runtime/`. The contracts are consumed only by the validation script (which can reference any path) and the CI workflow (which can reference any path). There is no platform constraint keeping them in `runtime/`.

---

## Proposed Consolidated Structure

```
.GITHUB-MODE/
├── README.md                          # Full README (absorbs .GITHUB-MODE-README.md)
├── ACTIVE.md                          # Feature flag (delete to disable)
├── LICENCE.md                         # MIT licence for GitHub Mode overlay
├── SECURITY.md                        # Security reporting for GitHub Mode
├── assets/
│   └── logo.png                       # Branding image (.GITHUB-MODE.png)
├── docs/
│   ├── README.md                      # Doc index and governance
│   ├── overview.md                    # Product and architecture spec
│   ├── idea.md                        # Core thesis
│   ├── the-idea.md                    # Historical snapshot
│   ├── analysis/
│   │   ├── why.md                     # Why GitHub Mode exists
│   │   ├── magic.md                   # Key pivot points for LM execution
│   │   ├── wwwwwh.md                  # 5 Ws and 1 H
│   │   ├── libraries.md              # Dependency inventory
│   │   ├── directories.md            # Filesystem snapshot
│   │   ├── non-goals.md              # Explicit exclusions
│   │   ├── overlay-implementation.md  # Overlay architecture
│   │   ├── performance.md            # Performance comparison
│   │   └── critique-1.md             # Architecture critique
│   ├── planning/
│   │   ├── mvp.md
│   │   ├── mvvp.md
│   │   ├── mvvvp.md
│   │   ├── implementation-plan.md
│   │   ├── implementation-tasks.md
│   │   ├── task-0-analysis.md
│   │   └── old-plan.md
│   ├── adr/
│   │   ├── README.md
│   │   ├── 0001-runtime-boundary-and-ownership.md
│   │   └── 0002-installed-runtime-non-regression-guardrails.md
│   └── security/
│       ├── README.md
│       ├── 0001-github-trigger-trust-matrix.md
│       └── 0002-skills-quarantine-pipeline.md
├── runtime/
│   ├── README.md                      # Contract artifacts spec
│   ├── runtime-manifest.json
│   ├── entity-manifest.json
│   ├── adapter-contracts.json
│   ├── command-policy.json
│   ├── collaboration-policy.json
│   ├── trust-levels.json
│   ├── parity-matrix.json
│   ├── workspace-convergence-map.json
│   ├── manifest.schema.json
│   ├── entity-manifest.schema.json
│   ├── collaboration-policy.schema.json
│   └── collaboration-envelope.schema.json
├── scripts/
│   ├── validate-github-runtime-contracts.ts
│   └── check-upstream-additions-only.ts
└── test/
    ├── validate-github-runtime-contracts.test.ts
    └── check-upstream-additions-only.test.ts
```

**What remains outside:**

```
.github/workflows/github-mode-contracts.yml   # GitHub platform constraint
package.json (1 script entry)                  # pnpm script pointer
```

---

## What Changes If We Consolidate

### Files That Need Path Updates

| File                                                        | Change Required                                                                                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/github-mode-contracts.yml`               | Update path filters and script paths                                                                                                            |
| `package.json`                                              | Update `contracts:github:validate` script path                                                                                                  |
| `.GITHUB-MODE/scripts/validate-github-runtime-contracts.ts` | Update contract file paths from `runtime/github-mode/` to `.GITHUB-MODE/runtime/` and doc path from `docs/github-mode/` to `.GITHUB-MODE/docs/` |
| `.GITHUB-MODE/scripts/check-upstream-additions-only.ts`     | Update owned-path patterns                                                                                                                      |
| `.GITHUB-MODE/test/*.test.ts`                               | Update import paths for scripts                                                                                                                 |
| `.GITHUB-MODE/README.md`                                    | Update internal links                                                                                                                           |
| `.GITHUB-MODE/docs/README.md`                               | Already uses relative paths — minimal changes                                                                                                   |

### ADR 0001 Owned Paths Update

ADR 0001 currently defines owned paths as:

```
docs/github-mode/**
runtime/github-mode/**
.github/workflows/github-mode-*
scripts/github-mode/**
test/github-mode/**
```

After consolidation, this simplifies to:

```
.GITHUB-MODE/**
.github/workflows/github-mode-*
```

This is a **significant simplification** — from 5 owned-path patterns to 2.

---

## Benefits of Consolidation

### 1. Overlay Install/Uninstall Becomes Trivial

The overlay-implementation doc already describes GitHub Mode as installable/removable via additive file operations. Consolidation makes this literal:

- **Install:** Copy `.GITHUB-MODE/` directory + one workflow file + one package.json line.
- **Uninstall:** Delete `.GITHUB-MODE/` directory + one workflow file + one package.json line.
- **Current state:** Must touch 6+ directories and 4 root files.

### 2. Upstream Sync Is Cleaner

With GitHub Mode files in a single directory tree, upstream merges (from `openclaw/openclaw`) have zero risk of path conflicts. The `.GITHUB-MODE/` directory does not exist in upstream, so every merge is additive by construction — not just by policy.

### 3. Discoverability

A single `.GITHUB-MODE/` directory with clear subdirectories is easier to navigate than files scattered across `docs/`, `runtime/`, `scripts/`, `test/`, and root. New contributors see one entry point, not six.

### 4. CODEOWNERS Simplification

When CODEOWNERS is added, a single pattern covers the feature:

```
/.GITHUB-MODE/ @github-mode-team
/.github/workflows/github-mode-* @github-mode-team
```

Instead of five separate patterns.

### 5. Feature Flag Alignment

The `.GITHUB-MODE-ACTIVE.md` file is a feature flag. Having the feature's files consolidated under `.GITHUB-MODE/` makes the flag semantically obvious: the directory IS the feature, the flag controls whether it is active.

---

## Risks and Trade-offs

### Convention vs. Consolidation

Placing docs in `docs/`, scripts in `scripts/`, and tests in `test/` follows standard repo conventions. Moving them into `.GITHUB-MODE/` breaks this convention.

**Counterargument:** GitHub Mode is explicitly an _overlay_ — a feature that can be installed into and removed from an upstream repo. Overlay features benefit from self-containment over convention. The core project's `docs/`, `scripts/`, and `test/` directories should contain core project artifacts, not overlay-specific files.

### Dot-Directory Visibility

Directories starting with `.` can be less visible in some file browsers and `ls` output.

**Counterargument:** `.GITHUB-MODE/` uses all-caps naming specifically for visibility. `.github/`, `.vscode/`, and similar dot-directories are well-understood patterns. The leading dot signals "configuration/mode" rather than "source code," which is semantically correct.

### CI Workflow Path Filters

The workflow file's `paths:` filter would change. This is a one-time update.

### Test Discovery

Vitest must discover tests under `.GITHUB-MODE/test/`. The project's vitest config should be checked to ensure it does not exclude dot-directories. If it does, a one-line include pattern resolves this.

---

## Migration Path

### Phase 1: Move Documentation

Move `docs/github-mode/**` → `.GITHUB-MODE/docs/` and update internal links. Low risk — docs are not code.

### Phase 2: Move Scripts and Tests

Move `scripts/github-mode/**` → `.GITHUB-MODE/scripts/` and `test/github-mode/**` → `.GITHUB-MODE/test/`. Update import paths in tests, script paths in package.json and CI workflow.

### Phase 3: Move Runtime Contracts

Move `runtime/github-mode/**` → `.GITHUB-MODE/runtime/`. Update contract paths in validation script and CI.

### Phase 4: Consolidate Root Files

Move `.GITHUB-MODE-README.md` content into `.GITHUB-MODE/README.md`, move `.GITHUB-MODE-LICENCE.md` → `.GITHUB-MODE/LICENCE.md`, `.GITHUB-MODE-SECURITY.md` → `.GITHUB-MODE/SECURITY.md`, `.GITHUB-MODE.png` → `.GITHUB-MODE/assets/logo.png`.

### Phase 5: Update ADR and Guards

Update ADR 0001 owned-path definitions and `check-upstream-additions-only.ts` patterns to reflect the consolidated structure.

### Validation at Each Phase

- Run `pnpm contracts:github:validate` after each phase.
- Run `pnpm test -- .GITHUB-MODE/test/` (or equivalent) after scripts/tests move.
- Verify CI workflow triggers correctly on a test PR.

---

## Conclusion

GitHub Mode's own architecture documents — particularly ADR 0001 and the overlay-implementation analysis — already argue for clear ownership boundaries and additive-only installation. The current scatter across `docs/`, `runtime/`, `scripts/`, `test/`, and root-level files contradicts this principle. Consolidating under `.GITHUB-MODE/` with a clear subdirectory structure (`docs/`, `runtime/`, `scripts/`, `test/`, `assets/`) makes the feature self-describing, trivially installable/removable, and reduces owned-path complexity from 5 patterns to 2.

The only hard constraints keeping files outside are:

1. `.github/workflows/github-mode-contracts.yml` — GitHub platform requirement.
2. `package.json` script entry — one line, acts as a pointer.

Everything else can and should live under `.GITHUB-MODE/`.
