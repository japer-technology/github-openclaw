# Applied Master Modifications

### Tracking every change made to OpenClaw source files for .GITOPENCLAW support

---

## Purpose

This document catalogs the **exact changes** applied to OpenClaw source files to improve `.GITOPENCLAW` configuration isolation via environment variable overrides. If the upstream OpenClaw master updates any of these files, this guide tells you precisely what to re-apply and where.

All changes follow the analysis in [MINIMUM-REQUIRED-MASTER-MODIFICATIONS.md](MINIMUM-REQUIRED-MASTER-MODIFICATIONS.md).

---

## Quick Reference: Changed Files

| #   | File                             | Change Category                       | Merge Risk         |
| --- | -------------------------------- | ------------------------------------- | ------------------ |
| 1   | `src/config/paths.ts`            | Legacy scanning skip + lazy accessors | Low — additive     |
| 2   | `src/commands/status-all.ts`     | CI-aware display                      | Low — display-only |
| 3   | `src/commands/status.command.ts` | CI-aware display                      | Low — display-only |
| 4   | `src/gateway/probe.ts`           | Structured ECONNREFUSED error         | Low — single line  |
| 5   | `src/agents/agent-paths.ts`      | Documentation comment                 | Trivial            |
| 6   | `src/config/paths.test.ts`       | New tests                             | Additive only      |
| 7   | `src/gateway/probe.test.ts`      | New tests                             | Additive only      |
| 8   | `.github/` (multiple files)      | Disabled openclaw dev files           | Low — file moves   |

---

## Disabled OpenClaw Development Files

### Rationale

Since `.GITOPENCLAW` is **executing** the fork (not developing it), the upstream openclaw development workflows, issue templates, PR template, and funding configuration are not required. These files are moved to `.github/workflows-disabled/` so that the `.github/` folder becomes the focal point for `.GITOPENCLAW`-specific configuration.

### Files Moved to `.github/workflows-disabled/`

The following openclaw files were moved out of their active `.github/` locations:

| Original Location                                  | Moved To                                            |
| -------------------------------------------------- | --------------------------------------------------- |
| `.github/FUNDING.yml`                              | `.github/workflows-disabled/FUNDING.yml`            |
| `.github/pull_request_template.md`                 | `.github/workflows-disabled/pull_request_template.md` |
| `.github/ISSUE_TEMPLATE/bug_report.yml`            | `.github/workflows-disabled/bug_report.yml`         |
| `.github/ISSUE_TEMPLATE/feature_request.yml`       | `.github/workflows-disabled/feature_request.yml`    |
| `.github/ISSUE_TEMPLATE/regression_bug_report.yml` | `.github/workflows-disabled/regression_bug_report.yml` |
| `.github/ISSUE_TEMPLATE/config.yml`                | `.github/workflows-disabled/config.yml`             |

Previously disabled openclaw workflows already in `.github/workflows-disabled/`:

- `auto-response.yml`
- `ci.yml`
- `docker-release.yml`
- `install-smoke.yml`
- `labeler.yml`
- `sandbox-common-smoke.yml`
- `workflow-sanity.yml`

### Active `.github/` Files (GITOPENCLAW-specific)

After the moves, the active `.github/` area contains only GITOPENCLAW files:

- **Workflows:** `GITOPENCLAW-WORKFLOW-AGENT.yml`, `delete-workflow-runs.yml`, `GITOPENCLAW-enforce-disabled.yml`
- **Issue templates:** `GITOPENCLAW-NEW-ISSUE.yml`, `GITCLAW-TEMPLATE-FEATURE-REQUEST.yml`, `GITOPENCLAW-TEMPLATE-HATCH.md`

### Enforcement Workflow

A workflow (`.github/workflows/GITOPENCLAW-enforce-disabled.yml`) automatically detects if any of the disabled openclaw files reappear in their original locations (e.g. after a fork master sync) and moves them back to `.github/workflows-disabled/`.

**Trigger:** Runs on push to `main` when any of the disabled file paths are detected, or on manual workflow dispatch.

**How to re-apply if upstream changes enforcement:** The workflow is self-contained. If upstream adds new files to `.github/` that should be disabled, add their paths to the `paths:` trigger and the file loop in the workflow.

---

## File-by-File Change Details

### File 1: `src/config/paths.ts`

**Changes:**

#### 1a. Lazy accessors for `STATE_DIR` and `CONFIG_PATH` (lines ~108-113, ~190-195)

Two new functions were added immediately above the existing eager exports:

```typescript
/** Lazy accessor — evaluated on first read so env vars set after import are respected. */
export function getStateDir(): string {
  return resolveStateDir();
}
export const STATE_DIR = resolveStateDir();
```

```typescript
/** Lazy accessor — evaluated on first read so env vars set after import are respected. */
export function getConfigPath(): string {
  return resolveConfigPathCandidate();
}
export const CONFIG_PATH = resolveConfigPathCandidate();
```

**Why:** The eager `STATE_DIR` and `CONFIG_PATH` constants are evaluated at module import time. If OpenClaw is ever imported as a library (rather than spawned as a subprocess), env vars set after import are missed. The lazy `getStateDir()` and `getConfigPath()` functions re-evaluate each call, picking up the latest env vars.

