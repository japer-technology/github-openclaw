# Source Code Pull: Building GitClaw as a Subtractive Fork of OpenClaw

**Date:** 2026-02-18

**Status:** Analysis snapshot

**Scope:** Define how to create and maintain "GitClaw" — the smallest possible repository derived from OpenClaw that contains only the files required for GitHub Mode operation — using a subtractive fork kept in sync via `git pull` from upstream.

**Related:**

- [Source-Code-Copy.md](Source-Code-Copy.md) — copies needed modules into `.GITHUB-MODE/openclaw/` within the same repository (additive, in-repo duplication).
- [Source-Code-Scrape.md](Source-Code-Scrape.md) — extracts needed modules into a new standalone repository (additive, cross-repo extraction).
- This document describes the **subtractive** variant: fork the full repo, delete what is not needed, keep pulling from upstream.

## 1. Problem Statement

Both the Copy and Scrape approaches start from an **empty target** and ask "what do we need to add?" This is inherently fragile: it requires exhaustive dependency analysis, risks missing transitive imports, and produces code that has been relocated from its original paths — meaning import rewrites, new build configurations, and test harness reconstruction.

This analysis inverts the question:

> If we **forked** OpenClaw and **removed** everything GitHub Mode does not need, what would the resulting "GitClaw" repository look like, and how would it stay in sync with upstream?

The motivations are:

1. **Working from day one** — A fork with deletions is a subset of a working codebase. Every retained file already has correct import paths, valid build configuration, and passing tests. Nothing is relocated.
2. **No import rewriting** — Files stay at their original `src/` paths. Internal imports between retained modules resolve exactly as they do in the full OpenClaw repo. No AST transforms, no path aliases, no binding layers.
3. **Simpler dependency analysis** — Instead of enumerating every file GitHub Mode needs (and missing transitive edges), enumerate what it clearly does _not_ need. The exclusion set is smaller and easier to verify: if it builds and tests pass after deletion, the cut was safe.
4. **`git pull` as the sync mechanism** — The fork maintains a standard git upstream relationship. `git pull upstream main` brings in all upstream changes. A deletion pass after the pull removes any newly added files that fall outside the kept set. This is a well-understood git workflow, not a custom sync pipeline.
5. **Smallest possible repo** — Unlike Copy (which duplicates modules inside the same repo, increasing size) or Scrape (which requires authoring ~840 LOC of binding code), the Pull approach produces a repo that is strictly a subset of OpenClaw — no added files, no duplicated code, just fewer files.

## 2. The Subtractive Model

### 2.1 How It Works

```
Full OpenClaw repo
       │
       ▼
   git fork
       │
       ▼
  Run deletion script  ──▶  GitClaw repo (subset)
       │                         │
       │    ┌────────────────────┘
       ▼    ▼
  git pull upstream main
       │
       ▼
  Re-run deletion script  ──▶  GitClaw repo (updated subset)
```

The deletion script is the only custom tooling. It reads a **keep manifest** (list of paths to retain) and removes everything else. Because the kept files are never moved, the result is a valid, buildable, testable TypeScript project at every step.

### 2.2 Why Subtractive Beats Additive for This Use Case

| Concern                     | Additive (Copy/Scrape)                                                                   | Subtractive (Pull)                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Transitive dependencies** | Must trace every import chain; missing one breaks the build                              | Already resolved — the full codebase compiles; deletions that break the build are caught immediately |
| **Import paths**            | Must rewrite or relocate to match new directory structure                                | Unchanged — files stay at original paths                                                             |
| **Build configuration**     | Must create new `tsconfig.json`, `package.json`, Vitest config                           | Modify existing configs (remove entries, not create from scratch)                                    |
| **Tests**                   | Must migrate tests and fix import paths; some tests may not run without excluded modules | Tests for retained modules run as-is; tests for deleted modules are deleted with them                |
| **Initial effort**          | High — must identify, copy, wire up, and verify every needed module                      | Low — fork, delete, verify the build passes                                                          |
| **Ongoing sync**            | Custom sync script or cross-repo workflow                                                | Standard `git pull` + deletion re-run                                                                |

