# OpenClaw Files That Affect Execution Use of the Repo

### A comprehensive audit of every upstream file outside `.GITOPENCLAW/` that impacts the execution-only use of this fork

---

## Context

This repository is a fork of [openclaw/openclaw](https://github.com/openclaw/openclaw). Its purpose is **execution only** — running the `.GITOPENCLAW` agent via GitHub Actions. It is not used for developing, building, testing, or releasing the OpenClaw product.

The fork carries the entire upstream source tree: ~7,000 files, ~85 MB (excluding `.git`). Of those, only **74 files** live in `.GITOPENCLAW/`. The remaining **6,980 files** are inherited from the upstream master. Most are inert. Some are not.

This document identifies every upstream file that **actively affects** the execution-only use of the repo — files that GitHub auto-detects, tools auto-process, CI runners download, or automated services act upon — and assesses their impact.

Previously analyzed: workflows and `.github/FUNDING.yml` (see [APPLIED-MASTER-MODIFICATIONS.md](APPLIED-MASTER-MODIFICATIONS.md) and [GITOPENCLAW-workflow-analysis.md](GITOPENCLAW-workflow-analysis.md)). This document covers **everything else**.

---

## How "Affects Execution" Is Defined

A file "affects execution" if it does any of the following in the context of this fork's execution-only use:

| Effect | Why It Matters |
|---|---|
| **Triggers automated GitHub behavior** | Creates PRs, sends notifications, assigns labels, or opens issues without human action |
| **Increases clone/checkout time** | Every GitHub Actions run starts with `git clone`; larger repos = slower starts |
| **Configures tool behavior that runs in CI** | Even if a tool isn't explicitly invoked, some tools auto-detect config files |
| **Displays misleading information in the GitHub UI** | Contributors, security reporters, or users see upstream content that doesn't apply |
| **Consumes GitHub Actions minutes** | Workflows or automated processes that run without providing value to `.GITOPENCLAW` |
| **Creates security exposure** | Files that contain secrets baselines, deployment credentials patterns, or API key templates |

---

## Category 1: Files That Trigger Automated GitHub Behavior

### 1.1 `.github/dependabot.yml` — Dependabot Version Updates

**Impact: 🔴 CRITICAL**

| Property | Value |
|---|---|
| **What it does** | Automatically creates PRs when dependencies have new versions |
| **Ecosystems monitored** | npm (root `/`), GitHub Actions, Swift (3 directories), Gradle (Android), Docker |
| **Schedule** | Daily for all ecosystems |
| **PR limit** | 10 npm + 5 Actions + 5 Swift×3 + 5 Gradle + 5 Docker = **up to 40 open PRs** |
| **Registry** | Configured with `NPM_NPMJS_TOKEN` secret for authenticated npm access |

**Why this is critical:** Dependabot monitors the **root** `package.json` with its 200+ dependencies, the Swift packages in `apps/macos/`, `apps/shared/MoltbotKit/`, and `Swabble/`, and the Android Gradle build in `apps/android/`. None of these are used by `.GITOPENCLAW`. Each PR Dependabot creates:

1. Consumes GitHub API quota
2. Sends email notifications to repo watchers
3. Triggers the `GITOPENCLAW-WORKFLOW-AGENT.yml` workflow if Dependabot opens issues (it doesn't by default, but issue-linked PRs can)
4. Clutters the PR list with irrelevant dependency bumps
5. May require the `NPM_NPMJS_TOKEN` secret to be configured and valid

**The `.GITOPENCLAW/` directory has its own `bun.lock` and `package.json`** — it does not use the root lockfile or any of the monitored ecosystems.

**Recommendation:** Disable entirely, or reduce to monitoring only `.github/workflows/` for Actions version updates (the only ecosystem `.GITOPENCLAW` actually uses).

---

### 1.2 `.github/labeler.yml` — PR Auto-Labeling

**Impact: 🟠 HIGH**

| Property | Value |
|---|---|
| **What it does** | Automatically applies labels to PRs based on which files changed |
| **Labels defined** | ~30 labels for channels (discord, telegram, slack, etc.), apps (android, ios, macos), domains (gateway, cli, agents), and extensions |
| **Trigger** | Runs via `.github/workflows-disabled/labeler.yml` — **currently disabled** |

**Current state:** The labeler **workflow** is disabled (moved to `workflows-disabled/`). However, the **config file** remains in its active location. If the labeler workflow is ever re-enabled (e.g., after a fork sync that restores it), all PRs will get upstream labels.

**Why it matters:** The label definitions are entirely about upstream OpenClaw development — channel names, extension paths, app directories. None are relevant to `.GITOPENCLAW`. If a `.GITOPENCLAW`-related PR touches the root `src/` directory (which it never should), it would get irrelevant channel labels.

**Recommendation:** Safe while the workflow is disabled. Consider moving to `workflows-disabled/` alongside the workflow, or adding `.GITOPENCLAW`-specific label rules.

---

### 1.3 `.github/actionlint.yaml` — Actions Lint Configuration

**Impact: 🟡 LOW**

| Property | Value |
|---|---|
| **What it does** | Configures `actionlint` to recognize custom CI runners (Blacksmith 8/16vCPU, Windows, ARM) |
| **Used by** | `.pre-commit-config.yaml` hook and disabled CI workflow |

**Why it matters:** `actionlint` is not invoked by any active workflow. But if a developer runs `pre-commit` locally, actionlint will lint all workflows (including `.GITOPENCLAW` ones) using upstream runner definitions. The Blacksmith runner types in this config don't match the `ubuntu-latest` runner used by `.GITOPENCLAW`.

**Recommendation:** Harmless in practice. No action needed.

---

### 1.4 `.github/instructions/copilot.instructions.md` — GitHub Copilot Context

**Impact: 🟡 LOW**

| Property | Value |
|---|---|
| **What it does** | Provides coding context to GitHub Copilot when editing files in this repo |
| **Content** | OpenClaw codebase patterns: TypeScript/ESM, pnpm, Oxlint, Vitest, anti-redundancy rules |

**Why it matters:** When anyone uses GitHub Copilot in this repo (including via Copilot-powered PR reviews), Copilot receives upstream coding instructions that are irrelevant to `.GITOPENCLAW`. Copilot may suggest pnpm commands, Oxlint patterns, or OpenClaw import conventions that don't apply.

**Recommendation:** Could be supplemented with `.GITOPENCLAW`-specific instructions or replaced entirely.

---

### 1.5 `.github/actions/` — Composite Actions (3 directories)

**Impact: 🟢 NONE (currently)**

| Action | Purpose | Used By |
|---|---|---|
| `detect-docs-changes` | Detects documentation file changes for conditional CI steps | Disabled CI |
| `setup-node-env` | Sets up Node.js + pnpm with caching | Disabled CI |
| `setup-pnpm-store-cache` | Configures pnpm store caching | Disabled CI |

These are only referenced by the disabled `ci.yml` workflow. They have zero runtime impact but add 3 files to the clone.

---

## Category 2: Files That Affect Clone and Checkout Performance

Every GitHub Actions run begins with `actions/checkout@v4` using `fetch-depth: 0` (full history). Larger repos = slower checkouts.

### 2.1 Bulk Source Directories

| Directory | Size | File Count (approx) | Used by `.GITOPENCLAW`? |
|---|---|---|---|
| `src/` | 32 MB | ~2,500 | No |
| `extensions/` | 16 MB | ~1,200 | No |
| `docs/` | 16 MB | ~800 | No |
| `apps/` | 12 MB | ~600 | No |
| `ui/` | 2 MB | ~100 | No |
| `vendor/` | 2 MB | ~100 | No (gitignored but partially tracked) |
| `skills/` | 704 KB | ~200 | No |
| `Swabble/` | 232 KB | ~50 | No |
| `scripts/` | 892 KB | ~100 | No |
| `test/` | 224 KB | ~50 | No |
| `packages/` | 44 KB | ~20 | No |
| `assets/` | 1.3 MB | ~10 | No |
| **Total** | **~83 MB** | **~5,730** | **None** |

**Impact: 🟠 HIGH (cumulative)**

The full checkout fetches ~85 MB of content (plus ~30 MB of `.git` history). Of that, `.GITOPENCLAW/` is ~2 MB. The remaining ~83 MB is upstream source that the agent never reads, never modifies, and never references.

**GitHub Actions checkout time impact:** On `ubuntu-latest`, a full-history checkout of this repo takes approximately 15-30 seconds. A `.GITOPENCLAW`-only repo would take 2-5 seconds. This adds ~10-25 seconds to every agent run.

**Recommendation:** Not individually actionable (deleting upstream source defeats the fork purpose). But worth noting: the fork model inherently carries this overhead. If checkout latency becomes an issue, consider `fetch-depth: 1` (shallow clone) in the workflow or `sparse-checkout` to fetch only `.GITOPENCLAW/`.

---

### 2.2 Large Individual Files

| File | Size | Purpose | Impact |
|---|---|---|---|
| `CHANGELOG.md` | 460 KB | OpenClaw version history | Cloned every run, never read |
| `.secrets.baseline` | 428 KB (13,104 lines) | detect-secrets known-secret baseline | Cloned every run, never used |
| `pnpm-lock.yaml` | 396 KB | Root dependency lockfile | Cloned every run, never installed |
| `README.md` | 112 KB | OpenClaw product README | Cloned every run, displayed on GitHub |
| `appcast.xml` | 68 KB | macOS Sparkle auto-update feed | Cloned every run, never read |
| `AGENTS.md` | 24 KB | AI agent instructions for OpenClaw devs | Auto-read by Copilot/Claude |
| `SECURITY.md` | 20 KB | OpenClaw security policy | Displayed by GitHub security features |

**Impact: 🟡 MODERATE (cumulative ~1.5 MB per run)**

None of these files are individually large enough to matter, but they collectively add ~1.5 MB of unnecessary content to every checkout. More importantly, some have behavioral side effects (covered below).

---

## Category 3: Files That Configure Tool Auto-Detection

These files are detected by tools automatically when they exist in the repository root, even if the tools are not explicitly invoked.

### 3.1 `package.json` (root) — npm/pnpm/Bun Package Manifest

**Impact: 🟠 HIGH**

| Property | Value |
|---|---|
| **Dependencies** | ~30 production + ~20 dev dependencies |
| **Heavy deps** | `@napi-rs/canvas`, `sharp`, `node-llama-cpp`, `playwright-core`, `sqlite-vec`, `better-sqlite3` |
| **Scripts** | 40+ scripts including `build`, `test`, `dev`, `check`, `release:*` |
| **pnpm config** | `onlyBuiltDependencies` allowlist for native modules |

**Why this is high impact:**

1. **Bun detection:** When `.GITOPENCLAW/lifecycle/GITOPENCLAW-AGENT.ts` runs `bun install` in `.GITOPENCLAW/`, Bun resolves the workspace hierarchy upward. If Bun finds the root `package.json` and `pnpm-workspace.yaml`, it may attempt to resolve workspace dependencies or hoist packages incorrectly. The `.GITOPENCLAW/` installer specifically `cd`s into `.GITOPENCLAW/` to avoid this, but the root `package.json` presence creates a potential resolution conflict.

2. **GitHub dependency graph:** GitHub automatically parses `package.json` to build the repository's dependency graph and Dependabot alerts. This means the repo's "Security" tab shows vulnerabilities for **upstream OpenClaw dependencies** (sharp, better-sqlite3, etc.) that `.GITOPENCLAW` never installs.

3. **npm audit surface:** Any `npm audit` or Dependabot security alert is based on root `package.json` dependencies, creating noise and false urgency.

**Recommendation:** Cannot easily be deleted (pnpm-workspace.yaml references it). But awareness is important: security alerts from GitHub's dependency graph apply to upstream deps, not `.GITOPENCLAW` deps.

---

### 3.2 `pnpm-lock.yaml` — pnpm Lockfile

**Impact: 🟡 MODERATE**

| Property | Value |
|---|---|
| **Size** | 396 KB |
| **Status** | Listed in `.gitignore` — **should not be tracked** |

**Wait — it's gitignored?** Yes. The root `.gitignore` contains `pnpm-lock.yaml`. But the file **still exists in the repo** (396 KB). This means it was committed before the gitignore rule was added, or the rule was added after the file was tracked. Git continues tracking already-committed files even after they're gitignored.

**Why it matters:** Every checkout downloads this 396 KB file. It serves no purpose in the fork since pnpm is never installed or invoked.

**Recommendation:** `git rm --cached pnpm-lock.yaml` to untrack it while keeping the gitignore rule.

---

### 3.3 `pnpm-workspace.yaml` — Monorepo Workspace Definition

**Impact: 🟡 MODERATE**

| Property | Value |
|---|---|
| **Workspaces** | Root (`.`), `ui`, `packages/*`, `extensions/*` |
| **Build deps** | Lists native modules: `@aspect-build/rules_ts`, `node-pty`, `matrix-sdk-crypto-nodejs`, `@aspect-build/rules_js` |

**Why it matters:** This file tells pnpm (and potentially Bun) that the repo is a monorepo with workspaces in `ui/`, `packages/`, and `extensions/`. If any package manager runs from the repo root, it will attempt to resolve all workspace packages.

**Recommendation:** Safe as long as `.GITOPENCLAW/` is not listed as a workspace (it is not).

---

### 3.4 `.npmrc` — npm/pnpm Configuration

**Impact: 🟢 LOW**

Contents: A single comment stating that the pnpm build-script allowlist lives in `package.json`. No registry overrides, no auth tokens.

**Recommendation:** Harmless. No action needed.

---

### 3.5 `.pre-commit-config.yaml` — Pre-Commit Hook Configuration

**Impact: 🟡 MODERATE**

| Property | Value |
|---|---|
| **Hooks** | 12 hooks: trailing whitespace, secret detection, shellcheck, actionlint, zizmor, ruff, pytest, pnpm audit, oxlint, oxfmt, swiftlint, swiftformat |
| **Activation** | Only runs if `pre-commit` (or `prek`) is installed locally |
| **CI trigger** | Not wired into any active GitHub Actions workflow |

**Why it matters:** If a contributor clones this fork and runs `prek install`, all 12 hooks activate — including pnpm audit (which needs `pnpm install` first), swiftlint/swiftformat (which need Swift toolchain), and oxlint/oxfmt (which need Node/pnpm). These are all upstream development hooks with no relevance to `.GITOPENCLAW`.

**Recommendation:** Safe for CI (not triggered). Misleading for local development. Consider adding a note in the `.GITOPENCLAW` README that pre-commit hooks are upstream artifacts.

---

### 3.6 `.detect-secrets.cfg` + `.secrets.baseline` — Secret Scanning

**Impact: 🟡 MODERATE**

| File | Size | Purpose |
|---|---|---|
| `.detect-secrets.cfg` | 1.2 KB | Config: exclusion patterns for known false positives |
| `.secrets.baseline` | 428 KB | Baseline: 13,104 lines of known-secret fingerprints |

**Why it matters:**

1. **`.secrets.baseline`** is the third-largest file in the repo (after CHANGELOG.md and pnpm-lock.yaml). It's downloaded on every checkout.
2. The baseline tracks secrets across the **entire upstream codebase** — API key patterns in test files, example configs, documentation. None of this is relevant to `.GITOPENCLAW`.
3. If `detect-secrets` is run (via pre-commit or manually), it scans the full repo against this baseline, which could flag `.GITOPENCLAW/` files as new secrets not in the baseline.

**Recommendation:** Not actively harmful in CI. Adds 428 KB clone overhead. Consider adding `.GITOPENCLAW/` to the exclusion list in `.detect-secrets.cfg` to prevent false positives if detect-secrets is ever run.

---

### 3.7 Linting and Formatting Configs

| File | Size | Tool | Scope | Impact |
|---|---|---|---|---|
| `.oxlintrc.json` | 1.1 KB | Oxlint (JS/TS linter) | `src/`, `test/` | 🟢 None — not invoked in CI |
| `.oxfmtrc.jsonc` | 544 B | Oxfmt (JS/TS formatter) | `src/`, `test/` | 🟢 None — not invoked in CI |
| `.swiftformat` | 1 KB | SwiftFormat | Swift sources | 🟢 None — no Swift in `.GITOPENCLAW/` |
| `.swiftlint.yml` | 2.8 KB | SwiftLint | Swift sources | 🟢 None — no Swift in `.GITOPENCLAW/` |
| `.shellcheckrc` | 743 B | ShellCheck | Shell scripts | 🟢 None — not invoked in CI |
| `.markdownlint-cli2.jsonc` | 975 B | markdownlint | Markdown files | 🟢 None — not invoked in CI |
| `pyproject.toml` | 193 B | Ruff + pytest | Python in `skills/` | 🟢 None — not invoked in CI |
| `zizmor.yml` | 524 B | Zizmor | GitHub Actions security | 🟢 None — not invoked in CI |

**Collectively:** These 8 files add ~8 KB and zero runtime impact. They are purely development tooling configs.

**Recommendation:** Harmless. Keep.

---

### 3.8 `tsconfig.json` + `tsdown.config.ts` + `vitest.*.config.ts` — Build/Test Configs

| File | Purpose | Impact |
|---|---|---|
| `tsconfig.json` | TypeScript compiler options | 🟢 None — not compiled in CI |
| `tsconfig.plugin-sdk.dts.json` | Plugin SDK type declarations | 🟢 None |
| `tsdown.config.ts` | Build tool config (8 entry points) | 🟢 None — not built in CI |
| `vitest.config.ts` | Test runner config | 🟢 None — not tested in CI |
| `vitest.e2e.config.ts` | E2E test config | 🟢 None |
| `vitest.extensions.config.ts` | Extensions test config | 🟢 None |
| `vitest.gateway.config.ts` | Gateway test config | 🟢 None |
| `vitest.live.config.ts` | Live test config | 🟢 None |
| `vitest.unit.config.ts` | Unit test config | 🟢 None |

**Recommendation:** Harmless. Keep.

---

## Category 4: Files That Affect GitHub UI and Repository Presentation

### 4.1 `README.md` — Repository Landing Page

**Impact: 🟠 HIGH (UX, not runtime)**

| Property | Value |
|---|---|
| **Size** | 112 KB |
| **Content** | Full OpenClaw product README with feature tables, provider lists, architecture diagrams, CLI usage, configuration reference |

**Why this matters:** The GitHub repository landing page shows the **upstream OpenClaw README**, not the `.GITOPENCLAW` README. Anyone visiting `github.com/japer-technology/github-openclaw` sees a full product page for OpenClaw with installation instructions (`npm install -g openclaw`), provider configuration guides, and CLI reference — none of which applies to the `.GITOPENCLAW` execution model.

The `.GITOPENCLAW/README.md` exists but is not visible unless someone navigates into the `.GITOPENCLAW/` directory.

**Recommendation:** Replace the root `README.md` with a brief redirect to `.GITOPENCLAW/README.md`, or customize it to explain this fork's purpose.

---

### 4.2 `SECURITY.md` — Security Policy

**Impact: 🟡 MODERATE (UX)**

| Property | Value |
|---|---|
| **Size** | 20 KB |
| **Content** | OpenClaw security policy: report to security@openclaw.ai, trust model, CVE process |

**Why this matters:** GitHub links to `SECURITY.md` from the repository's "Security" tab and vulnerability reporting flow. If someone discovers a security issue specific to `.GITOPENCLAW`, they will be directed to report it to OpenClaw's security team (security@openclaw.ai) — which is the wrong contact for fork-specific issues.

**Recommendation:** Add a `.GITOPENCLAW`-specific security policy section at the top, or create a separate security contact.

---

### 4.3 `CONTRIBUTING.md` — Contribution Guidelines

**Impact: 🟡 MODERATE (UX)**

| Property | Value |
|---|---|
| **Size** | 7.4 KB |
| **Content** | OpenClaw contributor guide: 13 maintainers listed, PR workflow, "lobster tank" culture |

**Why this matters:** GitHub auto-displays `CONTRIBUTING.md` to anyone who creates an issue or PR. New contributors to `.GITOPENCLAW` will see upstream OpenClaw contribution guidelines (including the list of upstream maintainers) that don't apply.

**Recommendation:** Replace or supplement with `.GITOPENCLAW`-specific contribution guidelines.

---

### 4.4 `AGENTS.md` / `CLAUDE.md` — AI Agent Instructions

**Impact: 🟡 MODERATE**

| Property | Value |
|---|---|
| **Size** | 24 KB |
| **Content** | Comprehensive OpenClaw development instructions for AI coding agents (Copilot, Claude) |
| **`CLAUDE.md`** | Symlink to `AGENTS.md` |

**Why this matters:** When AI coding agents (GitHub Copilot, Claude, Cursor, etc.) operate on this repo, they read `AGENTS.md`/`CLAUDE.md` as their primary instruction set. These instructions are entirely about upstream OpenClaw development: pnpm workflows, Oxlint rules, Swift/macOS builds, channel architecture, release processes.

If an AI agent is asked to work on `.GITOPENCLAW/` code, it will follow upstream OpenClaw patterns (e.g., suggesting `pnpm install` instead of `bun install`, or referencing `src/config/paths.ts` patterns that don't apply).

`.GITOPENCLAW/` has its own `AGENTS.md` inside its directory, but root-level `AGENTS.md` takes precedence for most AI tools.

**Recommendation:** This is the intended behavior for upstream sync scenarios. But be aware that AI agents will default to upstream patterns when editing `.GITOPENCLAW/` files.

---

### 4.5 `VISION.md` + `LICENSE` + `CHANGELOG.md`

| File | Size | Impact |
|---|---|---|
| `VISION.md` | 4.6 KB | 🟢 None — aspirational product doc |
| `LICENSE` | 1 KB | 🟢 Required — MIT license applies to fork |
| `CHANGELOG.md` | 460 KB | 🟢 Low — large file but purely informational; adds to clone time |

**Recommendation:** Keep `LICENSE`. Others are harmless.

---

## Category 5: Files That Affect Deployment and Infrastructure

### 5.1 `fly.toml` + `fly.private.toml` — Fly.io Deployment

**Impact: 🟡 MODERATE**

| Property | Value |
|---|---|
| **App name** | `openclaw` |
| **Config** | CPU/memory specs, port bindings, persistent volumes at `/data` |

**Why this matters:** If the `fly` CLI is ever run from this repo root (by a contributor or automation), it will attempt to deploy to the `openclaw` Fly.io app. This is unlikely but possible.

More importantly: `fly.private.toml` may contain (or template) private deployment settings. The name suggests it could contain sensitive values, though in this case it appears to be a template.

**Recommendation:** Safe if `fly` CLI is never invoked. Consider deleting or moving to `workflows-disabled/` equivalent.

---

### 5.2 `render.yaml` — Render.com Deployment

**Impact: 🟢 LOW**

Render.com auto-detects `render.yaml` in repos connected to Render. If this fork is not connected to Render, the file is inert.

**Recommendation:** Harmless if Render is not connected. Delete if you want to be safe.

---

### 5.3 `docker-compose.yml` + `Dockerfile` + `Dockerfile.sandbox*`

**Impact: 🟡 LOW**

| File | Purpose |
|---|---|
| `docker-compose.yml` | Two services: `openclaw-gateway` + `openclaw-cli` |
| `Dockerfile` | Main OpenClaw container image |
| `Dockerfile.sandbox` | Sandbox runtime image |
| `Dockerfile.sandbox-browser` | Browser-enabled sandbox image |
| `Dockerfile.sandbox-common` | Shared base for sandbox images |

**Why this matters:** GitHub Dependabot monitors Docker base images (configured in `dependabot.yml`). Each Dockerfile's `FROM` directive is checked weekly for updates, potentially generating PRs.

Also: `docker-compose.yml` is auto-detected by Docker Compose. If `docker compose up` is run from the repo root, it will attempt to start the OpenClaw gateway.

**Recommendation:** Safe in CI. Remove Docker ecosystem from `dependabot.yml` if not needed.

---

### 5.4 `docker-setup.sh` + `setup-podman.sh` + `openclaw.podman.env`

**Impact: 🟢 LOW**

Deployment scripts for Docker/Podman setup. Not executed by any active workflow. Purely reference material.

---

### 5.5 `openclaw.mjs` — Node.js Entry Point

**Impact: 🟢 LOW**

The main OpenClaw CLI entry point: imports `dist/entry.js`. Never invoked by `.GITOPENCLAW/` (which uses `bun` to run TypeScript directly).

---

### 5.6 `.env.example` — Environment Variable Template

**Impact: 🟢 LOW**

Template showing all configurable env vars (API keys, gateway tokens, channel tokens). Not read by any automation. Contains only placeholder values.

**Recommendation:** Harmless. No action needed.

---

## Category 6: Files That Affect Git Behavior

### 6.1 `.gitignore` — Git Ignore Rules

**Impact: 🟢 POSITIVE (beneficial)**

The root `.gitignore` has **explicit allowances for `.GITOPENCLAW`**:

```
bun.lock
bun.lockb
!.GITOPENCLAW/bun.lock
!.GITOPENCLAW/bun.lockb
```

This is intentional and correct: the root ignores all `bun.lock` files globally but whitelists the `.GITOPENCLAW/` lockfiles. Without these negation rules, `.GITOPENCLAW/bun.lock` would be ignored.

**Other rules:** The gitignore also ignores `node_modules/`, `dist/`, `.env`, coverage, and various build artifacts. None of these conflict with `.GITOPENCLAW/`.

The `.gitignore` does ignore `.agents/` and `.agent/` directories globally:
```
.agents/
.agents
.agent/
```
This means the upstream `.agents/maintainers.md` and `.agent/workflows/update_clawdbot.md` files, while present in the repo, are ignored for future additions.

**Recommendation:** Beneficial. No changes needed.

---

### 6.2 `.gitattributes` — Git Attributes

**Impact: 🟢 LOW**

```
* text=auto eol=lf
CLAUDE.md -text
src/gateway/server-methods/CLAUDE.md -text
```

Forces LF line endings (good for CI consistency) and marks two CLAUDE.md files as binary (prevents diff churn from symlink-vs-file ambiguity).

**Recommendation:** Beneficial. No changes needed.

---

### 6.3 `.mailmap` — Contributor Identity Mapping

**Impact: 🟢 NONE**

Maps 12 upstream contributors' email aliases to canonical identities. Only affects `git log` and `git shortlog` output.

---

## Category 7: IDE and Editor Configuration

### 7.1 `.vscode/` — VS Code Settings

**Impact: 🟢 LOW**

Recommends the `oxc-vscode` linter extension and configures format-on-save for TypeScript. Only affects developers using VS Code.

**Recommendation:** Harmless. Consider adding `.GITOPENCLAW`-specific VS Code settings if needed.

---

## Category 8: Security Scanning Configuration

### 8.1 `.secrets.baseline` — detect-secrets Known Secrets

**Impact: 🟡 MODERATE**

| Property | Value |
|---|---|
| **Size** | 428 KB (13,104 lines) |
| **Content** | Fingerprints of every known secret-like pattern across the entire upstream codebase |

**Why this matters:**
1. This is the **third-largest file** in the working tree. It's cloned on every run.
2. It catalogs secrets patterns across all of `src/`, `extensions/`, `docs/`, `apps/`, `test/` — areas `.GITOPENCLAW/` never touches.
3. If `.GITOPENCLAW/` adds files containing API key patterns (e.g., in test fixtures or docs), and detect-secrets is run, those patterns won't be in the baseline and will be flagged as new secrets.

**Recommendation:** Consider adding `.GITOPENCLAW/` patterns to the baseline, or adding `.GITOPENCLAW/` to the exclusion list in `.detect-secrets.cfg`.

---

### 8.2 `zizmor.yml` — GitHub Actions Security Audit

**Impact: 🟢 LOW**

Disables three overly-strict security checks (unpinned-uses, excessive-permissions, artipacked). This **benefits** `.GITOPENCLAW/` workflows — without these overrides, `zizmor` would flag the `GITOPENCLAW-WORKFLOW-AGENT.yml` for using `actions/checkout@v4` (unpinned) and having `contents: write` permissions.

**Recommendation:** Beneficial. Keep.

---

## Category 9: Application Source That Could Be Misidentified

### 9.1 `apps/` — Native Application Sources (iOS, Android, macOS)

**Impact: 🟡 LOW-MODERATE**

| App | Size | Files |
|---|---|---|
| `apps/android/` | ~5 MB | Kotlin, Gradle, resources, fonts |
| `apps/ios/` | ~4 MB | Swift, Xcode, assets |
| `apps/macos/` | ~2 MB | Swift, Xcode, icons |
| `apps/shared/` | ~1 MB | Shared Swift packages |

**Why this matters:** GitHub's dependency graph and security scanning analyze these directories:
- **Gradle** (Android): Dependabot monitors `apps/android/` for dependency updates
- **Swift Package Manager**: Dependabot monitors 3 Swift directories
- Security scanners identify the repo as a "Kotlin + Swift + TypeScript" project

This creates a skewed security and dependency profile for what is, in execution terms, a pure TypeScript/Bun project.

**Recommendation:** Remove from Dependabot monitoring at minimum.

---

### 9.2 `vendor/` Directory

**Impact: 🟢 LOW**

Contains `a2ui/` (Angular-to-UI renderer). Partially tracked despite `.gitignore` rules (similar to `pnpm-lock.yaml`). Includes its own `package-lock.json` and `pnpm-lock.yaml` files within subdirectories.

---

## Summary: Impact Matrix

### 🔴 Critical — Actively Harmful

| File | Issue | Action |
|---|---|---|
| `.github/dependabot.yml` | Creates up to 40 PRs/week for unused dependencies across 7 ecosystems | Disable or scope to Actions only |

### 🟠 High — Causes Overhead or Confusion

| File | Issue | Action |
|---|---|---|
| Root `package.json` | 200+ unused deps in GitHub dependency graph and security alerts | Awareness; cannot easily remove |
| Root `README.md` | Repo landing page shows upstream product, not `.GITOPENCLAW` | Replace or add redirect |
| Bulk source dirs (~83 MB) | Every checkout downloads 6,980 unused files | Consider sparse checkout in workflow |
| `.github/labeler.yml` | Would auto-label PRs with upstream labels if workflow restored | Move to `workflows-disabled/` |

### 🟡 Moderate — Minor Impact

| File | Issue | Action |
|---|---|---|
| `.secrets.baseline` (428 KB) | Large file downloaded every run; tracks upstream secrets only | Tolerate or untrack |
| `CHANGELOG.md` (460 KB) | Large file downloaded every run | Tolerate |
| `SECURITY.md` | Directs security reports to upstream, not fork | Add fork-specific contact |
| `CONTRIBUTING.md` | Shows upstream contributors and workflow | Replace for fork context |
| `AGENTS.md` / `CLAUDE.md` | AI agents follow upstream patterns instead of `.GITOPENCLAW` patterns | Awareness; `.GITOPENCLAW/AGENTS.md` partially overrides |
| `.pre-commit-config.yaml` | 12 hooks for upstream tooling; confusing if activated locally | Document as upstream artifact |
| `.detect-secrets.cfg` | Doesn't exclude `.GITOPENCLAW/` directory | Add exclusion |
| `fly.toml` / `fly.private.toml` | Could accidentally deploy to upstream Fly.io app | Delete or move |
| Docker files (5 files) | Monitored by Dependabot; could trigger if `docker compose` run | Remove Docker from Dependabot |

### 🟢 Low/None — Safe to Ignore

| Files | Notes |
|---|---|
| `.gitignore`, `.gitattributes` | Beneficial — include `.GITOPENCLAW` allowances |
| `zizmor.yml` | Beneficial — prevents false positive security flags on GITOPENCLAW workflows |
| `.npmrc`, `.mailmap`, `.vscode/` | Inert in CI |
| All linting/formatting configs | Not invoked by any active workflow |
| All build/test configs | Not invoked by any active workflow |
| `LICENSE` | Required |
| Deployment configs (render, podman) | Inert if services not connected |
| `.github/actions/` | Only used by disabled workflows |
| `openclaw.mjs` | Never invoked |

---

## Recommended Priority Actions

### Tier 1 — Immediate (Measurable Impact)

1. **Reconfigure `.github/dependabot.yml`**: Remove all ecosystems except `github-actions` (the only one `.GITOPENCLAW` actually uses). This eliminates up to ~35 automated PRs/week.

2. **Add `GITOPENCLAW-enforce-disabled.yml` coverage**: The enforce workflow currently monitors 6 files. Add `.github/labeler.yml` to the monitored paths so it gets auto-moved if restored by a fork sync.

### Tier 2 — Recommended (Cleaner Experience)

3. **Replace root `README.md`**: Point visitors to `.GITOPENCLAW/README.md` with a brief explanation of the fork's purpose.

4. **Untrack `pnpm-lock.yaml`**: Run `git rm --cached pnpm-lock.yaml` — it's already gitignored but still tracked, adding 396 KB per checkout.

5. **Add `.GITOPENCLAW/` to `.detect-secrets.cfg` exclusions**: Prevent false positives if detect-secrets is run.

6. **Consider `sparse-checkout` in the workflow**: Add to `GITOPENCLAW-WORKFLOW-AGENT.yml`:
   ```yaml
   - name: Checkout
     uses: actions/checkout@v4
     with:
       sparse-checkout: |
         .GITOPENCLAW
         .github
       fetch-depth: 1
   ```
   This would reduce checkout from ~85 MB / 30 seconds to ~2 MB / 3 seconds.

### Tier 3 — Optional (Polish)

7. **Supplement root `SECURITY.md`**: Add fork-specific security contact.
8. **Supplement root `CONTRIBUTING.md`**: Add `.GITOPENCLAW` contribution guidelines.
9. **Remove unused deployment configs**: `fly.toml`, `fly.private.toml`, `render.yaml` if these services are not used.

---

## Relationship to Existing Analysis Documents

| Document | Scope |
|---|---|
| [GITOPENCLAW-workflow-analysis.md](GITOPENCLAW-workflow-analysis.md) | Which GitHub Actions **workflows** are needed |
| [MINIMUM-REQUIRED-MASTER-MODIFICATIONS.md](MINIMUM-REQUIRED-MASTER-MODIFICATIONS.md) | Which OpenClaw **source files** need code changes |
| [APPLIED-MASTER-MODIFICATIONS.md](APPLIED-MASTER-MODIFICATIONS.md) | The **exact code changes** applied |
| [GITOPENCLAW-Other-Files.md](GITOPENCLAW-Other-Files.md) | Whether `.agents/` and `.agent/` files are required |
| [TO-BE-DEALT-WITH.md](TO-BE-DEALT-WITH.md) | Runtime diagnostic issues (`openclaw status`) |
| **This document** | Every upstream file that **affects execution-only use** |

---

_Last updated: 2026-03-02_
