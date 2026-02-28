# Source Code Copy: Embedding OpenClaw Modules Inside `.GITHUB-MODE/openclaw/`

**Date:** 2026-02-18

**Status:** Analysis snapshot

**Scope:** Identify which OpenClaw source modules GitHub Mode needs, how they would be copied into `.GITHUB-MODE/openclaw/` within the same repository, and what this structure enables for GitHub Mode's runtime plane.

**Related:** [Source-Code-Scrape.md](Source-Code-Scrape.md) — describes the same module extraction targeting a standalone separate repository. This document describes the in-repo variant.

## 1. Problem Statement

The current `.GITHUB-MODE` implementation is an **overlay** on the full OpenClaw repository. It references OpenClaw capabilities through runtime contracts and the plugin SDK but never imports from `src/` directly. The [Source Code Scrape](Source-Code-Scrape.md) analysis explored extracting modules into a standalone repository. This analysis asks a simpler question:

> If we **copied** the OpenClaw source modules GitHub Mode needs into `.GITHUB-MODE/openclaw/` — staying inside the same repository — what would that look like, and what would it enable?

The motivations are:

1. **Self-contained overlay** — `.GITHUB-MODE/` already owns docs, runtime contracts, scripts, and tests. Adding a copy of the required source modules makes the overlay fully self-contained, including executable code.
2. **Direct import access** — GitHub Mode workflows and scripts can import from `.GITHUB-MODE/openclaw/` without depending on the full `src/` tree or the plugin SDK indirection layer.
3. **No separate repository** — Avoids the operational burden of maintaining a standalone repo, cross-repo sync workflows, and separate CI pipelines.
4. **Overlay install/uninstall preserved** — The copy lives inside `.GITHUB-MODE/`, so the overlay's additive-only contract (ADR 0001) is maintained. Deleting `.GITHUB-MODE/` still removes everything.
5. **GitHub Actions optimization** — Workflows that only need the copied modules can skip installing the full dependency tree and building all of `src/`.

## 2. Module Dependency Analysis

### 2.1 What GitHub Mode Actually Executes

From the parity matrix (`.GITHUB-MODE/runtime/parity-matrix.json`), GitHub Mode workflows fall into three execution categories:

| Category           | Workflows                                                                                                                      | OpenClaw dependency                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| **Native**         | build-test, policy-validation, drift-detection, security-scan                                                                  | None — pure GitHub Actions              |
| **Adapter**        | command, agent-run, route-simulation, eval, cost-check, bot-pr, promotions, incident-response, entity-bootstrap, collaboration | Requires OpenClaw runtime modules       |
| **Installed-only** | release-publish, channel-sessions, device-actions, local-tunnel                                                                | Not applicable — stays in full OpenClaw |

The **adapter** workflows are the copy target. They need OpenClaw's agent execution engine, configuration system, routing logic, and plugin infrastructure — but not channels, native apps, TUI, media pipelines, or device-specific code.

### 2.2 Required Modules (The Copy Set)

These `src/` modules would be copied into `.GITHUB-MODE/openclaw/`:

