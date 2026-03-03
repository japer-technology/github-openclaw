# [Feature]: Help Us Evaluate This Request with Concrete Use Cases and Tradeoffs

---

## Summary

Add per-channel default response prefix.

---

## Problem to Solve

Agents cannot distinguish persona context in mixed channels, causing misrouted follow-ups.

When a single OpenClaw gateway serves multiple messaging channels—Telegram, Discord, Slack, Signal, iMessage, web—agent replies carry no inline marker identifying which channel produced them. This leads to three observable failures:

1. **Context collapse on forwarded messages.** A user copies an agent reply from Slack into a Telegram thread. Recipients cannot tell the response originated in a work context, so follow-up questions reference the wrong persona assumptions and produce incorrect answers.

2. **Account-level ambiguity.** Users running multiple accounts on the same channel (e.g., personal Telegram and work Telegram) receive visually identical replies. There is no signal distinguishing which account context the agent used.

3. **Operational debugging overhead.** Reviewing conversation logs across channels requires cross-referencing session files or routing metadata to determine which channel produced each reply. There is no inline audit trail.

### Why Current Behavior Is Insufficient

OpenClaw implements a three-tier response prefix cascade:

| Priority | Config Path | Scope |
|----------|-------------|-------|
| 1 (highest) | `channels.{channel}.accounts.{accountId}.responsePrefix` | Per-account on a specific channel |
| 2 | `channels.{channel}.responsePrefix` | All accounts on a specific channel |
| 3 (lowest) | `messages.responsePrefix` | Global default for all channels |

The cascade supports template variables (`{model}`, `{provider}`, `{thinkingLevel}`, `{identity.name}`) and an `"auto"` value that resolves to `[AgentName]`. An explicit empty string `""` stops the cascade at that level.

However, key gaps remain:

- **No `{channel}` or `{accountId}` template variable.** Users cannot write a single global template like `"[{channel}]"` that dynamically resolves per channel. Every channel requires manual configuration.
- **`"auto"` ignores channel context.** It resolves to `[AgentName]` everywhere. In the common single-agent, multi-channel setup, every channel gets the same prefix—defeating the purpose.
- **No default prefix ships out of the box.** New installations have no `responsePrefix` at any level. Users must discover the feature by reading source code.
- **No user-facing documentation.** The three-tier cascade, template variables, and `"auto"` behavior are undocumented.

---

## Proposed Solution

Support `channels.{channel}.responsePrefix` with new template variables and enhanced auto-resolution so that per-channel disambiguation works out of the box.

### 1. Add `{channel}` and `{accountId}` Template Variables

Extend `resolveResponsePrefixTemplate()` in `src/channels/response-prefix-template.ts` to support:

| Variable | Resolves To | Example |
|----------|-------------|---------|
| `{channel}` | Normalized channel slug | `telegram`, `discord`, `slack` |
| `{accountId}` | Account identifier (empty if default) | `work-slack`, `personal-tg` |

This enables a single global prefix that works across all channels:

```json
{
  "messages": {
    "responsePrefix": "[{channel}] "
  }
}
```

Produces `[telegram]`, `[discord]`, `[slack]` dynamically—no per-channel config needed.

A combined template:

```json
{
  "messages": {
    "responsePrefix": "[{identity.name} · {channel}] "
  }
}
```

Produces `[Jarvis · telegram]`, `[Jarvis · discord]`, etc.

### 2. Add `"auto:channel"` Resolution Mode

Introduce `"auto:channel"` alongside the existing `"auto"` to preserve backward compatibility:

| Value | Resolves To |
|-------|-------------|
| `"auto"` | `[AgentName]` (unchanged) |
| `"auto:channel"` | `[AgentName · channel]` (new) |

Users explicitly opt into channel-aware auto-prefixes without breaking existing configurations.

### 3. Ship a Default for New Installations

Set the default `messages.responsePrefix` to `"auto"` for new installations so that multi-channel deployments get persona disambiguation out of the box. Existing configurations (including explicit `""`) are unaffected by the cascade's empty-string-stops-fallback behavior.

### 4. Document the Prefix System