**How to re-apply:** Add the `getStateDir()` function immediately before `export const STATE_DIR = ...` and `getConfigPath()` immediately before `export const CONFIG_PATH = ...`. The existing constants are preserved unchanged.

#### 1b. Skip legacy home-dir scanning when `OPENCLAW_STATE_DIR` is set (in `resolveDefaultConfigCandidates()`)

Inside `resolveDefaultConfigCandidates()`, after the block that adds candidates from the overridden `OPENCLAW_STATE_DIR`, an early `return` was added:

```typescript
if (openclawStateDir) {
  const resolved = resolveUserPath(openclawStateDir, env, effectiveHomedir);
  candidates.push(path.join(resolved, CONFIG_FILENAME));
  candidates.push(...LEGACY_CONFIG_FILENAMES.map((name) => path.join(resolved, name)));
  // When OPENCLAW_STATE_DIR is explicitly set, skip legacy home-dir scanning
  // so that stale configs in ~/.openclaw/ are never accidentally picked up.
  return candidates; // ← ADDED
}
```

**Why:** When `OPENCLAW_STATE_DIR` is explicitly set (e.g. by the `.GITOPENCLAW` orchestrator), there is no reason to scan `~/.openclaw/`, `~/.clawdbot/`, etc. for legacy configs. Without this change, a stale config from a previous run on the same CI runner could be accidentally picked up.

**How to re-apply:** Find the `if (openclawStateDir)` block in `resolveDefaultConfigCandidates()`. Add `return candidates;` after the `candidates.push(...)` lines, before the closing `}`.

---

### File 2: `src/commands/status-all.ts`

**Changes:**

#### 2a. CI environment detection (line ~37)

Added at the top of `statusAllCommand()`, before `withProgress`:

```typescript
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
```

#### 2b. Gateway status — CI-aware message (lines ~238-244)

The gateway status ternary was extended to check `isCI` before showing `unreachable`:

```typescript
const gatewayStatus = gatewayReachable
  ? `reachable ${formatDurationPrecise(gatewayProbe?.connectLatencyMs ?? 0)}`
  : isCI
    ? "n/a (CI — commands run inline)" // ← ADDED
    : gatewayProbe?.error
      ? `unreachable (${gatewayProbe.error})`
      : "unreachable";
```

**Why:** In CI, no gateway process runs — commands execute inline via `--local` mode. Showing `unreachable (connect ECONNREFUSED ...)` is alarming and misleading.

#### 2c. Service rows — CI-aware message (lines ~295-320)

The Gateway service and Node service rows now check `isCI` first:

```typescript
daemon
  ? {
      Item: "Gateway service",
      Value: isCI
        ? "n/a (CI environment)"              // ← ADDED
        : !daemon.installed
          ? `${daemon.label} not installed`
          : `${daemon.label} ${daemon.installed ? "installed · " : ""}...`,
    }
  : { Item: "Gateway service", Value: isCI ? "n/a (CI environment)" : "unknown" },
```

Same pattern applied to the Node service row.

**Why:** "systemd not installed" is irrelevant and confusing in CI where GitHub Actions manages the process lifecycle.

**How to re-apply:** Search for `statusAllCommand()`. Add the `isCI` const. Then find the `gatewayStatus` ternary and the `daemon`/`nodeService` overview row objects, and insert the `isCI` checks as shown above.

---

### File 3: `src/commands/status.command.ts`

**Changes:** Identical pattern to `status-all.ts` — the non-`--all` status command.

#### 3a. CI environment detection (line ~107)

Added after the `scan` destructuring:

```typescript
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
```

#### 3b. Gateway reach value — CI-aware (lines ~240-243)

```typescript
const reach = remoteUrlMissing
  ? warn("misconfigured (remote.url missing)")
  : gatewayReachable
    ? ok(`reachable ${formatDuration(gatewayProbe?.connectLatencyMs)}`)
    : isCI
      ? "n/a (CI — commands run inline)" // ← ADDED
      : warn(gatewayProbe?.error ? `unreachable (${gatewayProbe.error})` : "unreachable");
```

#### 3c. Daemon/Node service values — CI-aware (lines ~282-298)

```typescript
const daemonValue = (() => {
  if (isCI) {
    // ← ADDED
    return "n/a (CI environment)";
  }
  if (daemon.installed === false) {
    return `${daemon.label} not installed`;
  }
  // ... existing code unchanged
})();
```

Same pattern for `nodeDaemonValue`.

**How to re-apply:** Same pattern as File 2. Add `isCI`, then insert CI checks in the gateway reach computation and daemon/node-service value closures.

---

### File 4: `src/gateway/probe.ts`

**Changes:**

#### 4a. Structured ECONNREFUSED error (line ~108)

The timeout settle block was changed from:

```typescript
error: connectError ? `connect failed: ${connectError}` : "timeout",
```

To:

```typescript
error: connectError
  ? connectError.includes("ECONNREFUSED")
    ? "not running"
    : `connect failed: ${connectError}`
  : "timeout",
```

