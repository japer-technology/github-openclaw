# Minimum Required Master Modifications

### Precisely defining the changes needed to redirect all OpenClaw file configurations to `.GITCLAW` file locations

---

## The Problem

`.GITOPENCLAW` runs the OpenClaw runtime inside a repository as a GitHub-native agent. When running in this context, all mutable data — sessions, config, credentials, caches — must live inside `.GITOPENCLAW/state/` (which we refer to as the `.GITCLAW` data directory), not in the default `~/.openclaw/` home directory.

Currently, the `GITOPENCLAW-AGENT.ts` orchestrator sets two environment variables before invoking the `openclaw` CLI:

```typescript
const agentEnv = {
  ...process.env,
  OPENCLAW_STATE_DIR: stateDir,          // → .GITOPENCLAW/state/
  OPENCLAW_CONFIG_PATH: runtimeConfigPath, // → /tmp/openclaw-runtime.json
};
```

This works for the **top-level** state directory and config file. But OpenClaw's internal path resolution has **multiple layers** that are not fully covered by these two variables. If the upstream OpenClaw master changes any path resolution logic, those changes must be re-applied in the fork.

This document identifies the **exact, minimal set of modifications** to the OpenClaw source that would be required to make it fully `.GITCLAW`-aware — so that every file path can be rerouted to a repository-local directory via environment variables alone, with **zero hardcoded fallbacks escaping to `~/.openclaw/`**.

---

## Current Environment Variable Coverage

OpenClaw already supports these environment variable overrides:

| Variable | What it controls | Default without override |
|---|---|---|
| `OPENCLAW_STATE_DIR` | Root state directory | `~/.openclaw/` |
| `OPENCLAW_CONFIG_PATH` | Config JSON file | `$STATE_DIR/openclaw.json` |
| `OPENCLAW_OAUTH_DIR` | OAuth credentials directory | `$STATE_DIR/credentials/` |
| `OPENCLAW_AGENT_DIR` | Main agent working directory | `$STATE_DIR/agents/main/agent/` |
| `OPENCLAW_GATEWAY_PORT` | Gateway port number | `18789` |
| `OPENCLAW_HOME` | Home directory base | `$HOME` |
| `OPENCLAW_PROFILE` | Profile suffix for state dir | (none — uses `.openclaw`) |
| `OPENCLAW_NIX_MODE` | Nix-specific behavior flags | `0` |

**The good news**: `OPENCLAW_STATE_DIR` already serves as the root override. When set, most subdirectory paths (agents, sessions, credentials) are derived from it. This means **most path resolution already works** when `OPENCLAW_STATE_DIR` is pointed at `.GITOPENCLAW/state/`.

**The gap**: Several code paths still fall back to `~/.openclaw/` or perform home-directory-relative lookups that bypass `OPENCLAW_STATE_DIR`. These are the modifications needed.

---

## File-by-File Analysis

### File 1: `src/config/paths.ts` — Core Path Resolution

**Role**: Central hub for resolving state directory, config file, OAuth directory, and gateway lock paths.

**What already works with env vars**:
- `resolveStateDir()` — respects `OPENCLAW_STATE_DIR` ✅
- `resolveCanonicalConfigPath()` — respects `OPENCLAW_CONFIG_PATH` ✅
- `resolveOAuthDir()` — respects `OPENCLAW_OAUTH_DIR` ✅
- `resolveGatewayPort()` — respects `OPENCLAW_GATEWAY_PORT` ✅

**What needs attention**:

1. **Legacy config candidate scanning** (lines 130–183, `resolveConfigPath()` and `resolveConfigPathCandidate()`):
   - Even when `OPENCLAW_STATE_DIR` is set, these functions scan for legacy config filenames (`clawdbot.json`, `moldbot.json`, `moltbot.json`) in both the overridden state dir and the default `~/.openclaw/` directory.
   - In a `.GITCLAW` context, these legacy scans are unnecessary and could accidentally find a stale config from a previous run if `HOME` is not ephemeral.
   - **Modification**: When `OPENCLAW_STATE_DIR` is explicitly set, skip legacy fallback scanning entirely. Only look in the overridden state dir.