| Module             | Source path                      | Copy target                                    | Why needed                                                                             |
| ------------------ | -------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Agent runner**   | `src/agents/`                    | `.GITHUB-MODE/openclaw/agents/`                | Core execution engine — runs agent tasks, manages compaction, sandbox, tool invocation |
| **Configuration**  | `src/config/`                    | `.GITHUB-MODE/openclaw/config/`                | Loads, validates, and merges config; every module depends on it                        |
| **Plugin system**  | `src/plugins/`                   | `.GITHUB-MODE/openclaw/plugins/`               | Plugin loader, registry, manifest handling — GitHub Mode registers as a plugin         |
| **Plugin SDK**     | `src/plugin-sdk/`                | `.GITHUB-MODE/openclaw/plugin-sdk/`            | Stable API surface for extensions; the contract between core and GitHub Mode           |
| **Routing**        | `src/routing/`                   | `.GITHUB-MODE/openclaw/routing/`               | Agent route resolution — determines which agent handles a given session                |
| **Hooks**          | `src/hooks/`                     | `.GITHUB-MODE/openclaw/hooks/`                 | Internal event system; plugins wire into lifecycle events through hooks                |
| **Providers**      | `src/providers/`                 | `.GITHUB-MODE/openclaw/providers/`             | Model provider integrations (Anthropic, OpenAI, etc.) — agents need inference          |
| **Security**       | `src/security/`                  | `.GITHUB-MODE/openclaw/security/`              | Audit, tool policy validation, skill scanning — policy gates depend on these           |
| **Infrastructure** | `src/infra/` (subset)            | `.GITHUB-MODE/openclaw/infra/`                 | Networking utilities, file locking, environment handling, process management           |
| **Utilities**      | `src/utils/`                     | `.GITHUB-MODE/openclaw/utils/`                 | Shared helpers — delivery context, message normalization, timeouts                     |
| **Logging**        | `src/logging/`, `src/logger.ts`  | `.GITHUB-MODE/openclaw/logging/`, `logger.ts`  | Structured logging used across all modules                                             |
| **Sessions**       | `src/sessions/`                  | `.GITHUB-MODE/openclaw/sessions/`              | Session state management for agent conversations                                       |
| **Memory**         | `src/memory/`                    | `.GITHUB-MODE/openclaw/memory/`                | Conversation memory — agent runs need context history                                  |
| **Skills**         | `src/skills/`                    | `.GITHUB-MODE/openclaw/skills/`                | Skill loading and execution — agents invoke skills as tools                            |
| **Shared types**   | `src/types/`, `src/shared/`      | `.GITHUB-MODE/openclaw/types/`, `shared/`      | TypeScript declarations and shared interfaces                                          |
| **Entry/index**    | `src/index.ts`, `src/runtime.ts` | `.GITHUB-MODE/openclaw/index.ts`, `runtime.ts` | Module export surface and runtime bootstrap                                            |

### 2.3 Excluded Modules (Not Copied)

These modules are not needed by GitHub Mode and would **not** be copied:

| Module                      | Path                                                                                                                                | Why excluded                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **CLI**                     | `src/cli/`                                                                                                                          | GitHub Mode does not expose a terminal CLI; commands arrive via workflow dispatch          |
| **Gateway server**          | `src/gateway/`                                                                                                                      | WebSocket/HTTP server for local mode; GitHub Mode uses Actions as compute                  |
| **Channel implementations** | `src/telegram/`, `src/discord/`, `src/slack/`, `src/signal/`, `src/whatsapp/`, `src/imessage/`, `src/line/`, `src/irc/`, `src/web/` | Channel-specific adapters for local message delivery; not applicable on runners            |
| **Channel registry**        | `src/channels/`                                                                                                                     | Enumerates local channels; GitHub Mode routes through workflow events, not channel sockets |
| **TUI**                     | `src/tui/`, `src/terminal/`                                                                                                         | Terminal UI rendering; no terminal on CI runners                                           |
| **Media pipeline**          | `src/media-understanding/`, `src/link-understanding/`                                                                               | Content understanding for incoming media; not in scope                                     |
| **Text-to-speech**          | `src/tts/`                                                                                                                          | Audio generation; no audio output on runners                                               |
| **Browser**                 | `src/browser/`                                                                                                                      | Headless browser automation; out of scope for adapter workflows                            |
| **Canvas host**             | `src/canvas-host/`                                                                                                                  | A2UI canvas rendering; local-mode feature                                                  |
| **Daemon**                  | `src/daemon/`                                                                                                                       | Background process management for local installations                                      |
| **Pairing**                 | `src/pairing/`                                                                                                                      | Device pairing for mobile/desktop apps                                                     |
| **macOS**                   | `src/macos/`                                                                                                                        | macOS-specific integrations                                                                |
| **Docker setup**            | `src/docker-setup/`                                                                                                                 | Local Docker environment configuration                                                     |
| **Auto-reply**              | `src/auto-reply/`                                                                                                                   | Automatic message reply logic for always-on local channels                                 |
| **Polls/cron**              | `src/polls/`, `src/cron/`                                                                                                           | Polling and scheduled jobs for local runtime                                               |
| **Native apps**             | `apps/`                                                                                                                             | iOS, macOS, Android applications                                                           |
| **Most extensions**         | `extensions/` (except `extensions/github/`)                                                                                         | Channel-specific plugins; only the GitHub Mode extension is needed                         |

