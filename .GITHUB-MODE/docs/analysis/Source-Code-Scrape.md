# Source Code Scrape: Extracting OpenClaw Modules for a Standalone GitHub Mode Repository

**Date:** 2026-02-18

**Status:** Analysis snapshot

**Scope:** Identify which OpenClaw source modules a standalone GitHub Mode repository would need, how they would be extracted, and what binding code connects them to GitHub Mode's runtime plane.

## 1. Problem Statement

The current `.GITHUB-MODE` implementation is designed as an **overlay** on the full OpenClaw repository. It references OpenClaw capabilities through runtime contracts and the plugin SDK, but never imports from `src/` directly. This analysis asks a different question:

> If we created a **new, standalone repository** that contained only the OpenClaw source code GitHub Mode actually needs — plus the GitHub Mode binding layer — what would that repository look like?

The motivations are:

1. **Minimal footprint** — A fork carrying 48 source modules, 35 extensions, and native apps for iOS/macOS/Android when GitHub Mode uses a fraction of that surface is unnecessary weight.
2. **Faster CI** — A smaller dependency tree means faster installs, builds, and test runs on GitHub Actions runners.
3. **Clearer ownership** — A dedicated repo makes the boundary between "code we consume" and "code we author" explicit in the file tree, not just in policy documents.
4. **Independent release cadence** — GitHub Mode contracts and workflows can evolve without waiting for or being blocked by OpenClaw core releases.

## 2. Module Dependency Analysis

### 2.1 What GitHub Mode Actually Executes

From the parity matrix (`.GITHUB-MODE/runtime/parity-matrix.json`), GitHub Mode workflows fall into three execution categories:

| Category           | Workflows                                                                                                                      | OpenClaw dependency                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| **Native**         | build-test, policy-validation, drift-detection, security-scan                                                                  | None — pure GitHub Actions              |
| **Adapter**        | command, agent-run, route-simulation, eval, cost-check, bot-pr, promotions, incident-response, entity-bootstrap, collaboration | Requires OpenClaw runtime modules       |
| **Installed-only** | release-publish, channel-sessions, device-actions, local-tunnel                                                                | Not applicable — stays in full OpenClaw |

The **native** workflows need zero OpenClaw source code. They validate JSON schemas, run policy checks, and produce artifacts using standard CI tooling.

The **adapter** workflows are the extraction target. They need OpenClaw's agent execution engine, configuration system, routing logic, and plugin infrastructure — but not channels, native apps, TUI, media pipelines, or device-specific code.

### 2.2 Required Modules (The Scrape Set)

These `src/` modules would be copied into the standalone repository:

| Module             | Path                             | Why needed                                                                             |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------------- |
| **Agent runner**   | `src/agents/`                    | Core execution engine — runs agent tasks, manages compaction, sandbox, tool invocation |
| **Configuration**  | `src/config/`                    | Loads, validates, and merges config; every module depends on it                        |
| **Plugin system**  | `src/plugins/`                   | Plugin loader, registry, manifest handling — GitHub Mode registers as a plugin         |
| **Plugin SDK**     | `src/plugin-sdk/`                | Stable API surface for extensions; the contract between core and GitHub Mode           |
| **Routing**        | `src/routing/`                   | Agent route resolution — determines which agent handles a given session                |
| **Hooks**          | `src/hooks/`                     | Internal event system; plugins wire into lifecycle events through hooks                |
| **Providers**      | `src/providers/`                 | Model provider integrations (Anthropic, OpenAI, etc.) — agents need inference          |
| **Security**       | `src/security/`                  | Audit, tool policy validation, skill scanning — policy gates depend on these           |
| **Infrastructure** | `src/infra/` (subset)            | Networking utilities, file locking, environment handling, process management           |
| **Utilities**      | `src/utils/`                     | Shared helpers — delivery context, message normalization, timeouts                     |
| **Logging**        | `src/logging/`, `src/logger.ts`  | Structured logging used across all modules                                             |
| **Sessions**       | `src/sessions/`                  | Session state management for agent conversations                                       |
| **Memory**         | `src/memory/`                    | Conversation memory — agent runs need context history                                  |
| **Skills**         | `src/skills/`                    | Skill loading and execution — agents invoke skills as tools                            |
| **Shared types**   | `src/types/`, `src/shared/`      | TypeScript declarations and shared interfaces                                          |
| **Entry/index**    | `src/index.ts`, `src/runtime.ts` | Module export surface and runtime bootstrap                                            |

