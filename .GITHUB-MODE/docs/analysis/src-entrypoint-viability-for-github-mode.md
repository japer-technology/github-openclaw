# Viability Analysis: executing `src/**` directly for GitHub Mode

## Executive summary

**Short answer:** Executing `src/**` directly is viable, but only if GitHub Mode is explicit about **which direct-entry strategy** it is using and what guarantees are being traded away versus the current CLI-dist entrypoint approach.

Compared with `scripts/run-node.mjs` (which builds then runs `openclaw.mjs`), direct `src/**` execution can reduce bootstrap friction and improve dev-time velocity, but it introduces contract risks around runtime parity, build-artifact side effects, and deterministic CI behavior.

The most credible “direct src” strategy for GitHub Mode is:

1. Run TypeScript entry with Node + tsx (`node --import tsx src/entry.ts ...`).
2. Treat this as a **fast-path execution mode** for GitHub-run orchestration.
3. Keep `pnpm build` + dist/CLI execution as the **parity/verification path**.

That gives GitHub Mode a two-lane model:

- **Lane A (fast, source-native):** direct `src` execution for iteration and lower ceremony.
- **Lane B (release-parity):** dist execution for deterministic and packaging-adjacent checks.

## What `.GITHUB-MODE` is trying to achieve (interpreted)

The docs already frame GitHub Mode as fork-context execution of real OpenClaw behavior with governance wrappers, not a separate reimplementation. That implies three practical goals:

1. Reuse real runtime behavior from the repository state.
2. Keep automation durable across refactors.
3. Preserve enough parity with installed/runtime semantics to trust outcomes.

The current `run-node.mjs` analysis focuses on goal (2) and (3) via the CLI boundary. A direct-`src/**` approach prioritizes goal (1) and execution immediacy.

## Baseline behavior observed in this repo

### A) Current CLI/dist path

- `openclaw.mjs` only loads from `dist/entry.(m)js`; if dist is absent, it errors.
- `scripts/run-node.mjs` checks staleness, runs `pnpm exec tsdown --no-clean` if needed, then launches `openclaw.mjs`.

This gives a resilient command boundary but keeps execution dist-mediated.

### B) Direct source entrypoint behavior

Running:

```bash
node --import tsx src/entry.ts --help
```

works and boots the full CLI command surface directly from source.

This validates that GitHub Mode can execute core CLI behavior without prebuilt dist artifacts.

### C) Bun direct execution caveat

Running:

```bash
bun src/entry.ts --help
```

fails in this environment because runtime-guard logic expects Node semantics/version and sees Bun’s exec path/version shape as unsupported.

Implication: direct-src viability is strongest with **Node + tsx**, not generic “any TS runtime”.

## Alternative direct-`src/**` execution strategies

## 1) Direct CLI entry (`src/entry.ts`) via Node + tsx

**Command form:**

```bash
node --import tsx src/entry.ts <args>
```

### Pros

- Executes repo source directly (no dist dependency).
- Reuses existing CLI orchestration, routing, policy gates, env normalization, and respawn behavior.
- Reduces build gate overhead in short-lived or single-command workflows.

### Cons

- No guarantee that full build side-effects are present (plugin SDK d.ts, copied metadata/templates, compat shims, build-info outputs).
- Behavior can diverge from shipped packaging path when runtime depends on generated artifacts.
- Slightly higher runtime loader/transpile overhead per invocation than pure dist JS.

### Viability

**High** for command-driven GitHub Mode tasks that do not require full packaging artifacts.

## 2) Programmatic import of `src/cli/run-main.ts` in a thin GitHub adapter

**Command form (conceptual):**

```ts
import { runCli } from "../src/cli/run-main.ts";
await runCli(["node", "openclaw", ...args]);
```

### Pros

- Maximum control over argv shaping, logging, telemetry envelopes, retries, and trust-policy wrapping.
- Avoids shell/process indirection and can expose richer run metadata.

### Cons

- Tighter coupling to internal API shape than entrypoint execution.
- More brittle under refactors than launching `src/entry.ts` as a process.
- Risks bypassing startup invariants implemented in entrypoint bootstrap (if not carefully mirrored).

### Viability

**Medium**; useful only when GitHub Mode needs deep in-process orchestration that subprocess CLI calls cannot provide.

## 3) Dist-less dedicated GitHub entrypoint under `src/` (new file)

**Command form (conceptual):**

```bash
node --import tsx src/github-mode/entry.ts <args>
```

