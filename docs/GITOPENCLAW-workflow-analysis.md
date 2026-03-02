# GITOPENCLAW Workflow Analysis

### Separating OpenClaw development workflows from the .GITOPENCLAW runtime environment

---

## Context

This repository (`github-openclaw`) serves a dual purpose:

1. **Development environment** — A fork of the OpenClaw source code, with full CI pipelines for building, testing, linting, and releasing the OpenClaw CLI, gateway, and platform apps (macOS, iOS, Android).

2. **Runtime environment** — The `.GITOPENCLAW/` directory contains a self-contained AI agent framework that runs inside GitHub Actions, triggered by issues and comments. It uses the OpenClaw runtime as a dependency (installed via `bun install` from `.GITOPENCLAW/package.json`) and does not depend on the surrounding OpenClaw source tree.

These two purposes have fundamentally different needs from GitHub Actions workflows. This document analyzes each workflow, determines whether it is needed for the `.GITOPENCLAW` runtime, and provides recommendations for a clean runtime-only configuration.

---

## Workflow Inventory

The repository contains 8 workflow files in `.github/workflows/`:

| # | Workflow File | Trigger | Purpose | Runtime Needed? |
|---|---|---|---|---|
| 1 | `GITOPENCLAW-WORKFLOW-AGENT.yml` | `issues`, `issue_comment` | Runs the `.GITOPENCLAW` agent | **Yes — this IS the runtime** |
| 2 | `ci.yml` | `push`, `pull_request` | Full CI: tests, lint, build, platform checks | **No** |
| 3 | `auto-response.yml` | `issues`, `issue_comment`, `pull_request_target` | Auto-closes/labels issues based on rules | **No — may interfere** |
| 4 | `docker-release.yml` | `push` (main + tags) | Builds and publishes Docker images | **No** |
| 5 | `install-smoke.yml` | `push`, `pull_request` | Smoke tests for installation | **No** |
| 6 | `labeler.yml` | `pull_request_target`, `issues` | Applies size/contributor labels | **No — may interfere** |
| 7 | `sandbox-common-smoke.yml` | `push`, `pull_request` (path-filtered) | Tests sandbox Docker images | **No** |
| 8 | `workflow-sanity.yml` | `push`, `pull_request` | Lints workflow YAML files | **Optional** |

---

## Detailed Analysis

### 1. GITOPENCLAW-WORKFLOW-AGENT.yml — THE RUNTIME WORKFLOW

**Status: Required — this is the core runtime**

This is the only workflow that matters for `.GITOPENCLAW` execution. It:

- Triggers on issue opens and issue comments
- Authorizes the actor (checks collaborator permission level)
- Checks out the default branch
- Sets up Bun and caches `.GITOPENCLAW/node_modules`
- Runs the lifecycle pipeline: Guard → Preflight → Indicator → Install → Agent
- Executes the agent with `ANTHROPIC_API_KEY` and `GITHUB_TOKEN`

**Key properties:**
- Completely self-contained — only touches `.GITOPENCLAW/` files
- Has its own dependency management (`bun install --frozen-lockfile` in `.GITOPENCLAW/`)
- Does not depend on the OpenClaw source tree (`src/`, `dist/`, etc.)
- Scoped commits only modify `.GITOPENCLAW/state/` — source code is read-only

**Recommendation:** Keep as-is. No changes needed.

---

### 2. ci.yml — DEVELOPMENT CI PIPELINE

**Status: Not needed for runtime**

This is an 821-line workflow that runs the full OpenClaw development CI:

- **Scope detection** (`docs-scope`, `changed-scope`) — Determines which expensive jobs to run based on changed files
- **Build artifacts** — Compiles `dist/` from TypeScript source
- **Tests** — Node and Bun test suites, protocol validation, Python skill tests
- **Lint/format** — `pnpm check` (Oxlint + Oxfmt + TypeScript type checking)
- **Platform tests** — Windows (tests + lint), macOS (TS tests + Swift build/test), Android (Gradle build/test)
- **Secrets scanning** — detect-secrets, private key detection, zizmor workflow audit
- **Release checks** — npm pack validation