## 3. The Keep Manifest

The keep manifest (`.github-mode-keep`) is a line-delimited file listing glob patterns for everything GitClaw retains. Everything not matched is deleted.

```bash
# .github-mode-keep — paths retained in GitClaw
# Lines starting with # are comments. Patterns are relative to repo root.

# GitHub Mode overlay (the whole point)
.GITHUB-MODE/**

# GitHub workflows (GitHub Mode + shared CI)
.github/**

# Core runtime modules needed by adapter workflows
src/agents/**
src/config/**
src/plugins/**
src/plugin-sdk/**
src/routing/**
src/hooks/**
src/providers/**
src/security/**
src/infra/**
src/utils/**
src/logging/**
src/logger.ts
src/logging.ts
src/sessions/**
src/memory/**
src/skills/**
src/shared/**
src/types/**
src/index.ts
src/runtime.ts
src/entry.ts
src/globals.ts
src/extensionAPI.ts
src/version.ts
src/compat/**
src/markdown/**
src/process/**
src/node-host/**

# Test infrastructure
src/test-helpers/**
src/test-utils/**

# GitHub Mode extension
extensions/github/**

# Project root files
package.json
pnpm-lock.yaml
tsconfig.json
vitest.config.*
.gitignore
.npmrc
README.md
LICENCE*
LICENSE*
CHANGELOG.md
```

### 3.1 What Gets Deleted

Everything **not** in the keep manifest is removed. By referencing the exclusion lists from Source-Code-Copy.md §2.3 and Source-Code-Scrape.md §2.3, the deleted set includes:

| Deleted path                                                                                                            | Reason                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/cli/`                                                                                                              | GitHub Mode does not expose a terminal CLI                     |
| `src/gateway/`                                                                                                          | WebSocket/HTTP server for local mode                           |
| `src/telegram/`, `src/discord/`, `src/slack/`, `src/signal/`, `src/whatsapp/`, `src/imessage/`, `src/line/`, `src/web/` | Channel-specific adapters for local message delivery           |
| `src/channels/`                                                                                                         | Channel registry — GitHub Mode routes through workflow events  |
| `src/tui/`, `src/terminal/`                                                                                             | Terminal UI rendering — no terminal on CI runners              |
| `src/media-understanding/`, `src/link-understanding/`                                                                   | Content understanding for incoming media                       |
| `src/tts/`                                                                                                              | Audio generation — no audio output on runners                  |
| `src/browser/`                                                                                                          | Headless browser automation                                    |
| `src/canvas-host/`                                                                                                      | A2UI canvas rendering — local-mode feature                     |
| `src/daemon/`                                                                                                           | Background process management for local installations          |
| `src/pairing/`                                                                                                          | Device pairing for mobile/desktop apps                         |
| `src/macos/`                                                                                                            | macOS-specific integrations                                    |
| `src/docker-setup*`                                                                                                     | Local Docker environment configuration                         |
| `src/auto-reply/`                                                                                                       | Automatic message reply logic for local channels               |
| `src/polls*`, `src/cron/`                                                                                               | Polling and scheduled jobs for local runtime                   |
| `src/wizard/`                                                                                                           | Setup wizard for local installations                           |
| `apps/`                                                                                                                 | iOS, macOS, Android native applications                        |
| `extensions/` (except `extensions/github/`)                                                                             | Channel-specific plugins                                       |
| `docs/`                                                                                                                 | Full OpenClaw documentation (replaced by `.GITHUB-MODE/docs/`) |
| `scripts/` (most)                                                                                                       | Build/release scripts for full OpenClaw                        |

### 3.2 Why a Keep Manifest, Not an Exclude Manifest

An **exclude** manifest lists what to delete. A **keep** manifest lists what to retain. For GitClaw, the keep manifest is preferable because:

1. **Safety** — If upstream adds a new module that GitClaw needs, it will not be in the keep manifest and will be deleted on the next sync. This surfaces immediately as a build failure, which is the correct failure mode (loud, obvious, fixable by adding to the manifest). An exclude manifest would silently include new modules, potentially pulling in unwanted code.
2. **Smaller list** — GitClaw keeps ~16 core modules plus infrastructure. OpenClaw has ~48 source modules plus apps, extensions, docs, and scripts. The keep list is shorter.
3. **Readable intent** — The keep manifest is a positive declaration: "GitClaw is exactly these files." This is easier to audit than "GitClaw is everything except these files."

## 4. The Deletion Script

```bash
#!/usr/bin/env bash
set -euo pipefail

