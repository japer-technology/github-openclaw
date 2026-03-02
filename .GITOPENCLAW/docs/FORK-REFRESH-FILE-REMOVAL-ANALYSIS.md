# Fork-Refresh File Removal Analysis

### Deep analysis of files removable after each upstream master sync to accelerate GITOPENCLAW execution

---

## Executive Summary

This repository tracks **7,057 files** totaling **~54 MB** of working-tree content (28 MB packed in `.git`). Of those, GITOPENCLAW execution requires only **101 files** (~2.1 MB) — the `.GITOPENCLAW/` directory and active `.github/` workflows.

**The remaining ~6,953 files (~52 MB, 98.5% of the repo) are upstream OpenClaw source code that serves no purpose in this fork's execution-only context.** Removing them yields:

| Metric | Before | After | Savings |
|---|---|---|---|
| Tracked files | 7,057 | ~104 | **−6,953 files (98.5%)** |
| Working tree size | ~54 MB | ~2.1 MB | **−52 MB (96%)** |
| Git pack size | ~28 MB | ~3–5 MB (est.) | **−23–25 MB (~85%)** |
| `git clone --depth=1` time | ~8–12s | ~1–2s (est.) | **−7–10s per run** |
| `actions/checkout` step | ~15–30s | ~3–5s (est.) | **−12–25s per run** |

**Verdict: Yes, removing these files matters.** The current workflow uses `fetch-depth: 0` (full history), which downloads the entire Git pack on every issue/comment trigger. Even switching to `fetch-depth: 1` without any file removal would save time, but combining shallow clone with file removal cuts checkout time by ~85%. For a repo that triggers on every issue and comment, seconds per run add up to minutes per day.

---

## Methodology

### Definition of "Required for GITOPENCLAW Execution"

A file is required if it satisfies **any** of these conditions:

1. **Directly executed** by the GITOPENCLAW workflow (`GITOPENCLAW-WORKFLOW-AGENT.yml`) or its lifecycle scripts
2. **Referenced at runtime** by the `openclaw` CLI binary (installed from npm via `.GITOPENCLAW/package.json`)
3. **Required by GitHub** for repository functionality (`.gitignore`, `.gitattributes`, `LICENSE`)
4. **Required by active workflows** (`.github/workflows/*.yml`, `.github/ISSUE_TEMPLATE/*`)

The `openclaw` CLI is installed from **npm** (not from source), so the entire `src/`, `extensions/`, `apps/`, `docs/`, `vendor/`, `ui/`, `test/`, `skills/` directories are **not needed at runtime**.

### Measurement Approach

All sizes measured via `git ls-files <dir> | xargs du -sc` (tracks only committed content, excludes `.git` metadata). File counts via `git ls-files <dir> | wc -l`.

---

## Files Required to Keep

### Tier 1: GITOPENCLAW Core (MUST KEEP)

| Path | Size | Files | Purpose |
|---|---|---|---|
| `.GITOPENCLAW/` | 1,964 KB | 75 | Agent lifecycle, state, config, docs, tests |

This is the entire execution engine. Contains the lifecycle scripts (`GITOPENCLAW-AGENT.ts`, `GITOPENCLAW-ENABLED.ts`, `GITOPENCLAW-PREFLIGHT.ts`), configuration, state directory, and documentation.

### Tier 2: GitHub Configuration (MUST KEEP)

| Path | Size | Files | Purpose |
|---|---|---|---|
| `.github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml` | 4 KB | 1 | Main agent workflow |
| `.github/workflows/GITOPENCLAW-enforce-disabled.yml` | 4 KB | 1 | Prevents upstream files from reactivating |
| `.github/workflows/delete-workflow-runs.yml` | 4 KB | 1 | Housekeeping |
| `.github/ISSUE_TEMPLATE/*` (3 files) | 12 KB | 3 | Issue templates for GITOPENCLAW |
| `.github/instructions/copilot.instructions.md` | 4 KB | 1 | Copilot config |
| `.github/workflows-disabled/` | ~60 KB | 16 | Parked upstream workflows (needed by enforce workflow) |
| `.github/dependabot.yml` | 4 KB | 1 | Dependency monitoring (scope to Actions only) |
| `.github/actionlint.yaml` | 4 KB | 1 | Actions lint config |
| `.github/labeler.yml` | 4 KB | 1 | Label config (currently inactive) |
| `.github/actions/` | ~12 KB | 3 | Shared actions (used by disabled workflows; safe to keep) |