### Pros

- Can codify GitHub-specific lifecycle checkpoints (queued/provisioning/running/waiting/completed/failed) at runtime edge.
- Keeps source-direct execution while reducing dependence on generic CLI UX assumptions.

### Cons

- New maintenance surface and potential duplicate bootstrap logic.
- If not carefully architected, creates the “second runtime” problem GitHub Mode wants to avoid.

### Viability

**Medium-high** only if implemented as a thin wrapper over existing CLI/agent services, not a parallel command stack.

## 4) Keep current model (`run-node.mjs`) and call it “direct enough”

This is not strict direct-src execution, but in practice it rebuilds from source and routes through canonical CLI entry.

### Pros

- Strong interface stability and low refactor fragility.
- Already established; no new execution policy needed.

### Cons

- Still dist-mediated.
- Cold-start build cost and staleness checks add overhead/noise.

### Viability

**Very high** operationally, but does not satisfy a strict “execute `src/**` directly” requirement.

## Decision matrix

| Criterion                 | `node --import tsx src/entry.ts` | `import runCli()` adapter | new `src/github-mode/entry.ts` | `scripts/run-node.mjs` |
| ------------------------- | -------------------------------- | ------------------------- | ------------------------------ | ---------------------- |
| Direct source execution   | Strong                           | Strong                    | Strong                         | Partial                |
| Refactor resilience       | Medium-high                      | Medium-low                | Medium                         | High                   |
| Installed-path parity     | Medium                           | Medium-low                | Medium                         | High                   |
| Build artifact parity     | Low-medium                       | Low-medium                | Low-medium                     | Medium-high            |
| CI determinism            | Medium                           | Medium                    | Medium                         | Medium-high            |
| GitHub-mode telemetry fit | Medium                           | High                      | High                           | Medium                 |
| Adoption cost             | Low                              | Medium                    | Medium-high                    | Already adopted        |

## Key architectural insight

If GitHub Mode’s priority is “run OpenClaw behavior from fork source in workflows,” then **direct `src/entry.ts` execution is the cleanest honest mechanism**.

If the priority is “keep long-lived stability and release-path confidence,” then dist/CLI entry remains safer.

Therefore the best architecture is **dual-lane, policy-selected execution**, not a forced single path.

## Recommended operating model for GitHub Mode

## Lane A: Source-native execution (default for GitHub automation)

Use:

```bash
node --import tsx src/entry.ts <command>
```

for:

- issue/PR command handling
- orchestration tasks
- policy-gated assistant runs
- replay/eval flows where build side-effects are not required

## Lane B: Dist parity execution (required gates)

Use:

```bash
pnpm build
node openclaw.mjs <command>
```

for:

- release-critical checks
- compatibility assertions tied to packaged artifacts
- any workflow validating “what users install/run” semantics

## Promotion rule

A pragmatic governance rule:

- **Untrusted/iterative tasks:** Lane A allowed.
- **Promotion/merge/release blockers:** must pass Lane B at least once.

This aligns with GitHub Mode’s governance goals without sacrificing source-direct agility.

## Risks unique to direct `src/**` execution and mitigations

1. **Generated-artifact drift** (dist-less run misses build side-effects)
   - Mitigation: explicit artifact-requiring command allowlist that forces Lane B.

2. **Refactor breakage in direct imports** (if using programmatic adapters)
   - Mitigation: prefer subprocess invocation of `src/entry.ts` over in-process internal imports.

3. **Runtime engine mismatch** (Bun/etc)
   - Mitigation: standardize GitHub Mode execution runtime to Node 22.12+ with `--import tsx`.

4. **Signal/exit-code handling differences across wrappers**
   - Mitigation: keep a tiny launcher shim that forwards stdio/signals and normalizes exits.

5. **Policy bypass concerns**
   - Mitigation: ensure pre-agent gates in `.GITHUB-MODE/scripts/*` execute before any Lane A or Lane B command.

## Concrete recommendation

Adopt direct source execution as a first-class GitHub Mode method using:

```bash
node --import tsx src/entry.ts ...
```

but treat it as **execution mode**, not **parity guarantee**.

Keep dist-based CLI execution as the promotion/parity lane and make the lane choice explicit in workflow policy.

This gives `.GITHUB-MODE` what it is trying to achieve:

- real runtime behavior from source,
- strong governance/audit boundaries,
- and explicit confidence tiers for when dist parity is required.
