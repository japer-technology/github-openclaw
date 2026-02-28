# Viability Analysis: invoking `scripts/run-node.mjs` in GitHub Mode automation

## Executive summary

**Short answer:** Yes, it is viable to invoke `scripts/run-node.mjs` from GitHub Mode scripts/workflows, and doing so is a strong way to execute `src/**` behavior through the OpenClaw CLI command surface instead of importing internal modules directly.

However, the fit is **context-dependent**:

- For **source-of-truth behavior execution** (agent runs, command routing, CLI flows), `scripts/run-node.mjs` is a good entrypoint because it builds when needed and then executes the same CLI bootstrap path as the `openclaw` binary.
- For **repeatable CI with deterministic build artifacts**, `pnpm build` + `node openclaw.mjs ...` is often cleaner/faster at scale because `run-node.mjs` performs staleness checks and may trigger ad-hoc incremental builds.
- For **published/install parity** checks, `openclaw.mjs` against prebuilt `dist/**` is still the canonical installed path.

A practical recommendation is to standardize on:

1. `pnpm install`
2. `pnpm build` (once per job or cache restore boundary)
3. `node scripts/run-node.mjs ...` for command invocations that should auto-heal stale dist in fork-context development flows, **or** `node openclaw.mjs ...` for strict reproducibility once dist is known-good.

## What `scripts/run-node.mjs` actually guarantees

`run-node.mjs` is a thin runner that:

1. Tracks watched inputs (`src`, `tsconfig.json`, `package.json`).
2. Computes whether `dist` appears stale via build stamp, git HEAD, and dirty-source checks.
3. Runs `pnpm exec tsdown --no-clean` when stale.
4. Launches `openclaw.mjs` with inherited stdio.

This gives automation a stable command boundary that still reflects current `src/**` behavior without each workflow needing to reimplement module wiring.

## Why this supports the GitHub Mode goal

GitHub Mode docs and ADRs already frame fork-context execution as:

- build OpenClaw from source, then
- invoke CLI/runtime behavior in workflows.

Using `run-node.mjs` reinforces that model because automation calls the runtime through CLI semantics, not through internal `import` contracts that are more likely to drift.

In other words, it preserves the operational contract “act like OpenClaw is installed,” while still running from repo source.

## Strengths of using `run-node.mjs` in workflows

### 1) Stable invocation surface

Workflow steps call a command (`node scripts/run-node.mjs <subcommand> ...`) rather than importing `src/*` modules. That decouples automation from internal refactors.

### 2) Automatic stale-build recovery

If `dist` is missing or stale, the script rebuilds before invoking CLI logic. This prevents common CI failures where command execution occurs before build output exists.

### 3) Cross-platform spawn handling

The runner has explicit `win32` command-path handling (`cmd.exe ... pnpm ...`) and standard Unix path handling, reducing platform-specific workflow branching.

### 4) Same final CLI bootstrap path

After build/no-build decision, execution funnels through `openclaw.mjs`, which then imports `dist/entry.*`; this keeps runtime behavior close to actual shipped CLI semantics.

## Risks and limitations to account for

### 1) Build parity is not full `pnpm build`

`run-node.mjs` executes `pnpm exec tsdown --no-clean`, not the full `pnpm build` pipeline (which also runs additional post-build scripts such as plugin SDK d.ts generation and compatibility shims).

Implication: if a workflow depends on artifacts produced by those extra build steps, `run-node.mjs` alone is insufficient.

### 2) Reproducibility vs convenience tension

Staleness logic uses timestamps/git status checks. That is useful for developer-like workflows but can add slight nondeterminism in CI timing compared with “always run full build, then run CLI.”

### 3) Dependency on `pnpm` availability at runtime

When stale, the runner shells out to `pnpm`. Workflows must ensure Node+pnpm setup before first invocation.

### 4) Potential repeated build checks in multi-step jobs

If many steps each call `run-node.mjs`, each run performs staleness evaluation and may incur overhead. This is usually small but can matter at scale.

## Recommended policy for GitHub Mode automation

### Preferred default for CI predictability

- **Prepare once:** `pnpm install && pnpm build`
- **Execute commands:** `node openclaw.mjs ...` (strictly consumes prepared dist)

### Preferred default for developer-style orchestration jobs

- **Execute directly:** `node scripts/run-node.mjs ...`
- Let it auto-build as needed.

### Hybrid (often best)

- First workflow phase does `pnpm build` and caches/retains `dist`.
- Later phases still invoke `scripts/run-node.mjs` for ergonomic/stale-safe behavior, but most calls skip rebuild.

## Interface stability compared to internal imports

Using CLI entrypoints is more stable than importing `src/**` internals because:

- CLI command names/options are intentional user-facing contracts.
- Internal module boundaries are free to refactor and can break script imports silently.
- CLI invocation keeps behavior behind one owned boundary (`entry` + command wiring).

For repository automation longevity, this is a better abstraction layer.

## Suggested workflow patterns

### Pattern A: strict deterministic pipeline

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm build
- run: node openclaw.mjs agent --message "summarize this issue" --json
```

Use when reproducibility and artifact parity matter most.

### Pattern B: source-driven convenience pipeline

```yaml
- run: pnpm install --frozen-lockfile
- run: node scripts/run-node.mjs agent --message "summarize this issue" --json
```

Use when minimizing workflow complexity matters and auto-build behavior is desirable.

### Pattern C: mixed mode for large jobs

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm build
- run: node scripts/run-node.mjs status --all
- run: node scripts/run-node.mjs agent --message "triage PR" --json
```

Use when you want convenience wrappers but avoid repeated cold builds.

## Bottom-line recommendation

It is **viable and advisable** to use `scripts/run-node.mjs` as a GitHub Mode automation entrypoint when the objective is executing OpenClaw runtime behavior via the CLI contract instead of fragile internal imports.

For production-grade CI workflows, pair that with explicit `pnpm build` (or choose `openclaw.mjs` post-build) whenever full artifact parity and strict reproducibility are required.

This yields the best tradeoff between interface stability, runtime fidelity, and operational robustness.