### 2.4 Infrastructure Subset

`src/infra/` is the largest utility module (~90 files). GitHub Mode needs only a subset:

**Include:**

- Environment loading and normalization (`env.ts`, `env-vars.ts`)
- File locking (`file-lock.ts`, `lockfile.ts`)
- JSON file I/O (`json-file.ts`)
- Process utilities (`process.ts`, `spawn.ts`)
- Port management (for local test execution)
- Path resolution (`paths.ts`, `home-dir.ts`)
- Format utilities (`format-time.ts`, `format-bytes.ts`)
- Version checking (`version.ts`)

**Exclude:**

- Bonjour/mDNS discovery
- SSH tunnel management
- TLS certificate handling
- Desktop notification integration
- Binary caching and execution
- Pairing tokens
- Telemetry/heartbeat (replaced by GitHub Actions telemetry)

## 3. Resulting Directory Structure

```
.GITHUB-MODE/
├── ACTIVE.md
├── LICENCE.md
├── README.md
├── SECURITY.md
├── assets/
│   └── logo.png
│
├── openclaw/                          # ← Copied OpenClaw modules
│   ├── .upstream-ref                  # Upstream commit SHA this copy tracks
│   ├── agents/                        # From src/agents/
│   ├── config/                        # From src/config/
│   ├── plugins/                       # From src/plugins/
│   ├── plugin-sdk/                    # From src/plugin-sdk/
│   ├── routing/                       # From src/routing/
│   ├── hooks/                         # From src/hooks/
│   ├── providers/                     # From src/providers/
│   ├── security/                      # From src/security/
│   ├── infra/                         # From src/infra/ (subset)
│   ├── utils/                         # From src/utils/
│   ├── logging/                       # From src/logging/
│   ├── sessions/                      # From src/sessions/
│   ├── memory/                        # From src/memory/
│   ├── skills/                        # From src/skills/
│   ├── shared/                        # From src/shared/
│   ├── types/                         # From src/types/
│   ├── logger.ts                      # From src/logger.ts
│   ├── index.ts                       # From src/index.ts
│   └── runtime.ts                     # From src/runtime.ts
│
├── docs/                              # Existing docs (unchanged)
│   ├── analysis/
│   ├── planning/
│   ├── adr/
│   └── security/
│
├── runtime/                           # Existing runtime contracts (unchanged)
│   ├── adapter-contracts.json
│   ├── command-policy.json
│   ├── parity-matrix.json
│   └── ...
│
├── scripts/                           # Existing scripts + new copy script
│   ├── validate-github-runtime-contracts.ts
│   ├── check-upstream-additions-only.ts
│   └── copy-openclaw-modules.sh       # ← NEW: runs the copy
│
└── test/                              # Existing tests (unchanged)
    ├── validate-github-runtime-contracts.test.ts
    └── check-upstream-additions-only.test.ts
```

The key difference from the Source-Code-Scrape structure: there is no separate repository. The copied modules live alongside the existing `.GITHUB-MODE/` artifacts within the same repo, and the full `src/` tree remains available above.

## 4. The Copy Script

A script at `.GITHUB-MODE/scripts/copy-openclaw-modules.sh` performs the copy. Unlike the Scrape approach (which creates a standalone repo), this script operates within the same repository:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Source and target are both within the same repository
REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC="$REPO_ROOT/src"
TARGET="$REPO_ROOT/.GITHUB-MODE/openclaw"

