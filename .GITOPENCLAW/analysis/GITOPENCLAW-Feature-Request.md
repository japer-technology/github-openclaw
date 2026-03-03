# [Feature]: Help us evaluate this request with concrete use cases and tradeoffs.

---

## Summary

Add per-channel default response prefix.

---

## Problem to Solve

Agents cannot distinguish persona context in mixed channels, causing misrouted follow-ups.

When a single OpenClaw instance serves multiple messaging channels simultaneously—for example, Telegram for personal use, Slack for work, and Discord for community—agent replies carry no channel-specific context markers. This results in three concrete pain points:

1. **Persona confusion in forwarded messages.** A user copies an agent reply from one channel into another. Without a channel-identifying prefix, participants cannot tell which context produced the response, leading to follow-up questions that reference the wrong persona assumptions.

2. **Multi-account ambiguity.** Users who run separate accounts on the same channel (e.g., a personal Telegram and a work Telegram) receive visually identical replies. There is no signal distinguishing which account-context the agent used to generate the response.

3. **Audit and debugging friction.** When reviewing conversation logs across channels, there is no inline indicator of which channel or account produced each reply. Operators must cross-reference session files or routing metadata to reconstruct context.

### Why Current Behavior Is Insufficient

OpenClaw has a three-tier response prefix cascade:

| Priority | Config Path | Scope |
|----------|-------------|-------|
| 1 (highest) | `channels.{channel}.accounts.{accountId}.responsePrefix` | Per-account on a specific channel |
| 2 | `channels.{channel}.responsePrefix` | All accounts on a specific channel |
| 3 (lowest) | `messages.responsePrefix` | Global default for all channels |

The cascade supports template variables (`{model}`, `{provider}`, `{thinkingLevel}`, `{identity.name}`) and an `"auto"` value that resolves to `[AgentName]`. However, key gaps remain:

- **No `{channel}` or `{accountId}` template variable.** Users cannot create a single global template like `"[{channel}]"` that dynamically resolves per channel, forcing manual per-channel configuration.
- **No default prefix ships out-of-box.** New installations have no `responsePrefix` configured, so the feature must be discovered manually.
- **`"auto"` lacks channel context.** It produces `[AgentName]` identically across all channels, defeating its purpose in multi-channel deployments.

---

## Proposed Solution

Support channels with per-channel default response prefixes through the following changes:

### 1. Add `{channel}` and `{accountId}` Template Variables

Extend the template variable resolution to support:

| Variable | Resolves To | Example |
|----------|-------------|---------|
| `{channel}` | Normalized channel slug | `telegram`, `discord`, `slack` |
| `{accountId}` | Account identifier (or empty if default) | `work-slack`, `personal-tg` |

This enables a single global template:

```json
{
  "messages": {
    "responsePrefix": "[{channel}] "
  }
}
```

Which dynamically produces `[telegram]`, `[discord]`, `[slack]` per channel—no per-channel config required.

### 2. Enhance `"auto"` to Include Channel Context

When `responsePrefix` is `"auto"` and a channel context is available, resolve to `[AgentName · channel]` instead of `[AgentName]`:

| Current behavior | Proposed behavior |
|------------------|-------------------|
| `"auto"` → `[Jarvis]` (same everywhere) | `"auto"` → `[Jarvis · telegram]` (channel-aware) |

If no channel context is available (e.g., CLI invocation), fall back to the current `[AgentName]` behavior.

### 3. Ship a Sensible Default

Set the default `messages.responsePrefix` to `"auto"` for new installations so that multi-channel deployments get persona disambiguation out of the box. Existing installations with explicit prefix config (including `""`) are unaffected.

### 4. Document the Prefix System

Add documentation covering:

- The three-tier cascade (account → channel → global)
- All template variables (existing + new `{channel}`, `{accountId}`)
- The `"auto"` behavior and when it activates
- How to use `""` to suppress prefixes on specific channels
- Configuration examples for common multi-channel setups

---

## Use Cases

### Use Case 1: Single Agent, Multiple Channels

A user runs one OpenClaw agent serving Telegram (personal), Slack (work), and Discord (community).

```json
{
  "messages": {
    "responsePrefix": "[{channel}]"
  }
}
```

Replies on Telegram start with `[telegram]`, Slack with `[slack]`, Discord with `[discord]`.

### Use Case 2: Multiple Accounts on Same Channel

A user has two Telegram accounts—personal and work—each paired to different agent personas.

```json
{
  "channels": {
    "telegram": {
      "accounts": {
        "personal": { "responsePrefix": "[Personal]" },
        "work": { "responsePrefix": "[Work · {model}]" }
      }
    }
  }
}
```

### Use Case 3: Suppress Prefix on Specific Channels

A user wants prefixes on all channels except iMessage (where brevity matters).

```json
{
  "messages": { "responsePrefix": "auto" },
  "channels": {
    "imessage": { "responsePrefix": "" }
  }
}
```

---

## Tradeoffs

| Consideration | Pro | Con |
|---------------|-----|-----|
| **New template variables** | One global template serves all channels | Slightly more complex template resolution |
| **Enhanced `"auto"` behavior** | Multi-channel deployments work out of the box | Changes existing `"auto"` output format—could break users who depend on `[AgentName]` |
| **Default prefix for new installs** | Better first-run experience | Single-channel users see an unnecessary prefix |
| **Documentation** | Users can discover and configure the feature | Maintenance burden for keeping docs in sync |

### Migration Risk

The enhanced `"auto"` behavior changes output from `[AgentName]` to `[AgentName · channel]`. Mitigation options:

1. **Opt-in flag:** Add `"auto:channel"` as a new value alongside existing `"auto"` (safest).
2. **Version gate:** Change behavior only in a new release with a changelog entry.
3. **Accept the break:** The `"auto"` user base is likely small, and the new behavior is strictly more useful.

---

*Analysis generated 2026-03-03. Based on examination of the OpenClaw response prefix cascade, template variable system, and multi-channel routing architecture.*
