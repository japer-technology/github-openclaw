# GitHub Mode Issue Loop MVP (Inspired by gitclaw)

This design translates the strongest implementation ideas from `gitclaw-a-simple-example.md` into OpenClaw GitHub Mode constraints.

## Why this MVP exists

GitHub Mode already has strong command + bot-PR workflows, but it still lacks a minimal issue-native conversational loop with durable session resume.

A compact issue loop gives OpenClaw three immediate benefits:

1. Faster contributor onboarding (`issues` and `issue_comment` are universal surfaces).
2. Durable memory between ephemeral runners using repository-backed metadata.
3. A clean bridge into the existing trusted command and bot-PR flow.

## MVP shape

### Triggers

- `issues.opened`
- `issue_comment.created`

Gate execution using trust levels already defined in `.GITHUB-MODE/runtime/trust-levels.json` and policy contracts in `.GITHUB-MODE/runtime/command-policy.json`.

### UX signaling pattern

Use the same lightweight progress signal pattern as gitclaw:

- Add an `eyes` reaction at run start on the triggering issue/comment.
- Persist cleanup metadata to a temporary file.
- Remove reaction in a guaranteed `finally` cleanup path.

This aligns with Phase 4 checkpoint visibility while keeping notification noise low.

### Durable state model (MVP)

Use a repository-backed state directory for deterministic resume:

- `state/issues/<issue-number>.json` → pointer to latest session artifact
- `state/sessions/<session-id>.jsonl` → serialized session transcript/events

Resume policy:

1. If issue pointer exists and target session exists, resume.
2. Otherwise start new session.
3. After each run, atomically update issue pointer to the latest session path.

### Agent execution bridge

Run through existing OpenClaw runtime components (not a parallel runtime):

- Route command/event through GitHub Mode pre-agent gates.
- Invoke the existing agent execution path from `src/agents/` + `src/auto-reply/`.
- Emit provenance metadata per Phase 4 requirements.

### Branch mutation policy

Keep current guardrail:

- state persistence and code changes still flow through bot branch + PR when mutation is required.
- no privileged direct writes to protected branches.

## Integration points with current plan

- Phase 4 Task 4.1: add issue-loop workflow trigger + routing entrypoint.
- Phase 4 Task 4.6: map reaction lifecycle into checkpointed status transitions.
- Phase 4 Task 4.7: treat git-backed issue/session mapping as Tier-0 persistence before larger storage adapters.

## Non-goals for this MVP

- No replacement of long-lived installed runtime channel sessions.
- No custom secret store.
- No bypass of trust/policy gates.
- No direct privileged branch writes.