Add a documentation section covering:

- The three-tier cascade (account → channel → global)
- All template variables (existing + new `{channel}`, `{accountId}`)
- `"auto"` and `"auto:channel"` behavior
- Using `""` to suppress prefixes on specific channels
- Configuration examples for common multi-channel setups

---

## Use Cases

### Use Case 1: Single Agent, Multiple Channels

A user runs one OpenClaw agent across Telegram (personal), Slack (work), and Discord (community).

```json
{
  "messages": {
    "responsePrefix": "[{channel}] "
  }
}
```

Replies on Telegram show `[telegram]`, Slack shows `[slack]`, Discord shows `[discord]`. Forwarded messages carry channel origin inline.

### Use Case 2: Multiple Accounts on One Channel

A user has personal and work Telegram accounts tied to different agent personas.

```json
{
  "channels": {
    "telegram": {
      "accounts": {
        "personal": { "responsePrefix": "[Personal] " },
        "work": { "responsePrefix": "[Work · {model}] " }
      }
    }
  }
}
```

Personal replies show `[Personal]`. Work replies show `[Work · claude-opus-4-6]`.

### Use Case 3: Suppress Prefix on Specific Channels

A user wants prefixes everywhere except iMessage where brevity matters.

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

All channels get `[AgentName · channel]` except iMessage, which gets no prefix.

### Use Case 4: Dynamic Model Context per Channel

An operator wants channel and model context visible on high-stakes channels but minimal elsewhere.

```json
{
  "messages": {
    "responsePrefix": "[{channel}] "
  },
  "channels": {
    "slack": {
      "responsePrefix": "[{channel} · {model} · think:{thinkingLevel}] "
    }
  }
}
```

Slack shows `[slack · claude-opus-4-6 · think:high]`. All other channels show `[telegram]`, `[discord]`, etc.

---

## Tradeoffs

| Consideration | Pro | Con |
|---------------|-----|-----|
| **New template variables** | One global template serves all channels; eliminates per-channel manual config | Slightly more complex template interpolation; two new variables to maintain |
| **`"auto:channel"` mode** | Backward-compatible; users opt in explicitly | Two auto modes may confuse new users; documentation must be clear |
| **Default prefix for new installs** | Better multi-channel first-run experience | Single-channel users see a prefix they may not want; discoverable opt-out via `""` mitigates this |
| **Documentation** | Users can discover and configure the feature without reading source code | Ongoing maintenance to keep docs synchronized with code |

### Migration Risk

The `"auto:channel"` approach avoids breaking changes entirely—existing `"auto"` behavior is preserved. Users must explicitly switch to `"auto:channel"` to get channel-aware prefixes. This is the safest path.

---

## Implementation Scope

| Component | Change | Effort |
|-----------|--------|--------|
| `src/channels/response-prefix-template.ts` | Add `{channel}` and `{accountId}` to template variable resolution | Small |
| `src/agents/identity.ts` | Add `"auto:channel"` resolution path | Small |
| `ResponsePrefixContext` type | Add `channel` and `accountId` fields | Small |
| Reply normalization call sites | Pass `channel`/`accountId` into prefix context | Small |
| Documentation | New section on the prefix system | Medium |
| Tests | Template variable tests for `{channel}`, `{accountId}`; `"auto:channel"` tests | Small |

**Total estimated effort:** Small-to-medium. Primarily additive changes to existing infrastructure.

---

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| **Per-channel system prompt injection** | System prompt controls agent behavior, not output formatting. Prefix is a presentation concern. |
| **Post-processing middleware** | Adds a new abstraction layer. The prefix cascade already exists; extending it is simpler. |
| **Client-side channel badges** | Only works for first-party UIs. Third-party channels (Telegram, Discord) cannot add badges to message text. |
| **Do nothing** | The cascade exists but lacks the template variables needed to solve the problem without manual per-channel config. |

---

*Analysis generated 2026-03-03. Based on examination of `src/channels/reply-prefix.ts`, `src/channels/response-prefix-template.ts`, `src/agents/identity.ts`, `src/channels/channel-config.ts`, and `src/routing/resolve-route.ts`.*