**Subtotal: ~164 KB, 26 files**

### Tier 3: Git Infrastructure (MUST KEEP)

| Path | Size | Files | Purpose |
|---|---|---|---|
| `.gitignore` | 4 KB | 1 | Prevents accidental commits of build artifacts |
| `.gitattributes` | 4 KB | 1 | Line ending normalization |
| `LICENSE` | 4 KB | 1 | MIT license — legally required |

**Subtotal: ~12 KB, 3 files**

### Total Required: ~2,140 KB (2.1 MB), 104 files

---

## Files Safe to Remove

### Category 1: Source Code — `src/`

| Metric | Value |
|---|---|
| **Size** | **3,560 KB (3.5 MB)** |
| **Files** | **3,965** |
| **% of repo files** | **56.2%** |

**Contents:** The entire TypeScript source of the OpenClaw CLI — gateway, agents, channels, commands, infra, media, routing, config, browser automation, memory, cron, etc.

**Justification for removal:** GITOPENCLAW installs `openclaw` from npm (`"openclaw": "^2026.2.19"` in `.GITOPENCLAW/package.json`). The source code is never compiled or executed from this repository. The `bun install` in the workflow fetches the pre-built package from the npm registry.

**Risk:** None. The lifecycle scripts reference `src/cli/program/command-registry.ts` only in code **comments** (documenting where the command list comes from). No runtime imports.

---

### Category 2: Documentation — `docs/`

| Metric | Value |
|---|---|
| **Size** | **15,116 KB (14.8 MB)** |
| **Files** | **710** |
| **% of repo files** | **10.1%** |

**Breakdown of largest components:**

| Subdirectory | Size | Description |
|---|---|---|
| `docs/assets/` + `docs/images/` | 8,632 KB (8.4 MB) | Screenshots, logos, showcase images |
| `docs/zh-CN/` | 2,524 KB (2.5 MB) | Chinese translation (auto-generated) |
| `docs/.i18n/zh-CN.tm.jsonl` | 564 KB | Translation memory |
| `docs/channels/`, `docs/gateway/`, etc. | ~3,400 KB | Mintlify documentation pages |

**Justification for removal:** These are the upstream product documentation served at `docs.openclaw.ai`. They are not referenced by any GITOPENCLAW workflow or script. Images alone account for 8.4 MB — over 15% of total repo size.

**Risk:** None. Documentation is hosted externally by the upstream project.

---

### Category 3: Extensions — `extensions/`

| Metric | Value |
|---|---|
| **Size** | **15,780 KB (15.4 MB)** |
| **Files** | **822** |
| **% of repo files** | **11.6%** |

**Largest components:**

| Extension | Size | Description |
|---|---|---|
| `extensions/diffs/` | 9,500 KB (9.3 MB) | Diff viewer — `viewer-runtime.js` alone is **9.4 MB** |
| `extensions/open-prose/` | 956 KB | Prose editing |
| `extensions/feishu/` | 660 KB | Feishu/Lark integration |
| `extensions/bluebubbles/` | 548 KB | BlueBubbles iMessage bridge |
| `extensions/msteams/` | 508 KB | Microsoft Teams |
| `extensions/voice-call/` | 504 KB | Voice call handling |
| `extensions/matrix/` | 500 KB | Matrix chat |
| All other extensions | ~2,604 KB | 37 additional extensions |

**Justification for removal:** Extensions are workspace packages compiled and loaded by the OpenClaw runtime. GITOPENCLAW installs the CLI from npm, not from source. The single file `extensions/diffs/assets/viewer-runtime.js` (9.4 MB) is the **largest file in the entire repository** — a bundled JavaScript runtime for diff viewing that has zero relevance to GitHub Actions execution.