# gitclaw-trim.sh — Remove all files not in the keep manifest.
# Run after `git pull upstream main` to re-apply the GitClaw subset.

REPO_ROOT="$(git rev-parse --show-toplevel)"
MANIFEST="$REPO_ROOT/.github-mode-keep"

if [[ ! -f "$MANIFEST" ]]; then
  echo "ERROR: Keep manifest not found at $MANIFEST" >&2
  exit 1
fi

# Build a temporary file listing every tracked file
ALL_FILES=$(mktemp)
git -C "$REPO_ROOT" ls-files > "$ALL_FILES"

# Build a file listing all kept files by expanding manifest globs
KEPT_FILES=$(mktemp)
while IFS= read -r pattern; do
  # Skip comments and blank lines
  [[ "$pattern" =~ ^#.*$ || -z "$pattern" ]] && continue
  # Expand glob against tracked files
  git -C "$REPO_ROOT" ls-files "$pattern" >> "$KEPT_FILES" 2>/dev/null || true
done < "$MANIFEST"

# Sort and deduplicate
sort -u "$KEPT_FILES" -o "$KEPT_FILES"
sort -u "$ALL_FILES" -o "$ALL_FILES"

# Compute the set difference: files tracked but not kept
TO_DELETE=$(mktemp)
comm -23 "$ALL_FILES" "$KEPT_FILES" > "$TO_DELETE"

DELETE_COUNT=$(wc -l < "$TO_DELETE" | tr -d ' ')
KEEP_COUNT=$(wc -l < "$KEPT_FILES" | tr -d ' ')
TOTAL_COUNT=$(wc -l < "$ALL_FILES" | tr -d ' ')

echo "GitClaw trim: $TOTAL_COUNT tracked → $KEEP_COUNT kept, $DELETE_COUNT to delete"

if [[ "$DELETE_COUNT" -eq 0 ]]; then
  echo "Nothing to delete — GitClaw is already trimmed."
  rm -f "$ALL_FILES" "$KEPT_FILES" "$TO_DELETE"
  exit 0
fi

# Delete the files
xargs -d '\n' git -C "$REPO_ROOT" rm --quiet < "$TO_DELETE"

# Clean up empty directories
git -C "$REPO_ROOT" clean -fd --quiet 2>/dev/null || true

# Clean up temp files
rm -f "$ALL_FILES" "$KEPT_FILES" "$TO_DELETE"

echo "Deletion complete. Run 'git status' to review, then commit."
```

The script is idempotent: running it twice produces the same result. It operates only on git-tracked files, so untracked files (build artifacts, `node_modules`) are untouched.

## 5. Resulting Repository Structure

After the deletion script runs on a fresh fork:

```
gitclaw/
├── .GITHUB-MODE/                      # GitHub Mode overlay (complete)
│   ├── ACTIVE.md
│   ├── LICENCE.md
│   ├── README.md
│   ├── SECURITY.md
│   ├── assets/
│   ├── docs/
│   ├── runtime/
│   ├── scripts/
│   └── test/
│
├── .github/                           # Workflows
│   └── workflows/
│       └── github-mode-*.yml
│
├── src/                               # Retained modules (at original paths)
│   ├── agents/
│   ├── config/
│   ├── plugins/
│   ├── plugin-sdk/
│   ├── routing/
│   ├── hooks/
│   ├── providers/
│   ├── security/
│   ├── infra/                         # Full directory retained (simpler than subsetting)
│   ├── utils/
│   ├── logging/
│   ├── sessions/
│   ├── memory/
│   ├── skills/
│   ├── shared/
│   ├── types/
│   ├── compat/
│   ├── markdown/
│   ├── process/
│   ├── node-host/
│   ├── test-helpers/
│   ├── test-utils/
│   ├── index.ts
│   ├── runtime.ts
│   ├── entry.ts
│   ├── globals.ts
│   ├── extensionAPI.ts
│   ├── logger.ts
│   ├── logging.ts
│   └── version.ts
│
├── extensions/
│   └── github/                        # GitHub Mode extension plugin
│
├── .github-mode-keep                  # The keep manifest
├── package.json                       # Trimmed dependencies
├── pnpm-lock.yaml
├── tsconfig.json                      # Trimmed path references
├── vitest.config.*
└── README.md
```

Key observations:

- **`src/` path is preserved** — Every retained module is at its original path. `src/agents/` in GitClaw is byte-for-byte identical to `src/agents/` in OpenClaw at the same commit.
- **No `openclaw-core/` or `.GITHUB-MODE/openclaw/`** — Unlike Copy or Scrape, there is no relocated or renamed copy of the source. The code is the code, where it has always been.
- **`src/infra/` is kept in full** — The Copy and Scrape docs proposed subsetting `src/infra/` (keeping ~12 of ~90 files). The Pull approach keeps the full directory. The reasoning: infra files that are not imported cost only disk space and have no runtime effect. Keeping them avoids the risk of missing a transitive dependency and simplifies the manifest. If size optimization is needed later, specific infra files can be added to an exclude list.
- **`.github-mode-keep`** — The manifest lives at the repo root, making it visible and easy to audit.

## 6. Dependency Trimming

### 6.1 package.json Pruning

The deletion script handles source files. Dependencies in `package.json` need a separate trimming pass. A companion script scans the retained `src/` files for `import` and `require` statements, then removes any `package.json` dependency not referenced by the kept code:

```bash
#!/usr/bin/env bash
set -euo pipefail

# gitclaw-deps.sh — Remove unused dependencies from package.json.
# Run after gitclaw-trim.sh.

REPO_ROOT="$(git rev-parse --show-toplevel)"

# Collect all import specifiers from retained source files
IMPORTS=$(mktemp)
grep -rhoP "(?<=from ['\"])@?[a-z0-9][\w./-]*" "$REPO_ROOT/src/" \
  | grep -v '^\.' \
  | sed 's|/.*||; s|^@[^/]*/[^/]*|&|; s|^\(@[^/]*\/[^/]*\).*|\1|' \
  | sort -u > "$IMPORTS"

# For each dependency in package.json, check if it appears in imports
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$REPO_ROOT/package.json', 'utf8'));
  const used = new Set(fs.readFileSync('$IMPORTS', 'utf8').trim().split('\n'));
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies'];
  let removed = 0;
  for (const sec of sections) {
    if (!pkg[sec]) continue;
    for (const dep of Object.keys(pkg[sec])) {
      if (!used.has(dep)) {
        delete pkg[sec][dep];
        removed++;
      }
    }
  }
  fs.writeFileSync('$REPO_ROOT/package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('Removed ' + removed + ' unused dependencies');
"

rm -f "$IMPORTS"
```

### 6.2 Expected Dependency Reduction

Based on the module analysis from Source-Code-Scrape.md §6.3:

**Retained** (needed by kept modules):

- AI/LLM: `@anthropic-ai/sdk`, `openai`, `@aws-sdk/client-bedrock-runtime`
- Schema: `zod`, `@sinclair/typebox`
- Config: `yaml`, `dotenv`
- Infra: `proper-lockfile`, `fast-glob`
- Logging: `pino`
- GitHub: `@actions/core`, `@actions/artifact`, `@actions/github`, `@octokit/rest`

**Removed** (only imported by deleted modules):

- Messaging SDKs: `grammy`, `@slack/bolt`, `discord.js`, `whatsapp-web.js`
- Native addons: `node-pty`, platform binaries
- Media: `sharp`, `ffmpeg`, `pdfjs-dist`
- Desktop: `electron`, Sparkle, Bonjour
- TUI: `@clack/prompts`, `ink`, terminal rendering

Estimated `node_modules` reduction: **60–70%**, consistent with the Copy/Scrape estimates.

### 6.3 tsconfig.json Trimming

TypeScript path mappings and project references pointing to deleted modules should be removed. Since the deletion script already removed the source files, `pnpm tsgo` (the project's type checker) will report errors for any stale references, making this a straightforward fix-what-breaks pass.

## 7. Sync Workflow

### 7.1 Pulling from Upstream

```bash
# Standard git upstream sync
git remote add upstream https://github.com/openclaw/openclaw.git  # once
git fetch upstream
git merge upstream/main  # or rebase

# Re-apply the GitClaw trim
bash gitclaw-trim.sh

# Verify
pnpm install
pnpm tsgo
pnpm test
```

The `git merge upstream/main` will:

- **Auto-merge** changes to retained files (no conflicts — the files are unmodified from upstream).
- **Add** new files from upstream that are outside the keep manifest. The trim script removes them.
- **Conflict** only if upstream modifies a file that GitClaw has also modified (e.g., `package.json` after dependency trimming). These are standard merge conflicts resolved in the normal way.

### 7.2 Automated Sync via CI

```yaml
# .github/workflows/gitclaw-upstream-sync.yml
name: gitclaw-upstream-sync
on:
  schedule:
    - cron: "0 6 * * 1" # Weekly
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - run: |
          git remote add upstream https://github.com/openclaw/openclaw.git
          git fetch upstream
          git merge upstream/main --no-edit || {
            echo "::error::Merge conflict — manual resolution required"
            exit 1
          }

      - run: bash gitclaw-trim.sh

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      - run: pnpm install
      - run: pnpm tsgo
      - run: pnpm test

      - uses: peter-evans/create-pull-request@v6
        with:
          title: "chore: sync from upstream openclaw/openclaw"
          branch: sync/upstream
          body: |
            Automated sync from upstream `openclaw/openclaw`.
            Trim script re-applied. Build and tests passing.
```

### 7.3 Conflict Surface Analysis

The only files GitClaw modifies relative to upstream are:

| File             | GitClaw modification                  | Conflict likelihood                                    |
| ---------------- | ------------------------------------- | ------------------------------------------------------ |
| `package.json`   | Removed unused dependencies           | **Medium** — upstream dependency changes will conflict |
| `pnpm-lock.yaml` | Reflects trimmed deps                 | **Medium** — regenerate after merge                    |
| `tsconfig.json`  | Removed references to deleted modules | **Low** — upstream additions, not modifications        |
| `README.md`      | Replaced with GitClaw-specific README | **Low** — one-time replacement                         |
| `.gitignore`     | Possibly extended                     | **Low**                                                |

All retained `src/` files are **unmodified** from upstream. They have zero conflict surface. This is the core advantage of the subtractive approach: the code you keep is identical to upstream, so `git merge` handles it automatically.

## 8. Handling Broken Imports After Deletion

When the deletion script removes a module, any retained module that imports from the deleted module will fail to compile. This is the expected failure mode — it tells you that the deletion cut too deep.

### 8.1 Resolution Strategies

| Situation                                                 | Resolution                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Retained module has a hard import from deleted module** | The deleted module is actually needed — add it to the keep manifest        |
| **Retained module has an optional/conditional import**    | Guard the import with a try/catch or feature flag; stub the missing module |
| **Retained module re-exports a deleted module's types**   | Remove the re-export from the retained module's `index.ts`                 |
| **Test file imports from deleted module**                 | Delete the test (it tests functionality GitClaw does not include)          |

### 8.2 The Iterative Trim Loop

The first time the deletion script runs, expect an iterative process:

```
1. Run gitclaw-trim.sh          →  files deleted
2. Run pnpm install && pnpm tsgo →  compilation errors
3. Analyze errors:
   - Missing module X imported by retained module Y
   - Option A: Add X to keep manifest (it is actually needed)
   - Option B: Stub or remove the import (it is optional)
4. Re-run from step 1
5. Repeat until pnpm tsgo passes
6. Run pnpm test                 →  fix any test failures
7. Commit the keep manifest + any import stubs
```

This loop converges quickly because:

- TypeScript's static analysis catches every broken import.
- The compiler error messages name the exact file and import path.
- Each iteration either adds a module to the keep manifest or removes a non-essential import.

In practice, the Copy/Scrape analyses already identified the ~16 core modules that form the keep set. The iterative loop will likely confirm that set and possibly discover 2–3 additional small modules or utility files needed transitively.

## 9. Comparison: Pull vs. Copy vs. Scrape

| Dimension                | Copy (in-repo)                                                  | Scrape (standalone)                                     | Pull (subtractive fork)                                 |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| **Starting point**       | Empty `.GITHUB-MODE/openclaw/` — add files                      | Empty `github-mode-openclaw/` repo — add files          | Full OpenClaw fork — remove files                       |
| **File paths**           | Relocated to `.GITHUB-MODE/openclaw/`                           | Relocated to `openclaw-core/`                           | **Unchanged** — original `src/` paths                   |
| **Import rewriting**     | Not needed (same relative structure) but path prefix changes    | Required for cross-module and external references       | **Not needed** — imports are identical to upstream      |
| **Build config**         | New `tsconfig.json` under `.GITHUB-MODE/`                       | New `tsconfig.json`, `package.json`, `vitest.config.ts` | **Modified existing** — remove entries only             |
| **Code duplication**     | Yes — modules exist in both `src/` and `.GITHUB-MODE/openclaw/` | No duplication (separate repo)                          | **No duplication** — single copy of each file           |
| **New code required**    | None                                                            | ~840 LOC binding layer                                  | **None** — only a keep manifest + trim script (~80 LOC) |
| **Sync mechanism**       | In-repo copy script                                             | Cross-repo sync workflow                                | **`git pull upstream`** + trim re-run                   |
| **Sync complexity**      | Low (same repo, file copy)                                      | High (cross-repo, breaking change detection)            | **Low** (standard git merge + idempotent trim)          |
| **Repository count**     | 1 (same repo)                                                   | 2 (separate repos)                                      | **1** (fork of upstream)                                |
| **Git history**          | Lost for copied files                                           | Lost for extracted files                                | **Preserved** — full blame/log for retained files       |
| **Day-one buildability** | Requires wiring up build/test for copied modules                | Requires new build config + binding layer               | **Immediate** — fork builds as-is before any deletion   |
| **Divergence risk**      | Medium (copy drifts from src/)                                  | High (separate repo diverges)                           | **Low** (retained files are byte-identical to upstream) |
| **Repo size**            | Larger (duplication)                                            | Smaller (extracted only)                                | **Smaller** (deletion, no duplication)                  |

## 10. Trade-offs

### 10.1 Benefits

| Benefit                           | Explanation                                                                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zero relocation**               | Files stay at original paths — no import rewriting, no new directory structures, no binding layer                                                                                                                                   |
| **Preserved git history**         | `git blame`, `git log`, and bisect work on every retained file because it was never moved or copied                                                                                                                                 |
| **Compiler-verified correctness** | If `pnpm tsgo` passes after deletion, every import in the retained code resolves. The TypeScript compiler is the verification tool, not manual dependency tracing                                                                   |
| **Minimal custom tooling**        | One shell script (~80 LOC) + one manifest file. Compare to the Copy approach (copy script + sync workflow + staleness detection) or Scrape approach (extraction script + binding layer + sync workflow + breaking change detection) |
| **Standard git sync**             | `git pull upstream main` is a workflow every developer already knows. No custom sync pipelines or cross-repo automation                                                                                                             |
| **No code duplication**           | Unlike Copy (which duplicates modules in the same repo), every file exists exactly once                                                                                                                                             |
| **Immediate buildability**        | A fresh fork passes `pnpm install && pnpm build && pnpm test` before any trimming. Trimming only removes things — it cannot introduce new failures that the trim loop does not surface                                              |
| **Gradual trimming**              | Start conservative (keep more), trim further as confidence grows. Each deletion is independently verifiable                                                                                                                         |

### 10.2 Costs

| Cost                                 | Explanation                                                                                                                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`package.json` merge conflicts**   | Trimmed dependencies in `package.json` will conflict with upstream changes. This is the primary ongoing maintenance cost, but it is localized to one file                                                                          |
| **Deleted file re-addition on sync** | Every `git pull upstream main` may re-add files from upstream that are outside the keep manifest. The trim script handles this, but it must be run after every sync                                                                |
| **`src/infra/` bloat**               | Keeping `src/infra/` in full (to avoid subsetting complexity) retains ~70 files that GitHub Mode does not directly use. Cost is disk space only (~200 KB), not runtime impact                                                      |
| **Test suite gaps**                  | Tests for deleted modules are gone. Tests for retained modules that exercise cross-module integration with deleted modules will fail and must be removed or stubbed                                                                |
| **Not truly standalone**             | GitClaw is still structurally an OpenClaw repo — it has `src/`, `package.json`, and build config that assume the full project. A contributor unfamiliar with the trimming may be confused by the mix of present and absent modules |
| **Upstream path changes**            | If upstream renames or moves a retained module's directory, the keep manifest must be updated. This is rare but requires attention during sync                                                                                     |

### 10.3 When to Choose Each Approach

| Choose **Pull** when…                                | Choose **Copy** when…                                         | Choose **Scrape** when…                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| You want the smallest repo with no duplication       | GitHub Mode must stay in the same repo as full OpenClaw       | GitClaw must be independently deployable with its own CI/CD                  |
| Preserving git history matters                       | Overlay architecture (ADR 0001) is a hard constraint          | A separate team maintains GitHub Mode with its own release cadence           |
| You want standard `git pull` sync                    | Cross-repo sync is too much operational overhead              | Regulatory or compliance requirements demand a bounded, inventoried codebase |
| Minimal custom tooling is a priority                 | Direct import access is needed without a separate repo        | The binding layer's ~840 LOC is acceptable upfront cost                      |
| The fork is primarily consumed, not heavily modified | The team works on both `src/` and GitHub Mode in the same PRs |                                                                              |

## 11. Step-by-Step: Creating GitClaw

### 11.1 Initial Setup

```bash
# 1. Fork OpenClaw on GitHub (or clone directly)
gh repo fork openclaw/openclaw --clone --fork-name gitclaw
cd gitclaw

# 2. Verify the fork builds
pnpm install
pnpm build
pnpm test

# 3. Create the keep manifest
#    (Use the manifest from Section 3 of this document as a starting point)
cat > .github-mode-keep << 'MANIFEST'
.GITHUB-MODE/**
.github/**
src/agents/**
src/config/**
src/plugins/**
src/plugin-sdk/**
src/routing/**
src/hooks/**
src/providers/**
src/security/**
src/infra/**
src/utils/**
src/logging/**
src/logger.ts
src/logging.ts
src/sessions/**
src/memory/**
src/skills/**
src/shared/**
src/types/**
src/index.ts
src/runtime.ts
src/entry.ts
src/globals.ts
src/extensionAPI.ts
src/version.ts
src/compat/**
src/markdown/**
src/process/**
src/node-host/**
src/test-helpers/**
src/test-utils/**
extensions/github/**
package.json
pnpm-lock.yaml
tsconfig.json
vitest.config.*
.gitignore
.npmrc
README.md
LICENCE*
LICENSE*
CHANGELOG.md
.github-mode-keep
MANIFEST

# 4. Run the trim script
bash gitclaw-trim.sh

# 5. Verify the trimmed repo builds
pnpm install
pnpm tsgo      # Fix any broken imports
pnpm test      # Fix any broken tests

# 6. Iterate: adjust keep manifest, re-trim, re-verify
#    (See Section 8.2 for the iterative loop)

# 7. Trim unused dependencies
bash gitclaw-deps.sh
pnpm install   # Regenerate lockfile with fewer deps

# 8. Commit
git add -A
git commit -m "chore: initial GitClaw trim from OpenClaw"
```

### 11.2 Ongoing Sync

```bash
# Pull upstream changes
git fetch upstream
git merge upstream/main

# Re-trim (removes any newly added files outside the keep manifest)
bash gitclaw-trim.sh

# Verify
pnpm install
pnpm tsgo
pnpm test

# Commit
git add -A
git commit -m "chore: sync from upstream openclaw + re-trim"
```

### 11.3 Adding a New Module to the Keep Set

If a new OpenClaw module is needed (e.g., upstream adds `src/evaluations/` and GitHub Mode adapter workflows need it):

```bash
# 1. Add to the keep manifest
echo "src/evaluations/**" >> .github-mode-keep

# 2. Pull and re-trim (the module will now be retained)
git fetch upstream && git merge upstream/main
bash gitclaw-trim.sh

# 3. Verify
pnpm tsgo && pnpm test
```

## 12. Risk Mitigation

### 12.1 Preventing Accidental Modification of Retained Files

GitClaw should not modify retained `src/` files — they must stay byte-identical to upstream to ensure clean merges. A CI check enforces this:

```yaml
# .github/workflows/gitclaw-upstream-parity.yml
name: gitclaw-upstream-parity
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: |
          git remote add upstream https://github.com/openclaw/openclaw.git
          git fetch upstream main
          # Compare retained src/ files against upstream
          UPSTREAM_SHA=$(git rev-parse upstream/main)
          DIFF=$(git diff "$UPSTREAM_SHA" -- src/ | head -c 1000)
          if [[ -n "$DIFF" ]]; then
            echo "::error::Retained src/ files differ from upstream. GitClaw should not modify src/ — sync instead."
            echo "$DIFF"
            exit 1
          fi
```

### 12.2 Detecting Keep Manifest Staleness

If the keep manifest is outdated (does not include a module that retained code now depends on), the TypeScript compiler will fail. This is the correct and sufficient detection mechanism — no additional staleness check is needed.

### 12.3 Documenting the Fork Relationship

GitClaw's `README.md` should clearly state:

```markdown
# GitClaw

GitClaw is a minimal subset of [OpenClaw](https://github.com/openclaw/openclaw)
containing only the modules required for GitHub Mode operation.

- **Upstream**: openclaw/openclaw
- **Sync mechanism**: `git pull upstream main` + `gitclaw-trim.sh`
- **Keep manifest**: `.github-mode-keep`
- **Last synced**: See `git log --oneline -1 --grep="sync from upstream"`

Do not modify files under `src/` — they are kept byte-identical to upstream.
To update the retained module set, edit `.github-mode-keep`.
```

## 13. Conclusion

The Pull approach produces the smallest possible GitClaw repository by inverting the extraction model: instead of building up from nothing (Copy, Scrape), it pares down from a complete, working codebase. The result is a genuine subset of OpenClaw — every retained file is at its original path, with its original imports, and its original git history.

The custom tooling is minimal: a keep manifest (~40 lines of glob patterns) and a trim script (~80 lines of Bash). Sync is standard `git pull` plus a re-run of the trim script. There is no binding layer to author, no import rewriting to maintain, and no cross-repo synchronization pipeline to operate.

The primary trade-off is that GitClaw remains structurally an OpenClaw repository. It has `src/`, `package.json`, and build configuration that were designed for the full project. This is a feature, not a bug: it means the retained code compiles and tests pass without any modification, because the build system treats GitClaw as a (smaller) OpenClaw.

For teams that want a standalone, minimal, GitHub-Mode-only repository that tracks upstream with minimal operational overhead, the subtractive Pull approach offers the best ratio of simplicity to capability.
