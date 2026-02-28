# What GitHub Mode Should Not Handle

This document defines high-confidence boundaries for GitHub Mode.

The goal is not to shrink capability. The goal is to keep GitHub Mode in the task classes where its strengths apply: governance, auditability, repeatability, and team review.

## Boundary framing

Use this simple decision test:

1. Does the task require immediate interactive feedback in seconds?
2. Does it require a device-local capability that a GitHub runner cannot safely or reliably access?
3. Is the blast radius high enough that human approval should be mandatory before execution?
4. Does it require secrets or identity material that should never leave a local secure boundary?

If the answer is "yes" to one or more items, the task is likely `installed-only` or `handoff-required`, not a GitHub Mode direct execution.

## Task classes that should stay outside GitHub Mode

### 1) Real-time conversational loops and live operator steering

GitHub workflows are asynchronous and queue-based. They should not be treated as a replacement for fast, back-and-forth debugging sessions, live pair-programming loops, or low-latency terminal assistance.

Keep these in installed runtime channels where sub-minute iteration and uninterrupted context continuity matter.

### 2) Device-coupled operations

Tasks that require direct access to local hardware, local IPC surfaces, or user-attached peripherals should remain installed-only. Examples include local camera/mic workflows, local desktop automation, and host-specific tunnel/process orchestration.

A runner can emulate parts of these tasks, but emulation should not be mislabeled as equivalent execution.

### 3) Privileged external side effects without human checkpoints

GitHub Mode should not execute high-stakes external mutations end-to-end without explicit policy gates and human approvals.

Examples include:

- production infrastructure deletion or irreversible data mutation,
- financial/payment actions,
- identity or account lifecycle changes,
- security-sensitive policy rewrites.

For these classes, GitHub Mode may prepare plans and artifacts, but final execution should remain gated to approved humans or controlled downstream systems.

### 4) Secrets regimes that exceed repository trust boundaries

If a task requires secret material that cannot be scoped safely through GitHub Environments, OIDC, and least-privilege workflow permissions, that task should not run in GitHub Mode.

Do not migrate sensitive local-only credentials into repository automation purely for convenience.

### 5) Long-lived mutable runtime state with strict continuity requirements

GitHub runners are ephemeral. Tasks needing stable, low-latency, continuously mutating in-memory state across long sessions should not assume direct runner execution.

For these cases, use explicit state backends and resumable contracts; otherwise keep execution in installed runtime surfaces.

### 6) Untrusted-trigger pathways with high-impact tools

Untrusted contributors must never be able to invoke privileged adapters, secret-backed steps, or protected-branch write paths. If a workflow shape makes this difficult to enforce reliably, do not expose that command in GitHub Mode.

Security posture should prefer refusal over partial unsafe execution.

### 7) Organization governance actions that require accountability identity

Some actions are more about accountable authority than automation speed (for example compliance sign-off, legal approvals, release authority assertions). GitHub Mode can gather evidence and draft artifacts, but human identity-bound approval should remain explicit and non-delegated.

## Recommended operating pattern

For each command family in `.GITHUB-MODE/runtime/command-policy.json`, assign one of:

- `github-native`: safe and effective to execute in GitHub Mode.
- `github-gated`: executable only with trust/environment gates and required approvals.
- `handoff-required`: GitHub Mode may analyze/prepare, but final action happens outside GitHub Mode.
- `installed-only`: intentionally outside GitHub Mode scope.

This classification keeps parity discussions concrete and prevents accidental expansion into unsafe or poor-fit execution classes.
