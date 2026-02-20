# Where The LM Magic Lives

This is a focused map of the directories that drive model reasoning, tool use, context building, and reply delivery.

## Core Execution Path

1. `src/auto-reply/reply`
   Receives normalized inbound context, applies directives and model overrides, runs media/link enrichment, and decides how to execute a reply.
2. `src/agents/pi-embedded-runner`
   The main runtime loop for model calls. Builds the session, system prompt, tool set, and streams/collects model output.
3. `src/agents/tools` and `src/agents/pi-tools.ts`
   Defines the callable tool surface (exec, web, messaging, memory, gateway, sessions, etc.) and tool policy filtering.
4. `src/auto-reply/reply` plus `src/channels`/`src/gateway`
   Converts model/tool output into user-visible messages and routes them to chat channels or gateway clients.

## Pivotal Directories

| Directory                       | Why it is pivotal                                                                      | What you will find                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/auto-reply`                | Main orchestration entry for inbound messages and reply production.                    | Dispatch, command authorization, reply routing, typing and chunking behavior.                             |
| `src/auto-reply/reply`          | Highest-impact orchestration layer for the assistant loop.                             | `get-reply.ts`, directive handling, session initialization, `get-reply-run.ts`, agent run wiring.         |
| `src/agents`                    | Brainstem for model/provider selection, auth, fallbacks, context, and runtime helpers. | `model-selection.ts`, `model-auth.ts`, `model-fallback.ts`, skills/context helpers, tool policy plumbing. |
| `src/agents/pi-embedded-runner` | Execution engine that actually runs model turns.                                       | Run lifecycle, prompt construction, tool schema prep, session/history controls, streaming attempt logic.  |
| `src/agents/tools`              | Concrete tool implementations exposed to models.                                       | Messaging actions, web tools, browser/canvas tools, gateway/session tools, memory tool adapters.          |
| `src/memory`                    | Long-term recall/indexing core used by memory tools.                                   | Embeddings providers, sqlite/sqlite-vec indexing, sync/search managers, hybrid retrieval logic.           |
| `src/media-understanding`       | Multimodal preprocessing before agent execution.                                       | Image/audio/video/file extraction, provider adapters, formatting into model-ready context.                |
| `src/link-understanding`        | URL/content ingestion that enriches user prompts.                                      | Link fetch/parse/apply path used during reply preparation.                                                |
| `src/routing`                   | Session key and route resolution for multi-channel message flow.                       | Route binding resolution, session key construction, account/peer mapping.                                 |
| `src/channels`                  | Channel abstraction and plugin-backed outbound/inbound behavior.                       | Normalization, allowlist/pairing gates, outbound adapter loading, channel plugin coordination.            |
| `src/gateway`                   | Server/API/event bridge for UI, app clients, and remote control flows.                 | WS server handlers (`chat`, `agent`, `sessions`, `models`, etc.), protocol schemas, event fanout.         |
| `src/plugins`                   | Extension runtime and registry that injects tools/channels/hooks.                      | Active registry state, runtime loader integration, plugin wiring.                                         |
| `src/plugin-sdk`                | Stable contract surface for extension authors.                                         | Re-exported types/helpers for channel plugins, tools, gateway handlers, config schemas.                   |
| `extensions/llm-task`           | Example of extension-defined LLM execution pattern.                                    | Tool that runs JSON-only model tasks via embedded runner.                                                 |
| `extensions/memory-core`        | Plugin-provided memory tool registration on top of core runtime.                       | Memory search/get tool registration and memory CLI integration.                                           |
| `extensions/memory-lancedb`     | Alternative long-term memory backend implementation.                                   | LanceDB vector store plugin, embedding integration, auto-capture heuristics.                              |
| `ui/src/ui`                     | Control-plane frontend that drives gateway chat/agent workflows.                       | Gateway client wiring, chat/tool stream handling, settings/session views.                                 |
| `apps/shared/OpenNipperKit`     | Shared Apple client logic for protocol/chat/tool UX.                                   | Shared protocol models, chat UI components, gateway client behavior.                                      |
| `vendor/a2ui`                   | Canvas rendering/spec substrate used by model-produced structured UI data.             | A2UI specification and renderer code used by canvas-related features.                                     |

## Secondary But Important

| Directory                                                                                           | Role                                                                               |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/commands`                                                                                      | CLI command handlers that invoke the same agent runtime and gateway methods.       |
| `src/sessions`                                                                                      | Session policy/metadata behavior that affects continuity, delivery, and overrides. |
| `src/telegram`, `src/discord`, `src/slack`, `src/signal`, `src/imessage`, `src/web`, `src/whatsapp` | Channel-specific monitors and adapters feeding/consuming the same reply pipeline.  |
| `extensions/*` (channel packages)                                                                   | Extra channel integrations and provider/auth plugins that extend runtime behavior. |

## Practical Navigation Order

1. Start with `src/auto-reply/reply/get-reply.ts`.
2. Follow into `src/auto-reply/reply/get-reply-run.ts`.
3. Jump to `src/agents/pi-embedded-runner/run.ts` and `src/agents/pi-embedded-runner/run/attempt.ts`.
4. Inspect `src/agents/pi-tools.ts`, `src/agents/opennipper-tools.ts`, and `src/agents/tools/*`.
5. Read `src/memory/*` and `src/media-understanding/*` for context enrichment.
6. Finish with `src/channels/*`, `src/routing/*`, and `src/gateway/server-methods/*` to understand delivery.

## One-Line Mental Model

`auto-reply` decides what to do, `pi-embedded-runner` does the model work, `tools/memory/media` amplify capability, and `channels/gateway/routing` deliver the result to real users.
