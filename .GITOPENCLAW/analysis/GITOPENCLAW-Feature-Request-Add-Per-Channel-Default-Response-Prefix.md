# [Feature]: Add Per-Channel Default Response Prefix

Help us evaluate this request with concrete use cases and tradeoffs.

---

## Summary

Add per-channel default response prefix so that each messaging channel (Telegram, Discord, Slack, Signal, iMessage, etc.) can automatically prepend a distinguishing tag to agent replies—enabling persona-aware routing and reducing misrouted follow-ups in multi-channel deployments.

---

## Problem to Solve

Agents cannot distinguish persona context in mixed channels, causing misrouted follow-ups.

When a single OpenClaw instance serves multiple channels simultaneously—for example, a work Slack, a personal Telegram, and a family Discord—replies lack channel-specific context markers. This creates three concrete user pain points:

1. **Persona confusion in forwarded messages.** A user copies an agent reply from Slack into a Telegram thread. Without a channel-identifying prefix, other participants cannot tell which context produced the response. Follow-up questions reference the wrong persona assumptions.

2. **Multi-account ambiguity.** Users who run separate accounts on the same channel (e.g., a personal Telegram and a work Telegram) receive replies that look identical. There is no visual signal distinguishing which account-context the agent used to generate the response.

3. **Audit and debugging friction.** When reviewing conversation logs across channels, there is no inline indicator of which channel or account produced each reply. Operators must cross-reference session files or routing metadata to reconstruct context.

### Why Current Behavior Is Insufficient

OpenClaw **already has** a three-tier response prefix cascade:

| Priority | Config Path | Scope |
|----------|-------------|-------|
| 1 (highest) | `channels.{channel}.accounts.{accountId}.responsePrefix` | Per-account on a specific channel |
| 2 | `channels.{channel}.responsePrefix` | All accounts on a specific channel |
| 3 (lowest) | `messages.responsePrefix` | Global default for all channels |

The cascade supports template variables (`{model}`, `{provider}`, `{thinkingLevel}`, `{identity.name}`), an `"auto"` value that resolves to `[AgentName]`, and explicit empty string `""` to stop the cascade (preventing global fallback).

However, the **current implementation has gaps** that prevent this feature from fully solving the stated problem:

| Gap | Impact |
|-----|--------|
| **No channel-name template variable.** Templates support `{model}`, `{provider}`, `{thinkingLevel}`, and `{identity.name}`, but there is no `{channel}` or `{accountId}` variable. Users cannot create a single global prefix template like `"[{channel}]"` that dynamically resolves per channel. | Forces manual per-channel config instead of one template. |
| **No default prefix ships out-of-box.** New installations have no `responsePrefix` configured at any level. Users must discover the feature and manually configure it. | First-run experience lacks persona disambiguation. |
| **"auto" only resolves to identity name.** The `"auto"` value produces `[AgentName]` but does not incorporate channel or account context. In multi-channel deployments where the same agent serves all channels, `"auto"` produces identical prefixes everywhere. | Defeats the purpose for the common single-agent multi-channel case. |
| **No documentation of the full prefix system.** The three-tier cascade, template variables, and `"auto"` behavior are implemented in code but not documented in the user-facing docs. | Users cannot discover or configure the feature without reading source code. |

---

## Proposed Solution

### 1. Add `{channel}` and `{accountId}` Template Variables

Extend `resolveResponsePrefixTemplate()` in `src/channels/response-prefix-template.ts` to support two new variables:

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

A richer template combining identity and channel:

```json
{
  "messages": {
    "responsePrefix": "[{identity.name} · {channel}] "
  }
}
```

Produces `[Jarvis · telegram]`, `[Jarvis · discord]`, etc.

### 2. Enhance `"auto"` to Include Channel Context

When `responsePrefix` is `"auto"` and a channel context is available, resolve to `[AgentName · channel]` instead of just `[AgentName]`:

| Current behavior | Proposed behavior |
|------------------|-------------------|
| `"auto"` → `[Jarvis]` (same everywhere) | `"auto"` → `[Jarvis · telegram]` (channel-aware) |

If no channel context is available (e.g., CLI invocation), fall back to the current `[AgentName]` behavior.

### 3. Ship a Sensible Default

For new installations or when no prefix is configured, consider setting the default `messages.responsePrefix` to `"auto"` so that multi-channel deployments get persona disambiguation out of the box. Existing installations with explicit prefix config (including `""`) are unaffected due to the cascade's empty-string-stops-fallback behavior.

### 4. Document the Prefix System

Add a documentation section covering:

- The three-tier cascade (account → channel → global)
- All template variables (existing + new `{channel}`, `{accountId}`)
- The `"auto"` behavior and when it activates
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

**Scenario:** A user has two Telegram accounts—personal and work—each paired to different agent personas.

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
    "responsePrefix": "auto"
  },
  "channels": {
    "imessage": {
      "responsePrefix": ""
    }
  }
}
```

**Result:** All channels get `[AgentName · channel]` except iMessage, which gets no prefix.

---

## Tradeoffs

| Consideration | Pro | Con |
|---------------|-----|-----|
| **New template variables** | One global template serves all channels; no per-channel config needed | Slightly more complex template resolution; adds 2 new variables to the interpolation context |
| **Enhanced `"auto"` behavior** | Multi-channel deployments work correctly out of the box | Changes existing `"auto"` output format—could break users who depend on the current `[AgentName]` format |
| **Default prefix for new installs** | Better first-run experience for multi-channel users | Single-channel users see an unnecessary prefix; may feel noisy |
| **Documentation** | Users can discover and configure the feature | Maintenance burden for keeping docs in sync with code |

### Migration Risk

The enhanced `"auto"` behavior changes the output format from `[AgentName]` to `[AgentName · channel]`. For users who have `"auto"` configured and parse the prefix programmatically, this is a breaking change. Mitigation options:

1. **Opt-in flag:** Add `"auto:channel"` as a new value alongside existing `"auto"` (which keeps its current behavior).
2. **Version gate:** Change `"auto"` behavior only in a new major/minor release with a changelog entry.
3. **Accept the break:** The current `"auto"` user base is likely small, and the new behavior is strictly more useful.

**Recommendation:** Option 1 (`"auto:channel"`) is safest. Users explicitly opt into channel-aware auto-prefixes.

---

## Implementation Scope

| Component | Change | Effort |
|-----------|--------|--------|
| `src/channels/response-prefix-template.ts` | Add `{channel}` and `{accountId}` to template variable resolution | Small |
| `src/agents/identity.ts` | Add `"auto:channel"` resolution path | Small |
| `ResponsePrefixContext` type | Add `channel` and `accountId` fields | Small |
| Reply normalization call sites | Pass channel/accountId into prefix context | Small |
| Documentation | New section on prefix system | Medium |
| Tests | Template variable tests for `{channel}`, `{accountId}`; `"auto:channel"` tests | Small |

**Total estimated effort:** Small-to-medium. Primarily additive changes to existing infrastructure.

---

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| **Per-channel system prompt injection** | Heavier; system prompt is for agent behavior, not output formatting. Prefix is a presentation concern. |
| **Post-processing middleware** | Adds a new abstraction layer. The prefix cascade already exists; extending it is simpler. |
| **Client-side channel badges** | Only works for first-party UIs (web chat). Third-party channels (Telegram, Discord) cannot add badges to message text. |
| **Do nothing** | The three-tier cascade exists but lacks the template variables needed to solve the stated problem without manual per-channel configuration. |

---

*Analysis generated 2026-03-03. Based on examination of `src/channels/reply-prefix.ts`, `src/channels/response-prefix-template.ts`, `src/agents/identity.ts`, `src/channels/channel-config.ts`, and `src/routing/resolve-route.ts`. Cross-referenced with the existing three-tier response prefix cascade and template variable system.*