**Risk:** None.

---

### Category 4: Native Applications — `apps/`

| Metric | Value |
|---|---|
| **Size** | **10,984 KB (10.7 MB)** |
| **Files** | **716** |
| **% of repo files** | **10.1%** |

**Breakdown:**

| App | Size | Files | Description |
|---|---|---|---|
| `apps/macos/` | 5,900 KB | ~200 | macOS menubar app (Swift, icons) |
| `apps/android/` | 2,500 KB | ~200 | Android app (Kotlin, Gradle, resources) |
| `apps/ios/` | 2,200 KB | ~200 | iOS app (Swift, Xcode, assets) |
| `apps/shared/` | 748 KB | ~100 | Shared Swift packages |

**Justification for removal:** Native app source code for iOS, Android, and macOS. Includes app icons (the `OpenClaw.icns` alone is 1.9 MB), Kotlin/Gradle build files, Swift/Xcode projects, and font assets. None are compiled or referenced by GITOPENCLAW.

**Risk:** None. These are compiled separately by the upstream project's release pipeline.

---

### Category 5: Vendor — `vendor/`

| Metric | Value |
|---|---|
| **Size** | **1,912 KB (1.9 MB)** |
| **Files** | **173** |

**Contents:** `vendor/a2ui/` — Angular-to-UI renderer with its own `package-lock.json` (480 KB).

**Justification for removal:** Third-party vendored code for Canvas UI rendering. Not used by GITOPENCLAW.

**Risk:** None.

---

### Category 6: Web UI — `ui/`

| Metric | Value |
|---|---|
| **Size** | **1,864 KB (1.8 MB)** |
| **Files** | **200** |

**Contents:** `ui/dashboard-next/` — Next.js web dashboard.

**Justification for removal:** Web UI source code. Not compiled or served by GITOPENCLAW.

**Risk:** None.

---

### Category 7: Top-Level Configuration & Misc Files

| File/Path | Size | Files | Justification |
|---|---|---|---|
| `CHANGELOG.md` | 460 KB | 1 | Upstream release history; not used by GITOPENCLAW |
| `.secrets.baseline` | 428 KB | 1 | detect-secrets fingerprints for upstream code |
| `pnpm-lock.yaml` | 396 KB | 1 | Root lockfile for upstream development (already gitignored but tracked) |
| `README.md` | 112 KB | 1 | Upstream product README |
| `appcast.xml` | 68 KB | 1 | Sparkle update feed for macOS app |
| `scripts/` | 836 KB | 131 | Build, release, packaging, and i18n scripts |
| `skills/` | 448 KB | 73 | AI skill definition files |
| `Swabble/` | 160 KB | 36 | Swift package (standalone library) |
| `test/` | 196 KB | 41 | Test fixtures and helpers |
| `assets/` | 1,288 KB | 14 | DMG background images, installer assets |
| `packages/` | 24 KB | 6 | Monorepo workspace packages |
| `changelog/` | 12 KB | 3 | Changelog fragments |
| `git-hooks/` | 4 KB | 1 | Pre-commit hook script |
| Remaining top-level config files | ~200 KB | ~35 | vitest configs, tsconfig, Docker files, fly.toml, etc. |
| `.agent/`, `.agents/`, `.pi/`, `.vscode/` | 72 KB | 13 | Agent configs, VS Code settings |

**Subtotal: ~4,700 KB (4.6 MB), ~360 files**

**Justification:** These are development, build, test, and release infrastructure files for the upstream OpenClaw project. None are invoked by GITOPENCLAW workflows. The three largest single files (`CHANGELOG.md`, `.secrets.baseline`, `pnpm-lock.yaml`) total 1.3 MB alone.

---

## Removal Impact Summary