### 2.3 Excluded Modules (Left Behind)

These modules are not needed by GitHub Mode and would **not** be copied:

| Module                      | Path                                                                                                                                | Why excluded                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **CLI**                     | `src/cli/`                                                                                                                          | GitHub Mode does not expose a terminal CLI; commands arrive via workflow dispatch          |
| **Gateway server**          | `src/gateway/`                                                                                                                      | WebSocket/HTTP server for local mode; GitHub Mode uses Actions as compute                  |
| **Channel implementations** | `src/telegram/`, `src/discord/`, `src/slack/`, `src/signal/`, `src/whatsapp/`, `src/imessage/`, `src/line/`, `src/irc/`, `src/web/` | Channel-specific adapters for local message delivery; not applicable on runners            |
| **Channel registry**        | `src/channels/`                                                                                                                     | Enumerates local channels; GitHub Mode routes through workflow events, not channel sockets |
| **TUI**                     | `src/tui/`, `src/terminal/`                                                                                                         | Terminal UI rendering; no terminal on CI runners                                           |
| **Media pipeline**          | `src/media-understanding/`, `src/link-understanding/`                                                                               | Content understanding for incoming media; not in MVP scope                                 |
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

## 3. Standalone Repository Structure

```
github-mode-openclaw/
├── .GITHUB-MODE/              # ← Copied from overlay
│   ├── ACTIVE.md
│   ├── runtime/               # Contracts, schemas, policies
│   ├── docs/                  # All planning and analysis docs
│   ├── scripts/               # Validation and CI scripts
│   └── test/                  # Contract validation tests
│
├── .github/
│   └── workflows/
│       └── github-mode-*.yml  # ← CI/CD workflows
│
├── openclaw-core/             # ← Extracted OpenClaw modules
│   ├── agents/
│   ├── config/
│   ├── plugins/
│   ├── plugin-sdk/
│   ├── routing/
│   ├── hooks/
│   ├── providers/
│   ├── security/
│   ├── infra/                 # Subset only
│   ├── utils/
│   ├── logging/
│   ├── sessions/
│   ├── memory/
│   ├── skills/
│   ├── shared/
│   ├── types/
│   └── index.ts               # Re-export surface
│
├── extensions/
│   └── github/                # ← GitHub Mode extension plugin
│       ├── package.json
│       ├── openclaw.plugin.json
│       └── src/
│           ├── adapter.ts     # GitHub Actions adapter
│           ├── dispatcher.ts  # Workflow dispatch handler
│           ├── state.ts       # Ephemeral state hydration
│           └── policy.ts      # Policy gate enforcement
│
├── binding/                   # ← NEW: Binding layer
│   ├── github-runner.ts       # Runner lifecycle (hydrate → execute → upload)
│   ├── workflow-bridge.ts     # Maps workflow_dispatch events to agent commands
│   ├── artifact-io.ts         # Checkpoint read/write via Actions artifacts
│   ├── secret-resolver.ts     # Maps GitHub Secrets/OIDC to provider credentials
│   ├── pr-bot.ts              # Creates/updates PRs from agent output
│   └── index.ts
│
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## 4. The Binding Layer

The binding layer is the new code that connects extracted OpenClaw modules to GitHub's runtime plane. It does not exist in the current OpenClaw repository and would be authored specifically for this standalone repo.

### 4.1 github-runner.ts — Runner Lifecycle

Manages the lifecycle of an agent execution within a GitHub Actions job:

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐    ┌─────────────┐
│  Hydrate     │───▶│  Configure   │───▶│  Execute      │───▶│  Upload     │
│  (artifacts) │    │  (secrets)   │    │  (agent run)  │    │  (results)  │
└─────────────┘    └──────────────┘    └───────────────┘    └─────────────┘
```

