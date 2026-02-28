# GitHub Mode and `src/` usage: practical analysis

## Updated perspective (2026-02-19)

The original analysis below identified a real design tension: GitHub Mode was designed as a governance-only overlay that deliberately avoided `src/` imports. This made the mode structurally strong on policy/validation but unable to run the actual OpenClaw "magic" -- the agent execution, auto-reply orchestration, routing, tool policy, provider calls, and memory management that make openclaw useful.

**The fundamental insight is this:** GitHub Mode lives inside a **fork** of OpenClaw. The fork already has the complete `src/` tree. The entire purpose of the project is to run openclaw "as if installed" inside GitHub Actions -- without the install headache and with the benefits of duplication, swarms, and team collaboration. Prohibiting `src/` usage made this impossible.

The [ADR 0001 fork-context amendment](../adr/0001-runtime-boundary-and-ownership.md) resolves this by introducing a **fork-context execution path**: workflows build the openclaw runtime from `src/` (`pnpm install && pnpm build`) and invoke it for agent execution, command processing, routing, tool policy enforcement, and provider calls.

### How `src/` is now used

**Execution layer (fork-context, uses src):**

| Module | Source path | How GitHub Mode uses it |
| --- | --- | --- |
| Agent runner | `src/agents/` | Runs agent tasks, manages tool invocation, sandbox execution |
| Auto-reply | `src/auto-reply/` | Orchestrates model interaction, reply generation, conversation flow |
| Routing | `src/routing/` | Resolves which agent handles a given command or session |
| Tool policy | `src/agents/tool-policy.ts` | Enforces policy gates on tool usage during agent execution |
| Providers | `src/providers/` | Connects to model APIs (Anthropic, OpenAI, etc.) for inference |
| Security | `src/security/` | Runtime audit, tool policy validation, skill scanning |
| Config | `src/config/` | Loads, validates, and merges configuration |
| Memory | `src/memory/` | Manages conversation memory and agent context |
| Sessions | `src/sessions/` | Session state management for agent conversations |
| Plugins | `src/plugins/`, `src/plugin-sdk/` | Plugin loading, registration, and SDK |
| Hooks | `src/hooks/` | Internal event system for lifecycle events |
| Infrastructure | `src/infra/` | Environment handling, networking, process management |
| Shared types | `src/types/`, `src/shared/` | TypeScript declarations and shared interfaces |

**Governance layer (contract-driven, does NOT use src):**

| Component | Location | Why no src imports |
| --- | --- | --- |
| Contract validation | `.GITHUB-MODE/scripts/validate-github-runtime-contracts.ts` | Validates JSON schemas -- no runtime behavior needed |
| Security lint | `.GITHUB-MODE/scripts/github-mode-security-lint.ts` | Lints YAML workflows -- no runtime behavior needed |
| Drift detection | `.GITHUB-MODE/scripts/check-policy-drift.ts` | Compares contract files -- no runtime behavior needed |
| Trust authorization | `.GITHUB-MODE/scripts/enforce-trust-authorization.ts` | Evaluates trust levels from contracts -- no runtime behavior needed |
| Upstream guard | `.GITHUB-MODE/scripts/check-upstream-additions-only.ts` | File path checks -- no runtime behavior needed |

### Key constraints

1. **`.GITHUB-MODE` PRs must not modify `src/**` files.** Source changes are upstream-owned and sync separately. The `check-upstream-additions-only` script enforces this.
2. **Governance scripts remain contract-driven.** They validate contracts, lint workflows, and check policies without importing `src/`.
3. **Execution workflows build from source first.** `pnpm install && pnpm build` before any agent execution.
4. **Pre-agent security gates still apply.** Fork-context execution passes the same skill scan, lockfile/provenance, and policy evaluation gates.

---

## Original analysis (superseded by fork-context amendment above)

> The analysis below is preserved for historical context. It describes the previous governance-only approach that has been superseded.

### Your core concern

You are absolutely spotting a real design tension: when you inspect `.GITHUB-MODE`, you do **not** see it importing `/src` implementations, yet some docs talk about `src/**` concepts. That can make the mode feel "not deeply wired."

The important thing is this:

- **Previous implementation intent was boundary-first**: GitHub Mode did _not_ directly import installed runtime internals from `src/**`.
- **Previous implementation mechanics were contract/workflow-driven**: `.GITHUB-MODE/scripts`, `.GITHUB-MODE/runtime`, and `.github/workflows/github-mode-*` validated policy/contracts and orchestrated CI/runtime governance.

So GitHub Mode was previously designed more as a **governance/control plane overlay** than as a direct execution path into `src/**` code. The fork-context amendment above changes this.

---

### Where `src/**` appeared (and why)

#### 1) Boundary ownership docs (normative references)

`src/**` was referenced in architecture docs to define ownership boundaries, not to call code:

- `.GITHUB-MODE/README.md` said installed runtime internals stay in `src/**` and GitHub Mode should avoid coupling to those internals.
- ADR 0001 originally prohibited GitHub mode workflows/actions importing installed runtime internals from `src/**`.

These were **policy references**, not import statements.

#### 2) Guardrail scripts/tests that enforced "don't couple to src"

The script `.GITHUB-MODE/scripts/check-runtime-boundary-doc-consistency.ts` scans docs for phrases that imply direct `src/**` reuse and fails when wording conflicts with ADR 0001.

#### 3) Planning/analysis docs with mixed messages

Some docs (notably `.GITHUB-MODE/docs/overview.md`) mentioned potential reuse areas in `src/...` as conceptual capability anchors. Other analysis docs called this contradiction out explicitly.

---

### What was verified in code (at time of original analysis)

Import patterns were checked in GitHub Mode scripts/tests/workflows.

#### Result

- No `.GITHUB-MODE/scripts/**` or `github-mode-*` workflow logic directly imported from `src/**`.
- The only `src/**` hits in `.GITHUB-MODE/test/**` were test strings used to validate the boundary checker behavior.

---

### Why the governance-only approach felt incomplete

The mode was structurally strong on policy/validation but intentionally thin on direct runtime behavior reuse. Without executing the actual openclaw runtime, GitHub Mode could not deliver the "run as if installed" experience that is the core purpose of the project.

The fork-context amendment resolves this by allowing execution workflows to build and run `src/` directly.