| Category | Size | Files | % of Total Size |
|---|---|---|---|
| `extensions/` | 15,780 KB | 822 | 29.2% |
| `docs/` | 15,116 KB | 710 | 28.0% |
| `apps/` | 10,984 KB | 716 | 20.3% |
| `src/` | 3,560 KB | 3,965 | 6.6% |
| Top-level config & misc | 4,700 KB | 360 | 8.7% |
| `vendor/` | 1,912 KB | 173 | 3.5% |
| `ui/` | 1,864 KB | 200 | 3.5% |
| **Total Removable** | **~53,916 KB (~52.6 MB)** | **~6,953** | **~96%** |
| **Remaining (GITOPENCLAW)** | **~2,140 KB (~2.1 MB)** | **~104** | **~4%** |

### Single Largest Wins

| # | Target | Size Saved | Justification |
|---|---|---|---|
| 1 | `extensions/diffs/assets/viewer-runtime.js` | 9.4 MB | Single bundled JS file for diff viewing |
| 2 | `docs/assets/` + `docs/images/` | 8.4 MB | Screenshots and showcase images |
| 3 | `apps/` (all native apps) | 10.7 MB | iOS/Android/macOS app source |
| 4 | `docs/zh-CN/` | 2.5 MB | Auto-generated Chinese translations |
| 5 | `src/` | 3.5 MB | TypeScript source (installed from npm instead) |

Removing just these five targets saves **~34.5 MB** — 64% of the repo — and they have zero risk to GITOPENCLAW execution.

---

## Does Removing Enough Matter?

### Quantified Impact on Workflow Execution Time

The GITOPENCLAW workflow (`GITOPENCLAW-WORKFLOW-AGENT.yml`) currently uses:
```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0    # ← downloads full Git history
```

**Current behavior:** Every issue open or comment triggers a full clone with all history. The Git pack is 28 MB. With decompression and working-tree checkout of 7,057 files, the checkout step takes an estimated **15–30 seconds** depending on runner load.

**After removing 96% of files:**

| Approach | Estimated Checkout Time | Savings vs Current |
|---|---|---|
| Current (`fetch-depth: 0`, all files) | 15–30s | — |
| `fetch-depth: 1` only (no file removal) | 8–12s | ~50% |
| `fetch-depth: 1` + sparse checkout (`.GITOPENCLAW` + `.github`) | 2–4s | ~85% |
| `fetch-depth: 1` + files actually deleted from repo | 1–3s | **~90%** |

### Cost at Scale

| Triggers/Day | Seconds Saved/Run | Daily Savings | Monthly Savings |
|---|---|---|---|
| 5 | 15s | 75s | 37 min |
| 20 | 15s | 5 min | 2.5 hr |
| 50 | 15s | 12.5 min | 6.25 hr |
| 100 | 15s | 25 min | 12.5 hr |

Beyond raw time, fewer files means:
- **Faster `git status`** during the commit-and-push step
- **Smaller runner disk footprint** (matters for concurrent jobs)
- **Cleaner `actions/cache` behavior** (no irrelevant files in hash calculations)
- **Reduced Dependabot noise** (no `package.json` with 200+ deps to monitor)
- **Cleaner GitHub UI** (language breakdown, dependency graph, security alerts reflect actual usage)

### Verdict

**Yes, removing files matters.** The improvement is most significant when combined with `fetch-depth: 1` in the workflow. The combination of file removal + shallow clone reduces checkout overhead by ~90%, saving 12–25 seconds per workflow run. For a repo triggered by issue activity, this is meaningful.

---

## Implementation Approaches

### Approach A: Sparse Checkout in Workflow (No File Deletion)

**Pros:** Zero file changes to the repo; reversible; upstream syncs unaffected.
**Cons:** Full Git pack still downloaded; savings limited to working-tree checkout time.

```yaml
- name: Checkout
  uses: actions/checkout@v4
  with:
    sparse-checkout: |
      .GITOPENCLAW
      .github
    sparse-checkout-cone-mode: true
    fetch-depth: 1
```

**Estimated savings:** ~60–70% of checkout time. The Git pack must still be transferred, but only ~104 files are written to disk instead of 7,057.

### Approach B: Delete Files After Each Fork Refresh (Recommended)

**Pros:** Maximum savings; cleaner repo; reduced GitHub UI noise.
**Cons:** Requires a post-sync cleanup step; creates divergence from upstream.