- **Hydrate**: Downloads previous session state from Actions artifacts or an external store.
- **Configure**: Resolves GitHub Secrets and OIDC tokens into provider credentials, builds a valid OpenClaw config object.
- **Execute**: Invokes `openclaw-core/agents/` to run the requested agent task with the assembled config.
- **Upload**: Serializes session state, transcripts, and outputs as Actions artifacts for the next run.

### 4.2 workflow-bridge.ts — Event-to-Command Translation

Translates GitHub event payloads into OpenClaw command invocations:

| GitHub event                             | Translated to                      |
| ---------------------------------------- | ---------------------------------- |
| `workflow_dispatch` with `command` input | Direct agent command execution     |
| `issue_comment` with `/openclaw` prefix  | Slash-command parsing → agent task |
| `pull_request` (opened/synchronized)     | PR validation agent run            |
| `schedule`                               | Cron-equivalent maintenance task   |

The bridge validates the event against `command-policy.json` and `trust-levels.json` before dispatching to the agent runner.

### 4.3 artifact-io.ts — Checkpoint Persistence

GitHub Actions runners are ephemeral. This module solves state continuity:

- **Write**: After each agent run, serialize session memory, compacted transcript, and tool outputs into a structured artifact.
- **Read**: On the next run, download the most recent artifact for the matching session key and rehydrate the agent context.
- **Garbage collection**: Artifacts older than a configurable retention window are pruned via the GitHub API.

### 4.4 secret-resolver.ts — Credential Mapping

Maps GitHub-native credential surfaces to OpenClaw provider configuration:

| GitHub surface              | OpenClaw config target                    |
| --------------------------- | ----------------------------------------- |
| `secrets.ANTHROPIC_API_KEY` | `providers.anthropic.apiKey`              |
| `secrets.OPENAI_API_KEY`    | `providers.openai.apiKey`                 |
| OIDC token exchange         | `providers.*.oidcToken` (where supported) |
| `vars.OPENCLAW_CONFIG`      | Base config overlay (JSON)                |

This replaces the local `~/.openclaw/config.yaml` with environment-injected configuration that never touches disk on the runner.

### 4.5 pr-bot.ts — Mutation via Pull Request

All write operations (code changes, config updates, documentation) are mediated through PRs:

1. Agent run produces a set of file changes.
2. `pr-bot.ts` creates a branch, commits the changes, and opens a PR.
3. The PR includes structured metadata: agent ID, session key, command that triggered it, policy gates satisfied.
4. Human review is required before merge — GitHub Mode never pushes directly to protected branches.

This aligns with the adapter contract in `adapter-contracts.json` (repo-write adapter: "no direct writes to protected branches").

## 5. Dependency Graph

The extraction creates a clear three-layer dependency:

```
┌─────────────────────────────────────┐
│         GitHub Mode Binding         │  ← New code
│  (github-runner, workflow-bridge,   │
│   artifact-io, secret-resolver,     │
│   pr-bot)                           │
├─────────────────────────────────────┤
│         OpenClaw Core Extract       │  ← Copied from openclaw/src
│  (agents, config, plugins, routing, │
│   hooks, providers, security,       │
│   infra subset, utils, sessions,    │
│   memory, skills, logging)          │
├─────────────────────────────────────┤
│         GitHub Actions Runtime      │  ← Platform provided
│  (runners, artifacts API, secrets,  │
│   OIDC, workflow dispatch)          │
└─────────────────────────────────────┘
```

Each layer depends only on the layer below it. The binding layer imports from `openclaw-core/` and from GitHub Actions toolkit packages (`@actions/core`, `@actions/artifact`, `@actions/github`). The core extract has no awareness of GitHub — it is the same code that runs locally, just configured differently.

## 6. Extraction Process

### 6.1 Initial Scrape