2. **Module-level eager evaluation** (lines 108, 185):
   ```typescript
   export const STATE_DIR = resolveStateDir();
   export const CONFIG_PATH = resolveConfigPathCandidate();
   ```
   - These are evaluated at import time, before any env vars can be set by the orchestrator. If OpenClaw internals import this module before the agent sets `OPENCLAW_STATE_DIR`, the wrong path gets cached.
   - **Modification**: Either make these lazy (getter functions) or ensure the orchestrator sets env vars before any OpenClaw module is imported. The env var approach (set before `openclaw agent` is spawned) already handles this for subprocess invocation, but any in-process usage would need lazy evaluation.

**Impact**: Low. The subprocess invocation model (spawning `openclaw agent` with env vars already set) means the eager evaluation picks up the correct values. This only matters if OpenClaw is ever imported as a library rather than spawned as a CLI.

---

### File 2: `src/infra/home-dir.ts` — Home Directory Resolution

**Role**: Resolves the user's home directory, which serves as the base for the default state directory.

**What already works**:
- `resolveRequiredHomeDir()` — respects `OPENCLAW_HOME` ✅
- `resolveEffectiveHomeDir()` — respects `OPENCLAW_HOME` ✅
- `expandHomePrefix()` — correctly expands `~` using the resolved home ✅

**What needs attention**:

1. **Fallback to `process.cwd()`** (line 56):
   ```typescript
   return resolveEffectiveHomeDir(env, homedir) ?? path.resolve(process.cwd());
   ```
   - If no home directory can be resolved, it falls back to the current working directory. In a CI runner, `cwd` is typically the repo root, which is acceptable. But this fallback means that even with `OPENCLAW_STATE_DIR` set, the home resolution logic still runs and may log warnings.
   - **Modification**: None strictly required — this is a safe fallback. But adding a `.GITCLAW`-aware early return (when `OPENCLAW_STATE_DIR` is set, don't bother resolving home) would eliminate unnecessary filesystem probing.

**Impact**: Minimal. No modification strictly required.

---

### File 3: `src/config/sessions/paths.ts` — Session Path Resolution

**Role**: Resolves paths for session transcripts (`*.jsonl`), session stores (`sessions.json`), and agent session directories.

**What already works**:
- `resolveAgentSessionsDir()` — derives from `resolveStateDir()`, so it respects `OPENCLAW_STATE_DIR` ✅
- `resolveSessionTranscriptPath()` — derives from agent sessions dir ✅
- `resolveDefaultSessionStorePath()` — derives from agent sessions dir ✅

**What needs attention**:

1. **Absolute path compatibility fallbacks** (lines 161–223):
   - `resolvePathWithinSessionsDir()` has extensive logic for resolving absolute paths that point to sessions stored in a different root (e.g., `/home/runner/.openclaw/agents/main/sessions/xyz.jsonl` when the current state dir is `.GITOPENCLAW/state/`).
   - This handles the case where session metadata from a previous run contains absolute paths from a different machine.
   - **Modification**: None required — this is defensive logic that handles cross-root migration. But in the `.GITCLAW` context, session paths should always be relative. The orchestrator should ensure session mappings use relative paths to avoid this code path entirely.

**Impact**: None. Existing env var override is sufficient.

---

### File 4: `src/agents/agent-paths.ts` — Agent Directory Resolution

**Role**: Resolves the main agent's working directory (where auth profiles, models config, etc. live).

**What already works**:
- `resolveOpenClawAgentDir()` — respects `OPENCLAW_AGENT_DIR` and `PI_CODING_AGENT_DIR` ✅
- Falls back to `$STATE_DIR/agents/main/agent/` which correctly uses the overridden state dir ✅

**What needs attention**:

1. **`ensureOpenClawAgentEnv()`** (lines 16–25):
   ```typescript
   export function ensureOpenClawAgentEnv(): string {
     const dir = resolveOpenClawAgentDir();
     if (!process.env.OPENCLAW_AGENT_DIR) {
       process.env.OPENCLAW_AGENT_DIR = dir;
     }
     if (!process.env.PI_CODING_AGENT_DIR) {
       process.env.PI_CODING_AGENT_DIR = dir;
     }
     return dir;
   }
   ```
   - This eagerly writes resolved paths back to `process.env`. If called before `OPENCLAW_STATE_DIR` is set, it caches the wrong path in the environment.
   - **Modification**: Ensure `OPENCLAW_STATE_DIR` is set before any code calls `ensureOpenClawAgentEnv()`. The subprocess model already guarantees this for CLI invocation.

**Impact**: None for subprocess invocation. Only matters for in-process usage.

---

### File 5: `src/agents/agent-scope.ts` — Multi-Agent Directory Resolution

**Role**: Resolves per-agent directories for any agent (not just the default `main` agent).

**What already works**:
- `resolveAgentDir(cfg, agentId)` — checks agent-specific config first, then falls back to `$STATE_DIR/agents/<id>/agent/` ✅
- `resolveAgentWorkspaceDir()` — similar pattern ✅

**What needs attention**: None. The `resolveStateDir()` call at line 279 picks up `OPENCLAW_STATE_DIR` correctly.

**Impact**: None. No modification required.

---

### File 6: `src/daemon/paths.ts` — Daemon State Directory

**Role**: Resolves the gateway daemon's state directory (used by systemd, launchd, or Windows Scheduled Tasks).

**What already works**:
- `resolveGatewayStateDir()` — respects `OPENCLAW_STATE_DIR` ✅

**What needs attention**:

1. **Hardcoded `.openclaw` prefix** (line 41):
   ```typescript
   return path.join(home, `.openclaw${suffix}`);
   ```
   - When `OPENCLAW_STATE_DIR` is not set, this constructs `~/.openclaw` (or `~/.openclaw-<profile>`).
   - In the `.GITCLAW` context, this code path is never reached because `OPENCLAW_STATE_DIR` is always set.
   - **Modification**: None required — env var override bypasses this.

**Impact**: None. No modification required.

---

### File 7: `src/daemon/service-env.ts` — Service Environment Propagation

**Role**: Builds the environment variable set for daemon child processes (systemd, launchd, schtasks).

**What already works**:
- Propagates `OPENCLAW_STATE_DIR` to child processes ✅
- Propagates `OPENCLAW_CONFIG_PATH` to child processes ✅
- Propagates `OPENCLAW_PROFILE` to child processes ✅

**What needs attention**: None. This file correctly reads from the parent environment and passes values through.

**Impact**: None. No modification required.

---

### File 8: `src/commands/status-all.ts` — Status/Diagnosis Output

**Role**: Renders the `openclaw status --all` output including config path, gateway status, and service status.

**What needs attention** (as documented in [TO-BE-DEALT-WITH.md](TO-BE-DEALT-WITH.md)):

1. **Config path display** — shows `~/.openclaw/openclaw.json` even when running in a `.GITCLAW` context.
   - **Modification**: When `OPENCLAW_STATE_DIR` or `OPENCLAW_CONFIG_PATH` is set and in a CI environment, display the actual configured path instead of the default.

2. **Gateway ECONNREFUSED error** — shows raw socket error in CI where no gateway exists.
   - **Modification**: Detect CI environment and show `"not started (CI — commands run inline)"` instead of the raw error.

3. **Service rows** — shows `"systemd not installed"` in CI where services are irrelevant.
   - **Modification**: Detect CI and show `"n/a (CI environment)"` or omit service rows.

**Impact**: Medium. These are UX improvements for `.GITCLAW` contexts but do not affect runtime behavior.

---

### File 9: `src/commands/status.command.ts` — Status Command (Non-All)

**Role**: The shorter `openclaw status` output.

**What needs attention**: Same issues as `status-all.ts` for gateway and daemon formatting. Same modifications apply.

**Impact**: Medium. UX only.

---

### File 10: `src/gateway/probe.ts` — Gateway Connection Probe

**Role**: Probes the gateway WebSocket connection for health checks.

**What needs attention**:

1. **ECONNREFUSED formatting** (line ~108):
   ```typescript
   `connect failed: ${connectError}`
   ```
   - In CI, this produces alarming output for an expected condition (no gateway running).
   - **Modification**: Return a structured result that allows callers to distinguish "no gateway running" from "gateway unreachable due to network error".

**Impact**: Low. The gateway probe is not used during `.GITCLAW` agent execution (which uses `--local` mode).

---

## Summary: The Minimum Modification Set

### Tier 1 — Zero Modifications Needed (Already Works via Env Vars)

These files require **no changes** to support `.GITCLAW` file locations. Setting `OPENCLAW_STATE_DIR` before spawning the `openclaw` CLI is sufficient:

| File | Why it works |
|---|---|
| `src/config/paths.ts` | `resolveStateDir()` respects `OPENCLAW_STATE_DIR` |
| `src/infra/home-dir.ts` | Home resolution is bypassed when state dir is overridden |
| `src/config/sessions/paths.ts` | All session paths derive from `resolveStateDir()` |
| `src/agents/agent-paths.ts` | Falls back to `$STATE_DIR/agents/main/agent/` |
| `src/agents/agent-scope.ts` | `resolveAgentDir()` uses `resolveStateDir()` |
| `src/daemon/paths.ts` | `resolveGatewayStateDir()` respects `OPENCLAW_STATE_DIR` |
| `src/daemon/service-env.ts` | Propagates env vars to child processes correctly |

**The environment variables that the `.GITCLAW` orchestrator must set**:

```typescript
// These three env vars are sufficient to redirect ALL file paths:
OPENCLAW_STATE_DIR=".GITOPENCLAW/state/"        // Root state directory
OPENCLAW_CONFIG_PATH="/tmp/openclaw-runtime.json" // Runtime config
// Optional but recommended:
OPENCLAW_OAUTH_DIR=".GITOPENCLAW/state/credentials/"  // OAuth tokens
```

The `GITOPENCLAW-AGENT.ts` orchestrator already sets the first two. All subdirectory paths (agents, sessions, credentials, caches) are automatically derived from the state dir root.

### Tier 2 — Recommended Modifications (Improve .GITCLAW UX)

These changes would improve the experience of running OpenClaw in a `.GITCLAW` context but are **not required** for correct operation:

| # | File | Change | Complexity |
|---|---|---|---|
| 1 | `src/config/paths.ts` | Skip legacy config scanning when `OPENCLAW_STATE_DIR` is explicitly set | Low |
| 2 | `src/commands/status-all.ts` | Detect CI/`.GITCLAW` context and adapt config, gateway, and service display | Medium |
| 3 | `src/commands/status.command.ts` | Same CI-aware display changes as `status-all.ts` | Medium |
| 4 | `src/gateway/probe.ts` | Return structured error for ECONNREFUSED (distinguish "not running" from "network error") | Low |

### Tier 3 — Future-Proofing Modifications (Prevent Breakage on Upstream Changes)

These changes would make `.GITCLAW` support resilient against upstream refactors:

| # | File | Change | Complexity |
|---|---|---|---|
| 1 | `src/config/paths.ts` | Make `STATE_DIR` and `CONFIG_PATH` exports lazy (getter functions) instead of eagerly evaluated module constants | Low |
| 2 | `src/agents/agent-paths.ts` | Make `ensureOpenClawAgentEnv()` guard against being called before env vars are set | Low |

---

## The Key Insight

**The minimum required master modifications is effectively zero for correct runtime behavior.**

OpenClaw's path resolution architecture is already designed around environment variable overrides. The `OPENCLAW_STATE_DIR` variable serves as the single root from which all other paths are derived. When the `.GITCLAW` orchestrator sets this variable before spawning the `openclaw agent` CLI process, every file path — config, sessions, credentials, agent directories, caches — is correctly redirected to the `.GITCLAW` state directory.

The modifications in Tier 2 and Tier 3 are improvements to diagnostics, UX, and robustness. They make the `.GITCLAW` experience better but are not prerequisites for it to function.

This means:

1. **Fork maintenance burden is minimal.** When upstream changes files in `src/config/paths.ts` or other path resolution code, the changes will naturally respect `OPENCLAW_STATE_DIR` because that is how the path resolution was designed.

2. **The orchestrator is the integration layer.** All `.GITCLAW`-specific logic lives in `GITOPENCLAW-AGENT.ts`, which is outside the OpenClaw source tree. It sets env vars and invokes the CLI. No source patches needed.

3. **Upstream improvements flow freely.** Syncing the fork with upstream brings runtime improvements without conflicting with `.GITCLAW` configuration, because `.GITCLAW` uses the same override mechanism that OpenClaw's own deployment modes (Nix, profiles, daemon services) use.

---

## Environment Variable Contract

For reference, here is the complete set of environment variables that the `.GITCLAW` orchestrator should set to fully redirect all file paths:

```bash
# Required — redirects the root state directory
OPENCLAW_STATE_DIR=".GITOPENCLAW/state/"

# Required — points to the runtime config for this invocation
OPENCLAW_CONFIG_PATH="/tmp/openclaw-runtime.json"

# Optional — set these for completeness but they are derived from STATE_DIR
OPENCLAW_OAUTH_DIR=".GITOPENCLAW/state/credentials/"
OPENCLAW_HOME="$GITHUB_WORKSPACE"

# Not needed — these have correct defaults when STATE_DIR is set
# OPENCLAW_AGENT_DIR (auto: $STATE_DIR/agents/main/agent/)
# OPENCLAW_GATEWAY_PORT (not applicable in --local mode)
# OPENCLAW_PROFILE (not applicable in CI)
```

With these variables set, the complete directory tree that OpenClaw creates will live under `.GITOPENCLAW/state/`:

```
.GITOPENCLAW/state/
├── openclaw.json           (runtime config — but we use OPENCLAW_CONFIG_PATH to /tmp/)
├── credentials/
│   └── oauth.json
├── agents/
│   └── main/
│       ├── agent/          (auth profiles, models config)
│       └── sessions/
│           ├── sessions.json
│           └── *.jsonl     (session transcripts)
├── logs/
├── extensions/
├── hooks/
├── workspace/
├── memory/
├── canvas/
└── sandboxes/
```

No files escape to `~/.openclaw/`. The fork is self-contained. Upstream updates merge cleanly.

---

## Comparison with TO-BE-DEALT-WITH.md

The [TO-BE-DEALT-WITH.md](TO-BE-DEALT-WITH.md) analysis identified four specific issues observed during `openclaw status --all` in a CI environment. Here is how each maps to this modification analysis:

| TO-BE-DEALT-WITH Issue | This Analysis | Resolution |
|---|---|---|
| **Issue 1**: Config path wrong (`~/.openclaw/openclaw.json`) | Tier 2 #2 — status display improvement | UX fix; runtime already uses correct path via `OPENCLAW_CONFIG_PATH` |
| **Issue 2**: Gateway ECONNREFUSED alarming | Tier 2 #4 — structured probe error | UX fix; gateway not used in `--local` mode |
| **Issue 3**: "systemd not installed" irrelevant | Tier 2 #2 — CI-aware status display | UX fix; services not used in CI |
| **Issue 4**: Two config systems without awareness | Tier 1 — already works | `OPENCLAW_CONFIG_PATH` is the bridge between the two config systems |

All four issues from `TO-BE-DEALT-WITH.md` are either already solved (by env var overrides) or are UX improvements (Tier 2) that make diagnostic output more helpful in CI. None require changes to core path resolution logic for correct runtime behavior.

---

## Conclusion

The OpenClaw codebase was designed with environment variable overrides as a first-class path redirection mechanism. This design — originally built to support deployment profiles, Nix mode, and daemon service isolation — is exactly what `.GITCLAW` needs.

**The minimum required master modifications: zero for correct operation. Four files for improved diagnostics.**

Every time the upstream master updates, the fork inherits those updates. The `.GITCLAW` orchestrator sits outside the OpenClaw source tree, communicating via environment variables. There is no patch to reapply. There is no merge conflict waiting to happen. The fork-as-installation model works precisely because the override mechanism was already there.

---

_Last updated: 2026-03-01_