**Why it is not needed for runtime:**
- The `.GITOPENCLAW` agent installs OpenClaw as a pre-built npm package (`openclaw ^2026.2.19` from `.GITOPENCLAW/package.json`). It does not compile from source.
- Tests, lint, and platform builds validate the OpenClaw source code, not the `.GITOPENCLAW` runtime.
- The scope detection (`changed-scope`) already treats `.GITOPENCLAW/` changes as docs-like (not triggering `run_node`, `run_macos`, etc.) because `.GITOPENCLAW/` paths are not listed in the Node/macOS/Android detection cases.

**Cost if kept enabled:**
- Every push to `main` and every PR triggers scope detection (lightweight) and potentially full CI (expensive: up to 45 min on Windows, macOS builds)
- GitHub Actions minutes consumed: ~15-60 min per push depending on scope

**Recommendation:** Disable for runtime-only use. Either:
- Add `.GITOPENCLAW/**` to `paths-ignore` in the trigger (though this only helps if ALL changes are in `.GITOPENCLAW/`)
- Set a top-level `if: false` condition to disable entirely
- Delete the file if the repository will never be used for OpenClaw development

---

### 3. auto-response.yml — AUTOMATED ISSUE/PR RESPONSES

**Status: Not needed — may actively interfere with the agent**

This workflow triggers on the same events as the `.GITOPENCLAW` agent (`issues: [opened]`, `issue_comment: [created]`) and performs automated actions:

- Closes issues with specific labels (`r: skill`, `r: support`, `r: testflight`, etc.)
- Detects spam-pinging of maintainers and posts warnings
- Auto-labels issues containing keywords like "security", "testflight", "moltbook"
- Closes PRs labeled `dirty` or `invalid`

**Interference risks:**
1. **Issue closure** — If someone opens an issue to talk to the `.GITOPENCLAW` agent and the issue text matches a keyword (e.g., mentions "support"), `auto-response.yml` may close the issue before the agent can respond.
2. **Label-triggered responses** — Labels applied by `auto-response.yml` could confuse the agent's trust-level logic or state tracking.
3. **Bot comment confusion** — Auto-response comments appear alongside agent comments, creating a confusing conversation thread.
4. **Race conditions** — Both workflows trigger on `issue_comment: [created]`. If a user comments on an issue, both the agent workflow and the auto-response workflow fire simultaneously.

**Recommendation:** Disable for runtime-only use. The `.GITOPENCLAW` agent has its own trust-level gating, slash command parsing, and response logic. The auto-response rules are designed for the upstream OpenClaw open-source project's community management, not for a `.GITOPENCLAW` deployment.

---

### 4. docker-release.yml — DOCKER IMAGE PUBLISHING

**Status: Not needed for runtime**

Builds and publishes multi-architecture Docker images to GitHub Container Registry. Triggers on pushes to `main` and version tags.

**Why it is not needed:**
- The `.GITOPENCLAW` agent runs directly in a GitHub Actions runner (Ubuntu), not in a Docker container.
- Docker images are for deploying the OpenClaw gateway as a service, which is an entirely different use case.
- Already has `paths-ignore` for `docs/**`, `**/*.md`, `.agents/**`, `skills/**` — but does NOT ignore `.GITOPENCLAW/**`, so pushes to `.GITOPENCLAW/` files could trigger unnecessary Docker builds.

**Recommendation:** Disable for runtime-only use. If kept, add `.GITOPENCLAW/**` to `paths-ignore`.

---

### 5. install-smoke.yml — INSTALLATION SMOKE TESTS

**Status: Not needed for runtime**

Tests the OpenClaw installation process:
- Builds the root `Dockerfile`
- Runs installer smoke tests (`pnpm test:install:smoke`)

**Why it is not needed:**
- The `.GITOPENCLAW` agent does not use the OpenClaw installer. It installs via `bun install` in `.GITOPENCLAW/`.
- Dockerfile builds and installer scripts are for end-user installation, not agent runtime.

**Recommendation:** Disable for runtime-only use.

---

### 6. labeler.yml — PR AND ISSUE LABELING

**Status: Not needed — may interfere with the agent**

Applies labels to PRs and issues:
- **PR size labels** (XS/S/M/L/XL) based on changed lines
- **Contributor labels** (maintainer, trusted-contributor, experienced-contributor) based on merge history
- **Path-based labels** via `.github/labeler.yml` (channel, app, feature labels)