```bash
# From the openclaw repo root
MODULES=(
  agents config plugins plugin-sdk routing hooks
  providers security utils logging sessions memory
  skills shared types
)

mkdir -p ../github-mode-openclaw/openclaw-core
for mod in "${MODULES[@]}"; do
  cp -r "src/$mod" "../github-mode-openclaw/openclaw-core/$mod"
done

# Selective infra copy
mkdir -p ../github-mode-openclaw/openclaw-core/infra
for f in env.ts env-vars.ts file-lock.ts lockfile.ts json-file.ts \
         process.ts spawn.ts paths.ts home-dir.ts format-time.ts \
         format-bytes.ts version.ts index.ts; do
  cp "src/infra/$f" "../github-mode-openclaw/openclaw-core/infra/$f" 2>/dev/null
done

# Copy top-level entry files
cp src/index.ts ../github-mode-openclaw/openclaw-core/
cp src/runtime.ts ../github-mode-openclaw/openclaw-core/
cp src/logger.ts ../github-mode-openclaw/openclaw-core/
```

### 6.2 Dependency Pruning

After the initial copy, unused imports must be resolved:

1. **Dead import elimination** — Scan for imports referencing excluded modules (`src/telegram/`, `src/gateway/`, `src/tui/`, etc.) and remove or stub them.
2. **Config schema trimming** — The config module includes schemas for all 8+ channels and their specific options. Strip channel-specific config types that GitHub Mode does not need.
3. **Plugin SDK narrowing** — The SDK exports channel adapter types for every channel. The standalone repo needs only the base plugin types and the GitHub-specific adapter types.
4. **Test migration** — Colocated `*.test.ts` files move with their modules. Tests that depend on excluded modules are removed; tests that validate core logic are preserved.

### 6.3 Package Dependency Reduction

The full OpenClaw `package.json` lists 80+ dependencies spanning messaging SDKs, native addons, and platform-specific packages. The standalone repo's dependency set is dramatically smaller:

**Kept:**

- AI/LLM: `@anthropic-ai/sdk`, `openai`, `@aws-sdk/client-bedrock-runtime` (provider access)
- Schema validation: `zod`, `@sinclair/typebox`
- Config: `yaml`, `dotenv`
- Infra: `proper-lockfile`, `fast-glob`
- Logging: `pino` (or equivalent)
- GitHub: `@actions/core`, `@actions/artifact`, `@actions/github`, `@octokit/rest`

**Removed:**

- Messaging SDKs: `grammy`, `@slack/bolt`, `discord.js`, `whatsapp-web.js`, `signal-cli`
- Native addons: `node-pty`, `@aspect-build/rules_js`, platform binaries
- Media: `sharp`, `ffmpeg`, `pdfjs-dist`
- Desktop: `electron`, Sparkle, Bonjour
- TUI: `@clack/prompts`, `ink`, terminal rendering

Estimated dependency reduction: **60-70%** of `node_modules` size.

## 7. Sync Strategy

The standalone repo consumes OpenClaw as an upstream source, not a runtime dependency:

### 7.1 Periodic Upstream Sync

```yaml
# .github/workflows/github-mode-upstream-sync.yml
on:
  schedule:
    - cron: "0 6 * * 1" # Weekly
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          git clone --depth=1 https://github.com/openclaw/openclaw.git /tmp/upstream
          # Re-run scrape script against fresh upstream
          ./scripts/sync-from-upstream.sh /tmp/upstream
      - run: pnpm install && pnpm test
      - uses: peter-evans/create-pull-request@v6
        with:
          title: "chore: sync openclaw core modules from upstream"
          branch: sync/upstream
```

### 7.2 Version Pinning

The `openclaw-core/` directory includes a `.upstream-ref` file recording the upstream commit SHA it was extracted from:

```
# openclaw-core/.upstream-ref
openclaw/openclaw@a1b2c3d4  # 2026-02-18
```

This enables deterministic diffing: when syncing, the script diffs only between the pinned ref and the new upstream HEAD, applying changes to the extracted modules.