# Clean previous copy
rm -rf "$TARGET"
mkdir -p "$TARGET"

# Full-directory modules
MODULES=(
  agents config plugins plugin-sdk routing hooks
  providers security utils logging sessions memory
  skills shared types
)

for mod in "${MODULES[@]}"; do
  cp -r "$SRC/$mod" "$TARGET/$mod"
done

# Selective infra copy
mkdir -p "$TARGET/infra"
for f in env.ts env-vars.ts file-lock.ts lockfile.ts json-file.ts \
         process.ts spawn.ts paths.ts home-dir.ts format-time.ts \
         format-bytes.ts version.ts index.ts; do
  cp "$SRC/infra/$f" "$TARGET/infra/$f" 2>/dev/null || true
done

# Top-level entry files
cp "$SRC/index.ts" "$TARGET/"
cp "$SRC/runtime.ts" "$TARGET/"
cp "$SRC/logger.ts" "$TARGET/"

# Record the upstream ref this copy was made from
echo "openclaw/openclaw@$(git rev-parse HEAD)  # $(date -u +%Y-%m-%d)" \
  > "$TARGET/.upstream-ref"

echo "Copied OpenClaw modules to $TARGET"
echo "Upstream ref: $(cat "$TARGET/.upstream-ref")"
```

The script is intentionally simple — it is a file copy, not a build step. No import rewriting, no AST transforms, no dependency resolution. The copied TypeScript files are the same files that exist in `src/`.

## 5. How GitHub Mode Uses the Copied Modules

### 5.1 Direct Import

With modules copied to `.GITHUB-MODE/openclaw/`, GitHub Mode binding code and workflows can import directly:

```typescript
// .GITHUB-MODE/scripts/some-github-mode-tool.ts
import { runAgent } from "../openclaw/agents/index.js";
import { loadConfig } from "../openclaw/config/index.js";
import { resolveRoute } from "../openclaw/routing/index.js";
```

This replaces the contract-only interaction model. GitHub Mode code can call OpenClaw functions directly, with full TypeScript type checking against the copied sources.

### 5.2 Workflow Usage

GitHub Actions workflows can execute against the copied modules without building the full project:

```yaml
# .github/workflows/github-mode-agent-run.yml
jobs:
  agent-run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: |
          # Install only the dependencies the copied modules need
          cd .GITHUB-MODE
          npm install  # Uses a local package.json with minimal deps
      - run: |
          node --import tsx .GITHUB-MODE/scripts/run-agent.ts \
            --command "${{ github.event.inputs.command }}"
```

### 5.3 Isolated Testing

Tests under `.GITHUB-MODE/test/` can import from `.GITHUB-MODE/openclaw/` and run independently of the full project test suite:

```typescript
// .GITHUB-MODE/test/agent-integration.test.ts
import { describe, it, expect } from "vitest";
import { runAgent } from "../openclaw/agents/index.js";

describe("GitHub Mode agent integration", () => {
  it("executes a command via the copied agent runner", async () => {
    // Test against the copied modules
    const result = await runAgent({ command: "echo hello" });
    expect(result).toBeDefined();
  });
});
```

## 6. Sync Strategy

### 6.1 In-Repo Sync

Since source and copy live in the same repository, sync is simpler than the cross-repo approach in Source-Code-Scrape. Two sync models are possible:

**Manual sync (recommended for MVP):** A maintainer runs the copy script after relevant `src/` changes land on `main`:

```bash
.GITHUB-MODE/scripts/copy-openclaw-modules.sh
# Review diff, commit
```

**Automated sync via CI:** A workflow detects changes to the copy-set modules in `src/` and opens a PR to update `.GITHUB-MODE/openclaw/`:

```yaml
# .github/workflows/github-mode-sync-copy.yml
name: github-mode-sync-copy
on:
  push:
    branches: [main]
    paths:
      - "src/agents/**"
      - "src/config/**"
      - "src/plugins/**"
      - "src/plugin-sdk/**"
      - "src/routing/**"
      - "src/hooks/**"
      - "src/providers/**"
      - "src/security/**"
      - "src/infra/**"
      - "src/utils/**"
      - "src/logging/**"
      - "src/sessions/**"
      - "src/memory/**"
      - "src/skills/**"
      - "src/shared/**"
      - "src/types/**"
      - "src/index.ts"
      - "src/runtime.ts"
      - "src/logger.ts"

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bash .GITHUB-MODE/scripts/copy-openclaw-modules.sh
      - uses: peter-evans/create-pull-request@v6
        with:
          title: "chore(github-mode): sync openclaw module copy"
          branch: github-mode/sync-copy
          body: "Automated sync of `.GITHUB-MODE/openclaw/` from `src/`."
          add-paths: .GITHUB-MODE/openclaw/