**Interference risks:**
1. **Issue labeling** — Triggers on `issues: [opened]`, same as the agent. Applies contributor labels to issues, which could interact with the agent's trust-level system.
2. **PR labeling** — Triggers on `pull_request_target`, which the agent does not use. However, if the agent ever creates PRs, labeler could modify them.
3. **GitHub App token usage** — Uses a GitHub App token that may not be configured in a runtime-only deployment (requires `GH_APP_PRIVATE_KEY` secret).

**Recommendation:** Disable for runtime-only use. The labeling rules are specific to the upstream OpenClaw project's contribution workflow.

---

### 7. sandbox-common-smoke.yml — SANDBOX DOCKER TESTS

**Status: Not needed for runtime**

Tests the sandbox Docker image build. Only triggers on changes to `Dockerfile.sandbox`, `Dockerfile.sandbox-common`, and `scripts/sandbox-common-setup.sh`.

**Why it is not needed:**
- Path-filtered to sandbox-specific files. Will not trigger on `.GITOPENCLAW/` changes.
- Sandbox infrastructure is for OpenClaw's code execution environment, not the agent runtime.

**Recommendation:** Can be left in place (it will never trigger on `.GITOPENCLAW/` changes due to path filtering) or deleted for cleanliness.

---

### 8. workflow-sanity.yml — WORKFLOW FILE LINTING

**Status: Optional**

Validates workflow YAML files:
- **no-tabs** — Checks for tabs in `.yml`/`.yaml` files
- **actionlint** — Lints workflow syntax
- **Composite action input interpolation** — Checks for unsafe patterns

**Why it could be useful:**
- Validates `GITOPENCLAW-WORKFLOW-AGENT.yml` syntax when it is modified
- Catches YAML formatting issues before they cause runtime failures

**Why it may not be needed:**
- Triggers on every push and PR, adding CI time
- The tab check and actionlint are lightweight but still consume runner minutes
- The composite action check (`check-composite-action-input-interpolation.py`) requires pnpm/Node setup

**Recommendation:** Keep if workflow files are actively maintained. Disable if the repository is stable and workflow files rarely change.

---

## Recommendations Summary

### For a runtime-only deployment (just `.GITOPENCLAW` execution)

**Keep (1 workflow):**
| Workflow | Action |
|---|---|
| `GITOPENCLAW-WORKFLOW-AGENT.yml` | Keep as-is — this is the runtime |

**Disable (6 workflows):**
| Workflow | Method | Reason |
|---|---|---|
| `ci.yml` | Disable or delete | Development CI — not needed for runtime |
| `auto-response.yml` | Disable or delete | May interfere with agent conversations |
| `docker-release.yml` | Disable or delete | Docker publishing — not needed for runtime |
| `install-smoke.yml` | Disable or delete | Installation testing — not needed for runtime |
| `labeler.yml` | Disable or delete | PR/issue labeling — may interfere with agent |
| `sandbox-common-smoke.yml` | Disable or delete | Sandbox testing — never triggers on .GITOPENCLAW |

**Optional (1 workflow):**
| Workflow | Action |
|---|---|
| `workflow-sanity.yml` | Keep for YAML quality assurance, or disable to save runner minutes |

### How to disable workflows

There are three approaches, ranked from least to most destructive:

#### Approach 1: Add `if: false` to all jobs (reversible, preserves history)

```yaml
jobs:
  my-job:
    if: false  # Disabled for runtime-only deployment
    runs-on: ubuntu-latest
```

#### Approach 2: Move to a disabled directory (preserves files, stops execution)

```bash
mkdir -p .github/workflows-disabled
mv .github/workflows/ci.yml .github/workflows-disabled/ci.yml
```

GitHub Actions only executes workflows in `.github/workflows/`. Moving them out stops execution while preserving the files for future reference.

#### Approach 3: Delete the workflow files (clean but irreversible)

```bash
rm .github/workflows/ci.yml
rm .github/workflows/auto-response.yml
# etc.
```

**Recommended approach for this repository:** Approach 2 (move to `.github/workflows-disabled/`). This preserves the development workflows for reference while ensuring they do not consume GitHub Actions minutes or interfere with the `.GITOPENCLAW` agent runtime.

---

## Interaction Risks: Workflows That Could Interfere With the Agent

Two workflows deserve special attention because they trigger on the same events as the `.GITOPENCLAW` agent and could cause unexpected behavior:

### auto-response.yml + GITOPENCLAW-WORKFLOW-AGENT.yml