This is the approach the user is asking about. After each `git fetch upstream && git merge upstream/main`:

1. Delete all removable directories and files
2. Commit the deletion
3. Push to the fork

**Automation script outline** (to run after each fork sync):

```bash
#!/usr/bin/env bash
# .GITOPENCLAW/install/post-fork-refresh.sh
# Run after syncing fork with upstream master to remove unnecessary files.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "=== GITOPENCLAW Post-Fork-Refresh Cleanup ==="

# ── Directories to remove (upstream-only, not needed for execution) ──────────
REMOVE_DIRS=(
  src
  apps
  docs
  extensions
  vendor
  ui
  skills
  Swabble
  scripts
  test
  packages
  assets
  changelog
  git-hooks
  patches
  .agent
  .agents
  .pi
  .vscode
)

# ── Top-level files to remove ────────────────────────────────────────────────
REMOVE_FILES=(
  CHANGELOG.md
  .secrets.baseline
  pnpm-lock.yaml
  README.md
  appcast.xml
  AGENTS.md
  CLAUDE.md
  SECURITY.md
  VISION.md
  CONTRIBUTING.md
  package.json
  setup-podman.sh
  docker-setup.sh
  docs.acp.md
  openclaw.mjs
  openclaw.podman.env
  pnpm-workspace.yaml
  render.yaml
  pyproject.toml
  tsconfig.json
  tsconfig.plugin-sdk.dts.json
  tsdown.config.ts
  fly.toml
  fly.private.toml
  docker-compose.yml
  Dockerfile
  Dockerfile.sandbox
  Dockerfile.sandbox-browser
  Dockerfile.sandbox-common
  .env.example
  .dockerignore
  .detect-secrets.cfg
  .mailmap
  .markdownlint-cli2.jsonc
  .npmrc
  .oxfmtrc.jsonc
  .oxlintrc.json
  .pre-commit-config.yaml
  .shellcheckrc
  .swiftformat
  .swiftlint.yml
  zizmor.yml
  vitest.config.ts
  vitest.unit.config.ts
  vitest.live.config.ts
  vitest.gateway.config.ts
  vitest.extensions.config.ts
  vitest.e2e.config.ts
)

# ── Files to KEEP ────────────────────────────────────────────────────────────
# .GITOPENCLAW/      — entire directory (agent core)
# .github/           — workflows, issue templates, actions
# .gitignore         — prevents accidental commits
# .gitattributes     — line ending normalization
# LICENSE            — legally required

removed_dirs=0
removed_files=0

for dir in "${REMOVE_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    git rm -rf --quiet "$dir" 2>/dev/null && ((removed_dirs++)) || true
  fi
done

for file in "${REMOVE_FILES[@]}"; do
  if [ -f "$file" ]; then
    git rm --quiet "$file" 2>/dev/null && ((removed_files++)) || true
  fi
done

echo "Removed $removed_dirs directories and $removed_files files."
echo ""
echo "Remaining tracked files:"
git ls-files | wc -l
echo ""
echo "Commit with: git commit -m 'chore: post-fork-refresh cleanup — remove upstream-only files'"
```

### Approach C: Combine Both (Maximum Performance)

Use sparse checkout in the workflow for immediate speed gains, **and** delete files after each fork refresh for long-term cleanliness. The sparse checkout acts as a safety net — even if a sync re-adds files, the workflow only checks out what it needs.

---

## Post-Refresh Workflow: Daily Fork Sync

The user plans to sync the fork with upstream daily. The recommended workflow:

```
1. git fetch upstream main
2. git merge upstream/main --no-edit
3. bash .GITOPENCLAW/install/post-fork-refresh.sh
4. git commit -m "chore: post-fork-refresh cleanup — remove upstream-only files"
5. git push origin main
```

This can be automated via a scheduled GitHub Actions workflow:

```yaml
name: Fork Sync + Cleanup
on:
  schedule:
    - cron: '0 6 * * *'    # Daily at 6 AM UTC
  workflow_dispatch: {}

jobs:
  sync-and-clean:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Sync upstream
        run: |
          git remote add upstream https://github.com/openclaw/openclaw.git || true
          git fetch upstream main
          git merge upstream/main --no-edit || {
            echo "::error::Merge conflict — manual resolution required"
            exit 1
          }

      - name: Cleanup upstream-only files
        run: bash .GITOPENCLAW/install/post-fork-refresh.sh

      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git diff --cached --quiet || git commit -m "chore: post-fork-refresh cleanup — remove upstream-only files"
          git push origin main
```

---

## What Changes Are Needed for OpenClaw to Still Run

**None.** The `openclaw` CLI is installed from npm, not from this repository's source. The lifecycle:

1. **Workflow triggers** → `GITOPENCLAW-WORKFLOW-AGENT.yml`
2. **Bun installs** `openclaw` from npm via `.GITOPENCLAW/package.json`
3. **Lifecycle scripts** in `.GITOPENCLAW/lifecycle/` orchestrate the agent
4. **State** is read/written in `.GITOPENCLAW/state/`
5. **Config** is in `.GITOPENCLAW/config/`

The `src/`, `extensions/`, `apps/`, and all other upstream directories are **never imported, compiled, or referenced** at runtime. The only connection is the npm package name in `.GITOPENCLAW/package.json` — and that pulls from the registry, not from local source.

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Fork sync re-adds deleted files | **High** (every sync) | Post-refresh script removes them again; `GITOPENCLAW-enforce-disabled.yml` handles `.github/` files specifically |
| Upstream adds new required file | **Very Low** | GITOPENCLAW depends on npm package, not source; monitor release notes |
| Merge conflicts during sync | **Low** | The deleted files are upstream-only; conflicts only arise if GITOPENCLAW modifies upstream files (which it avoids) |
| GitHub UI shows empty language stats | **Cosmetic** | `.GITOPENCLAW/` TypeScript files will be detected; add `.gitattributes` linguist overrides if needed |
| Dependabot fails on missing `package.json` | **Medium** | Reconfigure `dependabot.yml` to scope to `.github/workflows/` only (GitHub Actions ecosystem) |

---

## Recommendations

### Immediate (do now):

1. **Change `fetch-depth: 0` to `fetch-depth: 1`** in `GITOPENCLAW-WORKFLOW-AGENT.yml` — instant ~50% checkout speedup with zero risk
2. **Scope `dependabot.yml`** to `github-actions` ecosystem only — eliminates 35+ automated PRs/week

### Short-term (with next fork refresh):

3. **Run the post-fork-refresh cleanup script** to delete upstream-only files
4. **Add sparse-checkout** to the workflow as a belt-and-suspenders measure

### Ongoing (daily automation):

5. **Set up the scheduled sync workflow** to automate daily upstream sync + cleanup

---

## Relationship to Existing Documents

| Document | Scope | Relationship |
|---|---|---|
| [OPENCLAW-Files-That-Effect-Execution-Use-Of-Repo.md](OPENCLAW-Files-That-Effect-Execution-Use-Of-Repo.md) | Which files **affect** execution | Identifies risks; this document quantifies removal |
| [MINIMUM-REQUIRED-MASTER-MODIFICATIONS.md](MINIMUM-REQUIRED-MASTER-MODIFICATIONS.md) | Source code changes needed | Applies when running openclaw from source; irrelevant if installed from npm |
| [APPLIED-MASTER-MODIFICATIONS.md](APPLIED-MASTER-MODIFICATIONS.md) | Changes already applied | Lists modifications that would be lost on sync + delete (acceptable since openclaw runs from npm) |
| [GITOPENCLAW-workflow-analysis.md](GITOPENCLAW-workflow-analysis.md) | Workflow-level analysis | Covers `.github/` specifically; this document covers everything |
| **This document** | **Comprehensive file removal analysis** | Answers: what to delete, how much it saves, and whether it matters |

---

_Analysis performed: 2026-03-02_
_Repository snapshot: 7,057 tracked files, ~54 MB working tree, 28 MB Git pack_