### 7.3 Breaking Change Detection

A CI job compares the extracted module's public API surface (exported types and functions) against the previous snapshot. If exports are removed or signatures change, the job flags a breaking change that requires binding layer updates.

## 8. Trade-offs

### 8.1 Benefits

| Benefit                    | Explanation                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| **Reduced attack surface** | No messaging SDK code, no native addons, no device-coupled modules on CI runners                  |
| **Faster CI**              | 60-70% smaller `node_modules`; install + build in under 60 seconds                                |
| **Clear ownership**        | `openclaw-core/` is consumed code; `binding/` and `.GITHUB-MODE/` are authored code               |
| **Independent versioning** | GitHub Mode can release binding updates without coordinating with OpenClaw core releases          |
| **Simpler auditing**       | Security reviewers audit a smaller, purpose-built codebase rather than the full OpenClaw monorepo |

### 8.2 Costs

| Cost                      | Explanation                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------- |
| **Sync burden**           | Upstream changes to extracted modules must be pulled and reconciled periodically       |
| **Divergence risk**       | Local patches to `openclaw-core/` that are not upstreamed create drift                 |
| **Duplicate testing**     | Tests for extracted modules run in both the standalone repo and upstream               |
| **Plugin SDK coupling**   | If the plugin SDK makes a breaking change, the binding layer must adapt                |
| **Incomplete extraction** | Transitive dependencies between modules may pull in more code than initially estimated |

### 8.3 When This Approach Is Preferable to the Overlay

The overlay (current approach) is better when GitHub Mode is installed **on top of** a full OpenClaw fork — the fork already has all modules, so extraction adds no value.

The standalone scrape is better when:

- GitHub Mode is deployed **independently** of any OpenClaw installation.
- The goal is a **minimal, auditable, CI-optimized** repository purpose-built for GitHub Actions execution.
- The team maintaining GitHub Mode is **distinct** from the team maintaining OpenClaw core.
- Regulatory or compliance requirements demand a **bounded, inventoried** codebase.

## 9. Binding Code Inventory

The binding layer is the only code authored specifically for the standalone repo. Estimated scope:

| File                         | Purpose                                  | Estimated size |
| ---------------------------- | ---------------------------------------- | -------------- |
| `binding/github-runner.ts`   | Runner lifecycle orchestration           | ~200 LOC       |
| `binding/workflow-bridge.ts` | Event-to-command translation             | ~150 LOC       |
| `binding/artifact-io.ts`     | Checkpoint persistence via artifacts API | ~180 LOC       |
| `binding/secret-resolver.ts` | GitHub Secrets → provider config mapping | ~120 LOC       |
| `binding/pr-bot.ts`          | PR creation from agent output            | ~160 LOC       |
| `binding/index.ts`           | Public API surface                       | ~30 LOC        |
| **Total**                    |                                          | **~840 LOC**   |

This is a deliberately small surface. The binding layer's only job is to translate between GitHub's event/artifact/secret model and OpenClaw's config/agent/session model. All substantive logic lives in the extracted `openclaw-core/` modules.

## 10. Conclusion

A standalone GitHub Mode repository built from extracted OpenClaw modules is feasible and offers concrete benefits for CI performance, security surface reduction, and ownership clarity. The extraction targets approximately 16 of OpenClaw's 48 source modules, plus a subset of infrastructure utilities. The binding layer — roughly 840 lines of new code — bridges GitHub's runtime primitives to OpenClaw's agent execution engine.

The key architectural insight is that OpenClaw's agent runner, config system, and plugin infrastructure are already cleanly separated from channel-specific and device-specific code. This separation, originally designed for multi-channel support, also makes it possible to extract a "headless" core suitable for CI-only execution.

The primary risk is sync burden: keeping `openclaw-core/` aligned with upstream requires periodic automated syncs and breaking-change detection. This is a tractable operational cost, not an architectural blocker.

For teams that need GitHub Mode as a standalone, independently deployable system rather than an overlay on a full fork, this extraction path provides a clear, minimal, and maintainable foundation.
