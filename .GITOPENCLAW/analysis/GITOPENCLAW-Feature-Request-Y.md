# [Feature]: Help Us Evaluate This Request with Concrete Use Cases and Tradeoffs

---

## Summary

Add per-channel default response prefix so agents can automatically distinguish persona context across messaging channels, eliminating misrouted follow-ups in multi-channel deployments.

---

## Problem to Solve

Agents cannot distinguish persona context in mixed channels, causing misrouted follow-ups.

When a single OpenClaw instance serves multiple messaging channels simultaneously — Telegram, Discord, Slack, Signal, iMessage, and others — agent replies carry no channel-identifying marker. This creates three categories of user pain:

### 1. Persona Confusion in Forwarded Messages

A user copies an agent reply from a work Slack into a personal Telegram thread. Without a channel-identifying prefix, participants in the Telegram thread cannot determine which context produced the response. Follow-up questions reference the wrong persona assumptions, and the agent has no mechanism to signal the mismatch.

### 2. Multi-Account Ambiguity

Users who run separate accounts on the same channel (e.g., a personal Telegram and a work Telegram) receive replies that look identical. There is no visual signal distinguishing which account-context the agent used to generate the response. This is especially problematic when the same agent serves both accounts with different routing rules via `src/routing/resolve-route.ts`.

### 3. Audit and Debugging Friction

When reviewing conversation logs across channels, there is no inline indicator of which channel or account produced each reply. Operators must cross-reference session files or routing metadata to reconstruct context — a manual process that does not scale.

### Why Current Behavior Is Insufficient

OpenClaw already implements a three-tier response prefix cascade (resolved in `src/agents/identity.ts`):

| Priority | Config Path | Scope |
|----------|-------------|-------|
| 1 (highest) | `channels.{channel}.accounts.{accountId}.responsePrefix` | Per-account on a specific channel |
| 2 | `channels.{channel}.responsePrefix` | All accounts on a specific channel |
| 3 (lowest) | `messages.responsePrefix` | Global default for all channels |

The template engine in `src/auto-reply/reply/response-prefix-template.ts` supports `{model}`, `{modelFull}`, `{provider}`, `{thinkingLevel}`, and `{identityName}` / `{identity.name}`. An `"auto"` value resolves to `[AgentName]`. Explicit empty string `""` stops the cascade.

However, gaps remain:

| Gap | Impact |
|-----|--------|
| **No `{channel}` or `{accountId}` template variable** | Users cannot write a single global template like `"[{channel}]"` that dynamically resolves per channel. Forces manual per-channel config duplication. |
| **No default prefix out of the box** | New installations ship with no `responsePrefix` at any level. Users must discover the feature by reading source code. |
| **`"auto"` ignores channel context** | Produces `[AgentName]` everywhere. In the common single-agent multi-channel case, every channel gets the same prefix — defeating the purpose. |
| **Undocumented prefix system** | The three-tier cascade, template variables, and `"auto"` behavior exist in code but lack user-facing documentation. |

---

## Proposed Solution

Support channels as first-class citizens in the response prefix template system.

### 1. Add `{channel}` and `{accountId}` Template Variables

Extend `resolveResponsePrefixTemplate()` in `src/auto-reply/reply/response-prefix-template.ts` to support:

| Variable | Resolves To | Example |
|----------|-------------|---------|
| `{channel}` | Normalized channel slug | `telegram`, `discord`, `slack` |
| `{accountId}` | Account identifier (empty string if default) | `work-slack`, `personal-tg` |

This enables a single global template that dynamically resolves per channel:

```json
{
  "messages": {
    "responsePrefix": "[{channel}] "
  }
}
```

Producing `[telegram]`, `[discord]`, `[slack]` — no per-channel config required.

A richer template combining identity and channel:

```json
{
  "messages": {
    "responsePrefix": "[{identity.name} · {channel}] "
  }
}
```

Produces `[Jarvis · telegram]`, `[Jarvis · discord]`, etc.

### 2. Introduce `"auto:channel"` Prefix Mode

Add a new `"auto:channel"` value that resolves to `[AgentName · channel]` when channel context is available, falling back to `[AgentName]` when it is not (e.g., CLI invocation). The existing `"auto"` value retains its current `[AgentName]` behavior for backward compatibility.

| Value | Resolves To |
|-------|-------------|
| `"auto"` | `[AgentName]` (unchanged) |
| `"auto:channel"` | `[AgentName · telegram]` (channel-aware) |

### 3. Ship a Sensible Default

Set the default `messages.responsePrefix` to `"auto"` for new installations so multi-channel deployments get persona disambiguation out of the box. Existing installations with explicit prefix config (including `""`) are unaffected due to the cascade's empty-string-stops-fallback behavior.

### 4. Document the Prefix System

Add a documentation section covering:

- The three-tier cascade (account → channel → global)
- All template variables (existing + new `{channel}`, `{accountId}`)
- The `"auto"` and `"auto:channel"` behaviors
- How to use `""` to suppress prefixes on specific channels
- Configuration examples for common multi-channel setups

---

## Use Cases

### Use Case 1: Single Agent, Multiple Channels

**Scenario:** A user runs one OpenClaw agent serving Telegram (personal), Slack (work), and Discord (community).

**Config:**
```json
{
  "messages": {
    "responsePrefix": "[{channel}]"
  }
}
```

**Result:** Replies on Telegram start with `[telegram]`, Slack with `[slack]`, Discord with `[discord]`. When a reply is forwarded or screenshotted, the channel origin is immediately visible.

### Use Case 2: Multiple Accounts on Same Channel

**Scenario:** A user has two Telegram accounts — personal and work — each paired to different agent personas via routing rules in `resolve-route.ts`.

**Config:**
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

**Result:** Personal Telegram replies start with `[Personal]`, work replies with `[Work · claude-opus-4-6]`.

### Use Case 3: Suppress Prefix on Specific Channels

**Scenario:** A user wants prefixes on all channels except iMessage (where brevity matters).

**Config:**
```json
{
  "messages": {
    "responsePrefix": "auto:channel"
  },
  "channels": {
    "imessage": {
      "responsePrefix": ""
    }
  }
}
```

**Result:** All channels get `[AgentName · channel]` except iMessage, which gets no prefix.

### Use Case 4: Organization with Extension Channels

**Scenario:** An org uses core channels plus extension channels (MS Teams via `extensions/msteams`, Matrix via `extensions/matrix`). Each should carry its channel name in the prefix.

**Config:**
```json
{
  "messages": {
    "responsePrefix": "[{identity.name} on {channel}] "
  }
}
```

**Result:** `[Jarvis on msteams]`, `[Jarvis on matrix]`, `[Jarvis on telegram]` — works uniformly across core and extension channels with no per-channel config.

---

## Tradeoffs

| Consideration | Pro | Con |
|---------------|-----|-----|
| **New template variables (`{channel}`, `{accountId}`)** | One global template serves all channels; eliminates per-channel config duplication | Adds 2 new variables to the interpolation context in `response-prefix-template.ts`; slightly more complex template resolution |
| **`"auto:channel"` mode** | Backward-compatible; users opt in to channel-aware auto-prefixes explicitly | Introduces a new config value format (`"auto:*"`); future values may need a more formal syntax |
| **Default prefix for new installs** | Better first-run experience for multi-channel deployments | Single-channel users see an unnecessary prefix; may feel noisy for minimal setups |
| **Documentation** | Users can discover and configure the feature without reading source code | Ongoing maintenance burden to keep docs in sync with code changes |

### Migration Risk

Using `"auto:channel"` as a new opt-in value (rather than changing the existing `"auto"` behavior) avoids breaking users who depend on the current `[AgentName]` format. No migration is required. Users who want channel-aware prefixes explicitly switch to `"auto:channel"` or use a `{channel}` template.

---

## Implementation Scope

| Component | Change | Effort |
|-----------|--------|--------|
| `src/auto-reply/reply/response-prefix-template.ts` | Add `{channel}` and `{accountId}` to template variable resolution | Small |
| `src/agents/identity.ts` | Add `"auto:channel"` resolution path alongside existing `"auto"` | Small |
| `src/channels/reply-prefix.ts` | Pass `channel` and `accountId` into prefix context | Small |
| Reply normalization call sites | Thread channel/accountId from routing context into prefix resolution | Small |
| Documentation (`docs/`) | New section on the prefix system with examples | Medium |
| Tests | Template variable tests for `{channel}`, `{accountId}`; `"auto:channel"` tests | Small |

**Total estimated effort:** Small-to-medium. Primarily additive changes to existing infrastructure. No breaking changes to current behavior.

---

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| **Per-channel system prompt injection** | System prompt controls agent behavior, not output formatting. Prefix is a presentation concern and should not consume prompt context window. |
| **Post-processing middleware** | Adds a new abstraction layer. The prefix cascade already exists in `identity.ts`; extending it is simpler and consistent with the current architecture. |
| **Client-side channel badges** | Only works for first-party UIs (web chat). Third-party channels (Telegram, Discord, Slack) cannot add metadata badges to message text. |
| **Change `"auto"` behavior directly** | Breaks backward compatibility for users who parse the current `[AgentName]` format. The `"auto:channel"` opt-in approach is safer. |
| **Do nothing** | The three-tier cascade exists but lacks the template variables needed to solve the stated problem without manual per-channel configuration. The gap is real. |

---

*Analysis generated 2026-03-03. Based on examination of `src/auto-reply/reply/response-prefix-template.ts`, `src/channels/reply-prefix.ts`, `src/agents/identity.ts`, `src/channels/channel-config.ts`, and `src/routing/resolve-route.ts`. Cross-referenced with the existing three-tier response prefix cascade and template variable system.*