```

### 6.2 Version Pinning

The `.GITHUB-MODE/openclaw/.upstream-ref` file records which commit the copy was made from:

```
openclaw/openclaw@a1b2c3d4  # 2026-02-18
```

This allows reviewers to verify exactly which version of the source code is present in the copy and diff against it.

### 6.3 Staleness Detection

A CI check can verify that `.GITHUB-MODE/openclaw/` is not stale relative to `src/`:

```bash
# Run the copy script to a temp location and compare
TEMP_COPY=$(mktemp -d)
# ... run copy to $TEMP_COPY ...
diff -rq .GITHUB-MODE/openclaw/ "$TEMP_COPY/" || echo "Copy is stale"
```

This provides a warning without blocking — the copy is allowed to trail behind `src/` as long as the staleness is intentional and documented.

## 7. Dependency Management

### 7.1 No Separate package.json Required (Simple Path)

In the simplest variant, the copied modules use the same `node_modules` as the root project. No additional dependency installation is needed — `pnpm install` at the repo root already provides everything.

This works because the copied `.ts` files have the same import specifiers as the originals in `src/`. When TypeScript resolves `import { z } from 'zod'`, it finds the package in the root `node_modules/` regardless of whether the importing file lives in `src/` or `.GITHUB-MODE/openclaw/`.

### 7.2 Minimal package.json (Optimized Path)

For optimized CI runs that skip the full project install, `.GITHUB-MODE/` can include a minimal `package.json` listing only the dependencies the copied modules require:

**Kept:**

- AI/LLM: `@anthropic-ai/sdk`, `openai`, `@aws-sdk/client-bedrock-runtime`
- Schema validation: `zod`, `@sinclair/typebox`
- Config: `yaml`, `dotenv`
- Infra: `proper-lockfile`, `fast-glob`
- Logging: `pino`
- GitHub: `@actions/core`, `@actions/artifact`, `@actions/github`, `@octokit/rest`

**Not needed:**

- Messaging SDKs: `grammy`, `@slack/bolt`, `discord.js`, `whatsapp-web.js`
- Native addons: `node-pty`, platform binaries
- Media: `sharp`, `ffmpeg`, `pdfjs-dist`
- Desktop: `electron`, Sparkle, Bonjour
- TUI: `@clack/prompts`, `ink`, terminal rendering

Estimated dependency reduction: **60-70%** of `node_modules` size when using the minimal install path.

## 8. Relationship to the Overlay Contract

### 8.1 Owned-Path Compliance

The copy lives entirely within `.GITHUB-MODE/openclaw/`, which is inside the `.GITHUB-MODE/` owned-path boundary (ADR 0001). The `check-upstream-additions-only.ts` guard already permits all changes under `.GITHUB-MODE/**`. No guard updates are needed.

### 8.2 Install/Uninstall

The overlay install/uninstall story remains unchanged:

- **Install:** Copy `.GITHUB-MODE/` directory (now includes `openclaw/`) + workflow files.
- **Uninstall:** Delete `.GITHUB-MODE/` directory + workflow files. The copied modules are deleted with everything else.

### 8.3 Upstream Sync Freedom

The copy does not modify any file in `src/`. Upstream sync (`git pull upstream main`) remains conflict-free because `.GITHUB-MODE/openclaw/` does not exist upstream.

After an upstream sync that changes modules in `src/`, the copy may become stale. The staleness detection workflow (Section 6.3) flags this, and the copy script brings `.GITHUB-MODE/openclaw/` up to date.

## 9. Comparison: Copy vs. Scrape vs. Overlay

| Dimension                | Overlay (current)                                 | Copy (this doc)                                                   | Scrape (separate repo)                        |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| **Where code lives**     | `src/` only; GitHub Mode references via contracts | `src/` + `.GITHUB-MODE/openclaw/` (copy)                          | Separate repo with extracted `openclaw-core/` |
| **Import model**         | Contract/SDK only — no direct `src/` imports      | Direct imports from `.GITHUB-MODE/openclaw/`                      | Direct imports from `openclaw-core/`          |
| **Repository count**     | 1                                                 | 1                                                                 | 2                                             |
| **Sync mechanism**       | N/A (uses live `src/`)                            | In-repo copy script                                               | Cross-repo sync workflow                      |
| **Sync frequency**       | Continuous (always current)                       | On-demand or automated per push                                   | Periodic (weekly/manual)                      |
| **CI optimization**      | Must build/install full project                   | Can install minimal deps for `.GITHUB-MODE/` only                 | Minimal deps from standalone `package.json`   |
| **Overlay removability** | Delete `.GITHUB-MODE/`                            | Delete `.GITHUB-MODE/` (includes copy)                            | N/A (separate repo)                           |
| **Code duplication**     | None                                              | Yes — copied modules exist in `src/` and `.GITHUB-MODE/openclaw/` | Yes — across repositories                     |
| **Divergence risk**      | None                                              | Medium — copy can drift from `src/`                               | High — separate repo can diverge              |
| **New binding code**     | None needed                                       | Optional — can import directly                                    | Required (~840 LOC)                           |
| **Repo size impact**     | None                                              | Moderate — ~16 modules duplicated                                 | None (separate repo)                          |

## 10. Trade-offs

### 10.1 Benefits

| Benefit                        | Explanation                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Self-contained overlay**     | `.GITHUB-MODE/` contains everything GitHub Mode needs — docs, contracts, scripts, tests, AND executable source code       |
| **No separate repo**           | Avoids cross-repo sync tooling, separate CI pipelines, separate issue trackers, and split contribution workflows          |
| **Direct type checking**       | GitHub Mode scripts can import from `.GITHUB-MODE/openclaw/` with full TypeScript types — no SDK indirection              |
| **Faster CI (optional)**       | Workflows that need only the copied modules can use a minimal dependency install, skipping channel SDKs and native addons |
| **Simple copy mechanism**      | A shell script copies files — no AST transforms, no import rewriting, no build step                                       |
| **Overlay contract preserved** | The copy lives within `.GITHUB-MODE/`, maintaining the additive-only, conflict-free overlay architecture                  |
| **Gradual adoption**           | Can start with a few modules and expand the copy set as GitHub Mode matures                                               |

### 10.2 Costs

| Cost                           | Explanation                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code duplication**           | The same TypeScript files exist in two locations within the same repo. Repo size increases proportionally.                                                |
| **Staleness risk**             | The copy can fall behind `src/`. Without automated sync, stale code can cause subtle bugs.                                                                |
| **Confusion for contributors** | Two copies of the same code can cause confusion about which to edit. Clear documentation and CI guards are needed.                                        |
| **Import path divergence**     | Imports within copied modules reference sibling modules at relative paths. If module internal import paths change in `src/`, the copy script must re-run. |
| **Test duplication**           | Colocated `*.test.ts` files are copied with their modules. Deciding which tests to run and where becomes a governance question.                           |
| **Git history fragmentation**  | Changes to a module show up twice in `git log` — once in `src/` and once in `.GITHUB-MODE/openclaw/` — making blame and history harder to follow.         |

### 10.3 When This Approach Is Preferable

The **copy** approach is better than the **overlay** when:

- GitHub Mode needs to execute OpenClaw code directly, not just reference it through contracts.
- The team wants direct import access for type safety and IDE navigation.
- A separate repository (scrape approach) is too much operational overhead.

The **copy** approach is better than the **scrape** when:

- The team prefers a single repository.
- Cross-repo sync and separate CI are not justified yet.
- GitHub Mode is still evolving and needs tight coupling to upstream changes.
- Contributors work on both `src/` and GitHub Mode in the same PRs.

The **overlay** (current approach) remains better when:

- GitHub Mode does not need to execute OpenClaw internals — only validate contracts and run workflows.
- Minimizing duplication is a priority.
- The plugin SDK provides sufficient runtime access.

## 11. Mitigation Strategies for Key Risks

### 11.1 Preventing Edits to the Copy

The copy is a **read-only derivative** of `src/`. To enforce this:

1. **CI guard**: A check verifies that `.GITHUB-MODE/openclaw/` matches the output of the copy script. Any manual edit to the copy that does not match `src/` is flagged.
2. **Documentation**: A `README.md` inside `.GITHUB-MODE/openclaw/` states clearly: "This directory is auto-generated. Do not edit. Run `.GITHUB-MODE/scripts/copy-openclaw-modules.sh` to update."
3. **CODEOWNERS**: The `.GITHUB-MODE/openclaw/` path can require approval from the same owners as `src/`, ensuring copy updates are reviewed.

### 11.2 Managing Repo Size

The 16 copied modules add approximately 2–5 MB of TypeScript source (no `node_modules`, no build artifacts). For perspective:

- The copied `*.test.ts` files can optionally be excluded to reduce the footprint (tests stay in `src/` and run from there).
- Binary files and generated artifacts within copied modules can be `.gitignore`-ed.
- The copy is source code only — no `node_modules`, no `dist/`, no compiled output.

### 11.3 Handling Import Path Differences

The copied modules contain relative imports that reference each other (e.g., `agents/` imports from `config/`, `infra/`, `utils/`). Because the copy preserves the same directory structure relative to the modules, these internal imports resolve correctly without modification.

The only import paths that may need attention are:

- Absolute imports referencing `src/` prefixes (rare in the codebase; most imports are relative or package-level).
- Imports referencing excluded modules (e.g., `src/telegram/`). These must be stubbed or guarded with conditional imports.

## 12. Copy Process

### 12.1 Initial Copy

```bash
# From the repo root
bash .GITHUB-MODE/scripts/copy-openclaw-modules.sh
```

### 12.2 Verification

After copying, verify the modules are usable:

```bash
# Type-check the copied modules
npx tsc --noEmit --project .GITHUB-MODE/tsconfig.json

# Run any GitHub Mode-specific tests
pnpm test -- .GITHUB-MODE/test/
```

### 12.3 Ongoing Maintenance

1. When `src/` modules in the copy set change, re-run the copy script.
2. Review the diff to ensure no breaking changes affect GitHub Mode.
3. Commit the updated copy alongside the `src/` change or as a follow-up PR.

## 13. Conclusion

Copying OpenClaw source modules into `.GITHUB-MODE/openclaw/` is a pragmatic middle ground between the pure overlay (no code access) and the standalone scrape (separate repository). It gives GitHub Mode direct import access to the ~16 modules it needs while preserving the overlay's single-directory ownership model, conflict-free upstream sync, and clean install/uninstall semantics.

The approach trades code duplication within the repo for operational simplicity — no separate repository, no cross-repo sync, no separate CI pipeline. The primary risk is staleness, mitigated by automated sync detection and a simple copy script that can be re-run at any time.

For teams that want GitHub Mode to be more than a contract validator — able to directly invoke OpenClaw's agent runner, config system, and routing logic — but are not ready for the operational overhead of a separate repository, the in-repo copy provides a clear, minimal, and reversible path forward.