Both trigger on:
- `issues: [opened]`
- `issue_comment: [created]`

**Scenario:** A user opens an issue to interact with the `.GITOPENCLAW` agent. If the issue title contains "support", `auto-response.yml` posts a canned response and closes the issue. The agent's workflow also fires, but by the time it runs, the issue is closed. The agent may still post a reply to a closed issue, or it may error because the issue state changed underneath it.

**Mitigation:** Disable `auto-response.yml` in runtime-only deployments.

### labeler.yml + GITOPENCLAW-WORKFLOW-AGENT.yml

Both trigger on:
- `issues: [opened]`

**Scenario:** `labeler.yml` applies a contributor label to the issue. The `.GITOPENCLAW` agent's trust-level system reads issue metadata (including labels) to determine actor permissions. If the labeler adds a label that the agent does not expect (e.g., `maintainer`), it could affect trust gating.

**Mitigation:** Disable `labeler.yml` in runtime-only deployments, or ensure the agent's trust-level logic is label-agnostic. The risk is low if trust gating relies on GitHub API permission checks rather than labels, but eliminating the overlap is the safest approach.

---

## Cost Analysis

### Current cost (all workflows enabled)

Every push to `main` potentially triggers:
- `ci.yml` — 15-60 min across multiple runners (Ubuntu, Windows, macOS)
- `docker-release.yml` — 10-20 min (amd64 + arm64 builds)
- `install-smoke.yml` — 5-10 min (Docker build + smoke tests)
- `workflow-sanity.yml` — 2-5 min
- `sandbox-common-smoke.yml` — 2-5 min (only if sandbox files changed)

Every issue/comment triggers:
- `GITOPENCLAW-WORKFLOW-AGENT.yml` — up to 10 min (agent timeout)
- `auto-response.yml` — 1-2 min
- `labeler.yml` — 1-2 min (issues only)

**Total potential cost per push:** 34-100 minutes of GitHub Actions time

### Runtime-only cost (only GITOPENCLAW-WORKFLOW-AGENT.yml)

Every issue/comment triggers:
- `GITOPENCLAW-WORKFLOW-AGENT.yml` — up to 10 min

**Total cost per interaction:** up to 10 minutes

**Savings:** Eliminates 24-90+ minutes per push and 2-4 minutes per issue/comment from unnecessary workflows.

---

## Relationship to Existing Modification Documents

This analysis complements the existing `.GITOPENCLAW/docs/` documentation:

| Document | Scope | Relationship |
|---|---|---|
| `MINIMUM-REQUIRED-MASTER-MODIFICATIONS.md` | Source code path resolution | Analyzes which OpenClaw **source files** need changes for `.GITOPENCLAW` file isolation |
| `APPLIED-MASTER-MODIFICATIONS.md` | Applied source changes | Catalogs the **exact code changes** made to redirect file paths |
| **This document** | **Workflow analysis** | Analyzes which **GitHub Actions workflows** are needed for `.GITOPENCLAW` runtime vs. OpenClaw development |

Together, these three documents cover the complete separation between the OpenClaw development environment and the `.GITOPENCLAW` runtime:

1. **Source files** — Environment variable overrides redirect all file paths to `.GITOPENCLAW/state/` (zero modifications needed for correct operation; four files changed for improved UX)
2. **Workflows** — Only `GITOPENCLAW-WORKFLOW-AGENT.yml` is needed; the other 7 workflows are development-only and can be disabled

---

## Conclusion

The `.GITOPENCLAW` runtime requires exactly **one workflow**: `GITOPENCLAW-WORKFLOW-AGENT.yml`. This workflow is fully self-contained, installs its own dependencies, and only modifies files within `.GITOPENCLAW/state/`.

The remaining 7 workflows exist to serve OpenClaw source code development — CI testing, Docker publishing, PR labeling, installation smoke tests, and sandbox validation. None of these are required for the `.GITOPENCLAW` agent to function. Two of them (`auto-response.yml` and `labeler.yml`) share event triggers with the agent and could cause interference.

For a clean runtime-only deployment, move the 6 unnecessary workflows to `.github/workflows-disabled/` and optionally keep `workflow-sanity.yml` for YAML quality assurance. This eliminates unnecessary CI cost, prevents workflow interference, and makes the repository's purpose clear: a `.GITOPENCLAW` runtime environment.

---

_Last updated: 2026-03-02_