**Why:** ECONNREFUSED specifically means "no process is listening on this port" — it is not a network error. Returning `"not running"` instead of `"connect failed: connect ECONNREFUSED 127.0.0.1:18789"` produces cleaner output in status displays and allows callers to distinguish "gateway not started" from genuine connectivity issues.

**How to re-apply:** Find the `settle()` call inside the `setTimeout` callback. Replace the single-line `error:` with the three-way ternary checking for `"ECONNREFUSED"`.

---

### File 5: `src/agents/agent-paths.ts`

**Changes:**

#### 5a. Documentation comment on `ensureOpenClawAgentEnv()` (lines ~18-20)

Added a comment explaining the subprocess model constraint:

```typescript
export function ensureOpenClawAgentEnv(): string {
  const dir = resolveOpenClawAgentDir();
  // NB: When using the subprocess model (e.g. .GITOPENCLAW orchestrator),
  // OPENCLAW_STATE_DIR is set before this code runs so the resolved dir is correct.
  // For in-process usage, ensure OPENCLAW_STATE_DIR is set before calling this.
  if (!process.env.OPENCLAW_AGENT_DIR) {
    // ... unchanged
```

**Why:** Documents the constraint that `OPENCLAW_STATE_DIR` must be set before this function is called for in-process usage. The subprocess invocation model (`.GITOPENCLAW` orchestrator → `openclaw agent` CLI) already guarantees this.

**How to re-apply:** Add the three comment lines after the `const dir = resolveOpenClawAgentDir();` line.

---

### File 6: `src/config/paths.test.ts` (test additions only)

Added two new test cases:

1. **"skips legacy home-dir scanning when OPENCLAW_STATE_DIR is set"** — Verifies that `resolveDefaultConfigCandidates()` returns only candidates within the overridden state dir and none from `~/.openclaw/` or legacy dirs.

2. **"lazy path accessors" describe block** — Verifies `getStateDir()` and `getConfigPath()` return strings.

**How to re-apply:** Append the test cases to the existing `describe("state + config path candidates")` block and add a new `describe("lazy path accessors")` block. Also add `getStateDir` and `getConfigPath` to the import list.

---

### File 7: `src/gateway/probe.test.ts` (test additions only)

Added:

1. **`simulateConnectError` field** to the mock state.
2. **ECONNREFUSED simulation** in `MockGatewayClient.start()` — when `simulateConnectError` is set, calls `onConnectError` instead of `onHelloOk`.
3. **"returns 'not running' for ECONNREFUSED errors"** test — Verifies ECONNREFUSED produces `error: "not running"`.
4. **"returns full error for non-ECONNREFUSED connect errors"** test — Verifies other errors still produce `"connect failed: ..."`.

**How to re-apply:** Add `simulateConnectError` to the hoisted state, add the early-return block in `MockGatewayClient.start()`, and append the two new test cases.

---

## Merge Conflict Resolution Guide

When upstream updates arrive and conflict with these changes, use this decision tree:

### If upstream changes `src/config/paths.ts`:

1. **Did they change `resolveDefaultConfigCandidates()`?** → Re-apply the early `return candidates;` inside the `if (openclawStateDir)` block.
2. **Did they change or move `STATE_DIR`/`CONFIG_PATH` exports?** → Re-add the `getStateDir()`/`getConfigPath()` functions next to the new export locations.
3. **Did they remove legacy config scanning entirely?** → Our change is no longer needed; drop it.

### If upstream changes `src/commands/status-all.ts` or `src/commands/status.command.ts`:

1. **Did they refactor the overview rows?** → Find the new gateway/service row construction and re-insert the `isCI` checks.
2. **Did they add their own CI detection?** → Merge with our approach; prefer upstream if functionally equivalent.

### If upstream changes `src/gateway/probe.ts`:

1. **Did they change the timeout `settle()` call?** → Re-apply the ECONNREFUSED check in the new error formatting.
2. **Did they add structured error types?** → Our `"not running"` string can be upgraded to their error type.

### If upstream changes `src/agents/agent-paths.ts`:

1. **Did they change `ensureOpenClawAgentEnv()`?** → Re-add the comment if the function still exists.
2. **Did they make it lazy or add guards?** → Our comment is no longer needed.

---

## Environment Variable Contract (unchanged)

For completeness, the full set of env vars that the `.GITOPENCLAW` orchestrator sets (in `GITOPENCLAW-AGENT.ts`):

```bash
# Required — redirects the root state directory
OPENCLAW_STATE_DIR=".GITOPENCLAW/state/"

# Required — points to the runtime config for this invocation
OPENCLAW_CONFIG_PATH="/tmp/openclaw-runtime.json"

# Set — explicitly directs OAuth credentials storage
OPENCLAW_OAUTH_DIR=".GITOPENCLAW/state/credentials/"

# Set — anchors home directory resolution to the repo root
OPENCLAW_HOME="$GITHUB_WORKSPACE"
```

These were already set by the orchestrator before this change. The modifications in this PR improve how OpenClaw _responds_ to these variables (skipping unnecessary legacy scanning, better diagnostic output in CI).

---

_Last updated: 2026-03-02_
