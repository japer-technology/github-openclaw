# GitHub Mode Source Access Design

## Purpose

This document consolidates and normalizes the two viability analyses into a single operating design for how GitHub Mode should execute OpenClaw behavior from repository source while preserving confidence, reproducibility, and governance.

Inputs synthesized:

- `.GITHUB-MODE/docs/analysis/cli-entrypoint-viability-for-github-mode.md`
- `.GITHUB-MODE/docs/analysis/src-entrypoint-viability-for-github-mode.md`

## Design goals

GitHub Mode should:

1. Execute real OpenClaw behavior from the current fork/repo state.
2. Remain durable under refactors (avoid brittle internal coupling).
3. Preserve confidence for merge/release decisions via reproducible parity checks.
4. Keep command invocation simple enough for automation authors.

## Entrypoint options considered

### Option A: `node scripts/run-node.mjs ...`

Behavior:

- Detects source/build staleness.
- Rebuilds with `pnpm exec tsdown --no-clean` when needed.
- Executes the CLI via `openclaw.mjs`.

Strengths:

- Stable command boundary.
- Good resilience to missing/stale `dist`.
- Platform-aware spawn behavior.
- Preserves CLI semantics without internal imports.

Limitations:

- Not equivalent to full `pnpm build` side effects.
- Slight nondeterminism from staleness heuristics.
- Requires `pnpm` availability at runtime.

### Option B: `node --import tsx src/entry.ts ...`

Behavior:

- Executes CLI command surface directly from TypeScript source.

Strengths:

- Truly source-native execution (no `dist` requirement).
- Fast iteration and low ceremony.
- Uses real CLI command routing from source.

Limitations:

- No implicit guarantee of generated build artifacts.
- Can diverge from packaged-install behavior.
- Runtime must be standardized to Node + tsx.

### Option C: `pnpm build` then `node openclaw.mjs ...`

Behavior:

- Explicit build pipeline followed by dist entrypoint execution.

Strengths:

- Strongest reproducibility.
- Best parity with installed/runtime package semantics.
- Most suitable for promotion and release gates.

Limitations:

- Highest ceremony/cost for short loops.

### Option D: direct internal imports (for example `runCli` adapter)

Behavior:

- Programmatically imports internal `src/**` modules from GitHub Mode scripts.

Strengths:

- Maximum in-process control.

Limitations:

- Highest refactor fragility.
- Easier to bypass bootstrap invariants by accident.
- Poor default choice for durable automation.

## Decision

Adopt a **dual-lane execution model** with explicit policy:

- **Lane A (source-native, default for GitHub automation):**
  - `node --import tsx src/entry.ts ...`
- **Lane B (parity/promotion required):**
  - `pnpm build`
  - `node openclaw.mjs ...`

Retain `node scripts/run-node.mjs ...` as a practical compatibility wrapper for workflows that want stale-safe behavior without strict full-build guarantees.

## Why this model is preferred

1. **Honest source access:** Lane A directly runs source for GitHub Mode orchestration.
2. **Controlled confidence:** Lane B enforces packaged/runtime parity before high-trust outcomes.
3. **Operational flexibility:** `run-node.mjs` remains available for convenience and transition.
4. **Refactor resilience:** subprocess CLI entrypoints are more stable than internal module imports.

## Policy and governance rules

### Rule 1: Explicit lane declaration

Each workflow/job invoking OpenClaw must declare lane intent in comments or step naming:

- `lane: source-native` (A)
- `lane: parity` (B)

### Rule 2: Promotion gates require Lane B

Any workflow that blocks merge/release, or claims install/runtime parity, must run Lane B at least once.

### Rule 3: Artifact-sensitive commands are parity-only

If a command depends on generated build artifacts or packaging-adjacent behavior, force Lane B.

### Rule 4: Avoid internal `src/**` imports for orchestration

GitHub Mode scripts should call process entrypoints, not import internal runtime modules, unless there is an explicit exception with rationale.

### Rule 5: Runtime standardization

For Lane A, use Node 22+ with `--import tsx`; do not assume Bun compatibility.

## Risk register and mitigations

1. **Generated artifact drift in Lane A**
   - Mitigation: maintain an allowlist of commands that require Lane B.

2. **Determinism concerns in convenience paths**
   - Mitigation: use Lane B for merge/release confidence and reproducible checks.

3. **Toolchain mismatch on runners**
   - Mitigation: bootstrap Node + pnpm consistently; ensure tsx availability via repo dependencies.

4. **Policy bypass**
   - Mitigation: keep pre-agent governance checks ahead of all lane execution.

5. **Long-term maintenance overhead**
   - Mitigation: avoid creating a second runtime stack; reuse existing CLI entrypoints.

## Recommended command patterns

### Source-native lane (default automation)

```bash
pnpm install --frozen-lockfile
node --import tsx src/entry.ts <command> <args>
```

### Parity lane (required gate)

```bash
pnpm install --frozen-lockfile
pnpm build
node openclaw.mjs <command> <args>
```

### Compatibility wrapper lane (optional convenience)

```bash
pnpm install --frozen-lockfile
node scripts/run-node.mjs <command> <args>
```

## Implementation notes for `.GITHUB-MODE`

- Update workflow templates to include lane labels and one-line rationale.
- Add a lightweight policy check that fails when parity-tagged jobs skip Lane B.
- Keep documentation explicit that Lane A is execution-valid but not packaging-parity-valid.

## Final position

GitHub Mode should treat **direct source execution** and **dist parity execution** as complementary, not competing, mechanisms.

- Use **Lane A** to maximize source-native agility.
- Use **Lane B** to establish release-confidence truth.
- Use `run-node.mjs` where stale-safe convenience is desirable and full-build parity is not mandatory.

This preserves speed, correctness, and governance simultaneously.
