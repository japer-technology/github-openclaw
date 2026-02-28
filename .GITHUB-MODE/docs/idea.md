# OpenClaw GitHub Mode: The Idea

OpenClaw GitHub Mode is the proposal that GitHub should act as a **first-class runtime plane** for OpenClaw, not just a CI wrapper around source code.

The intent is simple and strict:

- keep the installed runtime excellent and unchanged
- run meaningful assistant behavior directly from repository state
- make both planes feel like one product with one mental model

---

## 1) Why this matters

Today, OpenClaw already has mature runtime capabilities: orchestration loops, routing logic, tool policy gates, multi-channel behavior, and operational controls.

GitHub Mode extends this capability into repository workflows so teams can operate assistant behavior with software-grade governance:

- validate routing and policy contracts on every change
- replay and score behavior with deterministic artifacts
- run trusted command workflows from issue/PR surfaces
- produce auditable promotion evidence and incident traces
- improve safely without drifting from production semantics

This reframes CI/CD: not just build/test automation, but an environment where operational intelligence is continuously verified.

---

## 2) Product thesis: one capability model, two interaction loops

The core thesis is **capability convergence with interaction divergence**.

OpenClaw should provide the same task-level outcomes across both hosts whenever trust and host constraints allow:

1. on a user-controlled installed runtime (always-on channels, device integrations, long-lived sessions), and
2. in GitHub-hosted execution (checks, commands, evals, promotions, attestations).

Users should not relearn what OpenClaw can do per surface. They should, however, expect different pacing and UX mechanics depending on host.

### 2.1 Capability parity target

Parity target means **task parity**, not frame-by-frame UX parity.

At a minimum, both planes should be able to execute and evidence:

- policy/routing validation
- trusted command execution
- eval and regression checks
- artifact/report generation
- approval-gated promotion workflows
- incident/drift capture with reproducible traces

### 2.2 Non-parity by design: latency and UX mechanics

Interaction style differs by host and should remain explicit in docs and product language.

| Dimension            | Local synchronous loop (installed runtime)                  | GitHub asynchronous loop (GitHub Mode)                  |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Primary interaction  | conversational, turn-by-turn                                | command/event-driven, run-by-run                        |
| Feedback timing      | immediate streaming + inline follow-up                      | delayed by queueing, runner startup, job execution      |
| User control surface | terminal/app/channel session                                | issue/PR comments, checks, summaries, artifacts         |
| State continuity     | long-lived local session context                            | workflow-scoped context plus committed artifacts        |
| Best fit             | fast iteration, exploratory debugging, device-coupled tasks | governed automation, reviewable changes, team approvals |
| UX expectation       | tight loop and low interaction latency                      | auditable loop with higher end-to-end latency           |

The goal is not to hide this difference. The goal is to make it predictable while preserving capability coverage.

---

## 3) Architectural stance: reuse first, adapt only where needed

GitHub Mode should reuse OpenClaw’s existing runtime spine wherever possible:

- orchestration and reply loops
- tool invocation and policy enforcement
- routing behavior and safety contracts

GitHub-specific code should be a narrow overlay for host constraints:

- trust-aware GitHub ingress (issue comments, PR comments, dispatch, schedule)
- adapter layer for repo writes, simulation, replay, and artifact generation
- evidence-first egress (checks, summaries, comments, bot PRs, attestations)

This keeps behavior fidelity high and reduces parallel implementation risk.

---

## 4) Scope clarity: what GitHub Mode is and is not

### In scope

- pull request validation and contract enforcement
- command-driven automation with trust and policy gates
- eval/cost/latency threshold checks
- promotion workflows with approval + attestation requirements
- drift and incident workflows that produce durable evidence

### Out of scope (initially)

- replacing persistent installed channel session handling
- exposing device-bound hardware actions in untrusted workflows
- bypassing GitHub-native security primitives with custom secret systems

The design is additive: installed runtime remains the authority for local, persistent, device-coupled behavior.

---

## 5) Repository as control plane

GitHub Mode treats repository contracts as operational APIs:

- `routing/` for behavior paths
- `policies/` for safety boundaries
- `agents/` for profile/tool scope
- `datasets/` and `eval/` for quality and regression measurement
- `attestations/` for promotion evidence
- `.GITHUB-MODE/runtime/` for mode-specific manifests and policy contracts

When these contracts are versioned, reviewed, and validated in CI, changes to behavior become explicit, governable, and auditable.

---

## 6) Trust and safety are foundational, not optional

GitHub Mode must be secure-by-construction:

- least-privilege workflow permissions
- strict separation of trusted vs untrusted execution contexts
- no secrets in logs, artifacts, or untrusted trigger paths
- policy-gated privileged adapters
- provenance metadata attached to all actionable outputs

The result: command power scales with trust level, and every privileged action is explainable after the fact.

---

## 7) The collaboration horizon: multi-entity OpenClaw

Beyond single-repo automation, GitHub Mode enables repeatable multi-entity collaboration.

Each OpenClaw entity can be scaffolded with baseline governance (templates, labels, CODEOWNERS, policies, workflow contracts), then participate in deny-by-default cross-entity exchanges using validated envelopes and auditable traces.

This turns collaboration from ad hoc scripting into governed protocol.

---

## 8) Success definition

GitHub Mode succeeds when teams can say:

- "Our CI behavior matches runtime semantics we trust."
- "Policy, routing, and eval drift are caught before release."
- "Promotions are approval-gated and evidence-backed by default."
- "Incidents auto-capture enough context to shorten recovery time."
- "Installed and GitHub surfaces have comparable capability coverage with clearly different interaction loops."

That is the idea: **OpenClaw operated as a continuously verified intelligence system, with GitHub as a full runtime plane and the installed runtime as its durable local counterpart.**
