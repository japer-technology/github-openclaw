# External Libraries

Generated on 2026-02-15 from manifest files. This lists direct external dependencies; internal package opennipper is intentionally excluded.

> **Staleness note:** This listing is a point-in-time snapshot. Regenerate when dependencies change materially.

## Node.js Workspace Dependencies

| Library                                      | Version(s)             | Declared In                                                            | Purpose                                                               |
| -------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `@agentclientprotocol/sdk`                   | `0.14.1`               | core gateway/CLI                                                       | Agent Client Protocol SDK for agent interoperability.                 |
| `@aws-sdk/client-bedrock`                    | `^3.986.0`             | core gateway/CLI                                                       | AWS Bedrock API client for model access.                              |
| `@buape/carbon`                              | `0.14.0`               | core gateway/CLI                                                       | Code-to-image rendering helper (Carbon-style output).                 |
| `@clack/prompts`                             | `^1.0.0`               | core gateway/CLI                                                       | Interactive terminal prompt components for CLI flows.                 |
| `@grammyjs/runner`                           | `^2.0.3`               | core gateway/CLI                                                       | Long-running update runner for Telegram bots.                         |
| `@grammyjs/transformer-throttler`            | `^1.2.1`               | core gateway/CLI                                                       | Telegram API throttling middleware.                                   |
| `@grammyjs/types`                            | `^3.24.0`              | core gateway/CLI                                                       | Type definitions for Telegram Bot API models.                         |
| `@homebridge/ciao`                           | `^1.3.5`               | core gateway/CLI                                                       | mDNS/DNS-SD service advertisement for local discovery.                |
| `@lancedb/lancedb`                           | `^0.26.2`              | memory-lancedb extension                                               | Vector database client used by the LanceDB memory extension.          |
| `@larksuiteoapi/node-sdk`                    | `^1.58.0`              | core gateway/CLI, feishu extension                                     | Feishu/Lark OpenAPI SDK for channel integration.                      |
| `@line/bot-sdk`                              | `^10.6.0`              | core gateway/CLI                                                       | LINE Messaging API SDK.                                               |
| `@lit/context`                               | `^1.1.6`               | core gateway/CLI                                                       | Context propagation utilities for Lit web components.                 |
| `@lit-labs/signals`                          | `^0.2.0`               | core gateway/CLI                                                       | Reactive signals integration for Lit.                                 |
| `@lydell/node-pty`                           | `1.2.0-beta.3`         | core gateway/CLI                                                       | Pseudo-terminal bindings for shell/session execution.                 |
| `@mariozechner/pi-agent-core`                | `0.52.9`               | core gateway/CLI                                                       | Core runtime for Pi agent orchestration.                              |
| `@mariozechner/pi-ai`                        | `0.52.9`               | core gateway/CLI                                                       | Model/tool abstraction layer used by the gateway.                     |
| `@mariozechner/pi-coding-agent`              | `0.52.9`               | core gateway/CLI                                                       | Coding-agent runtime utilities.                                       |
| `@mariozechner/pi-tui`                       | `0.52.9`               | core gateway/CLI                                                       | Terminal UI primitives used by CLI/agent UX.                          |
| `@matrix-org/matrix-sdk-crypto-nodejs`       | `^0.4.0`               | matrix extension                                                       | Matrix end-to-end encryption support.                                 |
| `@microsoft/agents-hosting`                  | `^1.2.3`               | msteams extension                                                      | Microsoft Agents hosting primitives for Teams integration.            |
| `@microsoft/agents-hosting-express`          | `^1.2.3`               | msteams extension                                                      | Express adapter for Microsoft Agents hosting.                         |
| `@microsoft/agents-hosting-extensions-teams` | `^1.2.3`               | msteams extension                                                      | Teams-specific extension for Microsoft Agents hosting.                |
| `@mozilla/readability`                       | `^0.6.0`               | core gateway/CLI                                                       | Readable-content extraction from HTML documents.                      |
| `@napi-rs/canvas`                            | `^0.1.89`              | core gateway/CLI                                                       | Native Canvas implementation (peer dependency for graphics features). |
| `@noble/ed25519`                             | `3.0.0`                | web control UI                                                         | Ed25519 cryptography helpers used by UI-side signing/verification.    |
| `@opentelemetry/api`                         | `^1.9.0`               | diagnostics-otel extension                                             | OpenTelemetry API for traces/metrics/logs.                            |
| `@opentelemetry/api-logs`                    | `^0.211.0`             | diagnostics-otel extension                                             | OpenTelemetry log API support.                                        |
| `@opentelemetry/exporter-logs-otlp-http`     | `^0.211.0`             | diagnostics-otel extension                                             | OTLP/HTTP log exporter.                                               |
| `@opentelemetry/exporter-metrics-otlp-http`  | `^0.211.0`             | diagnostics-otel extension                                             | OTLP/HTTP metrics exporter.                                           |
| `@opentelemetry/exporter-trace-otlp-http`    | `^0.211.0`             | diagnostics-otel extension                                             | OTLP/HTTP trace exporter.                                             |
| `@opentelemetry/resources`                   | `^2.5.0`               | diagnostics-otel extension                                             | Resource attributes for telemetry metadata.                           |
| `@opentelemetry/sdk-logs`                    | `^0.211.0`             | diagnostics-otel extension                                             | OpenTelemetry log SDK implementation.                                 |
| `@opentelemetry/sdk-metrics`                 | `^2.5.0`               | diagnostics-otel extension                                             | OpenTelemetry metrics SDK implementation.                             |
| `@opentelemetry/sdk-node`                    | `^0.211.0`             | diagnostics-otel extension                                             | Node.js OpenTelemetry SDK bootstrap.                                  |
| `@opentelemetry/sdk-trace-base`              | `^2.5.0`               | diagnostics-otel extension                                             | OpenTelemetry tracing SDK primitives.                                 |
| `@opentelemetry/semantic-conventions`        | `^1.39.0`              | diagnostics-otel extension                                             | Standard telemetry semantic attribute names.                          |
| `@sinclair/typebox`                          | `0.34.48`              | core gateway/CLI, feishu extension, memory-lancedb extension (+2 more) | TypeScript-first JSON schema definitions and validation typing.       |
| `@slack/bolt`                                | `^4.6.0`               | core gateway/CLI                                                       | Slack app framework and event handling.                               |
| `@slack/web-api`                             | `^7.13.0`              | core gateway/CLI                                                       | Slack Web API client.                                                 |
| `@twurple/api`                               | `^8.0.3`               | twitch extension                                                       | Twitch Helix/API client.                                              |
| `@twurple/auth`                              | `^8.0.3`               | twitch extension                                                       | OAuth/auth helpers for Twitch APIs.                                   |
| `@twurple/chat`                              | `^8.0.3`               | twitch extension                                                       | Twitch chat client integration.                                       |
| `@types/express`                             | `^5.0.6`               | core gateway/CLI                                                       | Development/test dependency for core gateway/CLI.                     |
| `@types/markdown-it`                         | `^14.1.2`              | core gateway/CLI                                                       | Development/test dependency for core gateway/CLI.                     |
| `@types/node`                                | `^25.2.2`              | core gateway/CLI                                                       | Development/test dependency for core gateway/CLI.                     |
| `@types/proper-lockfile`                     | `^4.1.4`               | core gateway/CLI                                                       | Development/test dependency for core gateway/CLI.                     |
| `@types/qrcode-terminal`                     | `^0.12.2`              | core gateway/CLI                                                       | Development/test dependency for core gateway/CLI.                     |
| `@types/ws`                                  | `^8.18.1`              | core gateway/CLI                                                       | Development/test dependency for core gateway/CLI.                     |
| `@typescript/native-preview`                 | `7.0.0-dev.20260209.1` | core gateway/CLI                                                       | Development/test dependency for core gateway/CLI.                     |
| `@urbit/aura`                                | `^3.0.0`               | tlon extension                                                         | Urbit aura parsing/typing utilities.                                  |
| `@urbit/http-api`                            | `^3.0.0`               | tlon extension                                                         | Urbit HTTP API client integration.                                    |
| `@vector-im/matrix-bot-sdk`                  | `0.8.0-element.3`      | matrix extension                                                       | Matrix bot SDK used by the Matrix extension.                          |
| `@vitest/browser-playwright`                 | `4.0.18`               | web control UI                                                         | Playwright browser provider for Vitest browser tests.                 |
| `@vitest/coverage-v8`                        | `^4.0.18`              | core gateway/CLI                                                       | V8 coverage provider for Vitest.                                      |
| `@whiskeysockets/baileys`                    | `7.0.0-rc.9`           | core gateway/CLI                                                       | WhatsApp Web protocol client library.                                 |
| `ajv`                                        | `^8.17.1`              | core gateway/CLI                                                       | JSON Schema validator used by core and vendored components.           |
| `chalk`                                      | `^5.6.2`               | core gateway/CLI                                                       | Terminal color/styling output helpers.                                |
| `chokidar`                                   | `^5.0.0`               | core gateway/CLI                                                       | Cross-platform file watching.                                         |
| `cli-highlight`                              | `^2.1.11`              | core gateway/CLI                                                       | Syntax highlighting for CLI text output.                              |
| `commander`                                  | `^14.0.3`              | core gateway/CLI                                                       | Command-line argument parsing.                                        |
| `croner`                                     | `^10.0.1`              | core gateway/CLI                                                       | Cron-like scheduler for timed tasks.                                  |
| `discord-api-types`                          | `^0.38.38`             | core gateway/CLI                                                       | Discord API type definitions.                                         |
| `dompurify`                                  | `^3.3.1`               | web control UI                                                         | HTML sanitization for UI rendering.                                   |
| `dotenv`                                     | `^17.2.4`              | core gateway/CLI                                                       | Environment variable loading from .env files.                         |
| `express`                                    | `^5.2.1`               | core gateway/CLI, msteams extension                                    | HTTP server framework for API and callbacks.                          |
| `file-type`                                  | `^21.3.0`              | core gateway/CLI                                                       | Binary file-type detection from buffers/streams.                      |
| `google-auth-library`                        | `^10.5.0`              | googlechat extension                                                   | Google OAuth/service-account auth client.                             |
| `grammy`                                     | `^1.40.0`              | core gateway/CLI                                                       | Telegram bot framework.                                               |
| `hono`                                       | `4.11.9`               | core gateway/CLI                                                       | Lightweight HTTP routing/server framework.                            |
| `jiti`                                       | `^2.6.1`               | core gateway/CLI                                                       | Runtime loader for TS/ESM modules.                                    |
| `json5`                                      | `^2.2.3`               | core gateway/CLI                                                       | JSON5 parsing and serialization.                                      |
| `jszip`                                      | `^3.10.1`              | core gateway/CLI                                                       | ZIP archive reading and creation.                                     |
| `linkedom`                                   | `^0.18.12`             | core gateway/CLI                                                       | Server-side DOM implementation for parsing/render workflows.          |
| `lit`                                        | `^3.3.2`               | core gateway/CLI, web control UI                                       | Lit web component framework for control UI and renderers.             |
| `long`                                       | `^5.3.2`               | core gateway/CLI                                                       | 64-bit integer utility type.                                          |
| `markdown-it`                                | `^14.1.0, 14.1.0`      | core gateway/CLI, matrix extension                                     | Markdown parser with plugin ecosystem.                                |
| `marked`                                     | `^17.0.1`              | web control UI                                                         | Markdown parser/renderer for UI surfaces.                             |
| `music-metadata`                             | `^11.12.0`             | matrix extension                                                       | Audio metadata parsing.                                               |
| `node-edge-tts`                              | `^1.2.10`              | core gateway/CLI                                                       | Microsoft Edge text-to-speech integration.                            |
| `node-llama-cpp`                             | `3.15.1`               | core gateway/CLI                                                       | Local llama.cpp model runtime (peer integration).                     |
| `nostr-tools`                                | `^2.23.0`              | nostr extension                                                        | Nostr protocol cryptography and message tooling.                      |
| `ollama`                                     | `^0.6.3`               | core gateway/CLI                                                       | Ollama client used for local model development/testing.               |
| `openai`                                     | `^6.19.0`              | memory-lancedb extension                                               | Runtime dependency for memory-lancedb extension.                      |
| `osc-progress`                               | `^0.3.0`               | core gateway/CLI                                                       | CLI progress bars/spinners.                                           |
| `oxfmt`                                      | `0.28.0`               | core gateway/CLI                                                       | Oxc-based code formatter.                                             |
| `oxlint`                                     | `^1.43.0`              | core gateway/CLI                                                       | Oxc-based linter.                                                     |
| `oxlint-tsgolint`                            | `^0.11.5`              | core gateway/CLI                                                       | TypeScript-focused lint rules for Oxlint.                             |
| `pdfjs-dist`                                 | `^5.4.624`             | core gateway/CLI                                                       | PDF parsing and text extraction.                                      |
| `playwright`                                 | `^1.58.2`              | web control UI                                                         | Browser automation/testing framework.                                 |
| `playwright-core`                            | `1.58.2`               | core gateway/CLI                                                       | Core browser automation engine package.                               |
| `proper-lockfile`                            | `^4.1.2`               | core gateway/CLI, msteams extension                                    | Cross-process file locking helpers.                                   |
| `qrcode-terminal`                            | `^0.12.0`              | core gateway/CLI                                                       | Terminal QR code rendering for device pairing/login.                  |
| `rolldown`                                   | `1.0.0-rc.3`           | core gateway/CLI                                                       | Bundler used in build pipeline.                                       |
| `sharp`                                      | `^0.34.5`              | core gateway/CLI                                                       | High-performance image processing.                                    |
| `signal-utils`                               | `^0.21.1`              | core gateway/CLI                                                       | Signal protocol utility helpers.                                      |
| `sqlite-vec`                                 | `0.1.7-alpha.2`        | core gateway/CLI                                                       | Vector extension bindings for SQLite.                                 |
| `tar`                                        | `7.5.7`                | core gateway/CLI                                                       | TAR archive creation/extraction.                                      |
| `tsdown`                                     | `^0.20.3`              | core gateway/CLI                                                       | TypeScript bundling/build utility.                                    |
| `tslog`                                      | `^4.10.2`              | core gateway/CLI                                                       | Structured logging utility.                                           |
| `tsx`                                        | `^4.21.0`              | core gateway/CLI                                                       | TS/ESM execution for scripts/tests.                                   |
| `typescript`                                 | `^5.9.3`               | core gateway/CLI                                                       | TypeScript compiler and language services.                            |
| `undici`                                     | `^7.21.0, 7.21.0`      | core gateway/CLI, zalo extension                                       | HTTP/1.1 client and fetch implementation.                             |
| `vite`                                       | `7.3.1`                | web control UI                                                         | Dev server and bundler for web UI.                                    |
| `vitest`                                     | `^4.0.18, 4.0.18`      | core gateway/CLI, web control UI                                       | Unit/integration test runner.                                         |
| `ws`                                         | `^8.19.0`              | core gateway/CLI, voice-call extension                                 | WebSocket client/server implementation.                               |
| `yaml`                                       | `^2.8.2`               | core gateway/CLI                                                       | YAML parsing and serialization.                                       |
| `zod`                                        | `^4.3.6`               | core gateway/CLI, feishu extension, matrix extension (+3 more)         | Type-safe runtime schema validation.                                  |

## Vendored A2UI Node Dependencies

| Library                        | Version(s)                       | Declared In                                                                                               | Purpose                                                     |
| ------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `@a2ui/lit`                    | `file:../lit`                    | vendored A2UI Angular renderer                                                                            | Runtime dependency for vendored A2UI packages.              |
| `@angular/build`               | `^21.0.2`                        | vendored A2UI Angular renderer                                                                            | Development/test dependency for vendored A2UI packages.     |
| `@angular/cli`                 | `^21.0.2`                        | vendored A2UI Angular renderer                                                                            | Development/test dependency for vendored A2UI packages.     |
| `@angular/common`              | `^21.0.0`                        | vendored A2UI Angular renderer                                                                            | Peer integration dependency for vendored A2UI packages.     |
| `@angular/compiler`            | `^21.0.0`                        | vendored A2UI Angular renderer                                                                            | Development/test dependency for vendored A2UI packages.     |
| `@angular/compiler-cli`        | `^21.0.3`                        | vendored A2UI Angular renderer                                                                            | Development/test dependency for vendored A2UI packages.     |
| `@angular/core`                | `^21.0.0`                        | vendored A2UI Angular renderer                                                                            | Development/test dependency for vendored A2UI packages.     |
| `@angular/platform-browser`    | `^21.0.0`                        | vendored A2UI Angular renderer                                                                            | Peer integration dependency for vendored A2UI packages.     |
| `@genkit-ai/ai`                | `^1.24.0`                        | vendored A2UI spec 0.9 eval tooling                                                                       | Runtime dependency for vendored A2UI packages.              |
| `@genkit-ai/compat-oai`        | `^1.19.2, ^1.24.0`               | vendored A2UI spec 0.8 eval tooling, vendored A2UI spec 0.9 eval tooling                                  | Runtime dependency for vendored A2UI packages.              |
| `@genkit-ai/core`              | `^1.24.0`                        | vendored A2UI spec 0.9 eval tooling                                                                       | Runtime dependency for vendored A2UI packages.              |
| `@genkit-ai/dotprompt`         | `^0.9.12`                        | vendored A2UI spec 0.9 eval tooling                                                                       | Runtime dependency for vendored A2UI packages.              |
| `@genkit-ai/firebase`          | `^1.24.0`                        | vendored A2UI spec 0.9 eval tooling                                                                       | Runtime dependency for vendored A2UI packages.              |
| `@genkit-ai/google-cloud`      | `^1.24.0`                        | vendored A2UI spec 0.9 eval tooling                                                                       | Runtime dependency for vendored A2UI packages.              |
| `@genkit-ai/google-genai`      | `^1.19.3, ^1.24.0`               | vendored A2UI spec 0.8 eval tooling, vendored A2UI spec 0.9 eval tooling                                  | Runtime dependency for vendored A2UI packages.              |
| `@genkit-ai/vertexai`          | `^1.19.3`                        | vendored A2UI spec 0.8 eval tooling                                                                       | Runtime dependency for vendored A2UI packages.              |
| `@lit/context`                 | `^1.1.4`                         | vendored A2UI Lit renderer                                                                                | Context propagation utilities for Lit web components.       |
| `@lit-labs/signals`            | `^0.1.3`                         | vendored A2UI Lit renderer                                                                                | Reactive signals integration for Lit.                       |
| `@types/express`               | `^5.0.1`                         | vendored A2UI Angular renderer                                                                            | Development/test dependency for vendored A2UI packages.     |
| `@types/jasmine`               | `~5.1.0`                         | vendored A2UI Angular renderer                                                                            | Development/test dependency for vendored A2UI packages.     |
| `@types/js-yaml`               | `^4.0.9`                         | vendored A2UI spec 0.9 eval tooling                                                                       | Runtime dependency for vendored A2UI packages.              |
| `@types/markdown-it`           | `^14.1.2`                        | vendored A2UI Angular renderer, vendored A2UI Lit renderer                                                | Development/test dependency for vendored A2UI packages.     |
| `@types/node`                  | `^20.17.19, ^20.19.25, ^24.10.1` | vendored A2UI Angular renderer, vendored A2UI Lit renderer, vendored A2UI spec 0.9 eval tooling           | Development/test dependency for vendored A2UI packages.     |
| `@types/uuid`                  | `^10.0.0`                        | vendored A2UI Angular renderer                                                                            | Development/test dependency for vendored A2UI packages.     |
| `@types/yargs`                 | `^17.0.34, ^17.0.35`             | vendored A2UI spec 0.8 eval tooling, vendored A2UI spec 0.9 eval tooling                                  | Development/test dependency for vendored A2UI packages.     |
| `@vitest/browser`              | `^4.0.15`                        | vendored A2UI Angular renderer                                                                            | Development/test dependency for vendored A2UI packages.     |
| `ajv`                          | `^8.17.1`                        | vendored A2UI spec 0.9 eval tooling                                                                       | JSON Schema validator used by core and vendored components. |
| `ajv-formats`                  | `^3.0.1`                         | vendored A2UI spec 0.9 eval tooling                                                                       | Format validators for Ajv schemas.                          |
| `cypress`                      | `^15.6.0`                        | vendored A2UI Angular renderer                                                                            | Development/test dependency for vendored A2UI packages.     |
| `dotenv-cli`                   | `^10.0.0`                        | vendored A2UI spec 0.8 eval tooling, vendored A2UI spec 0.9 eval tooling                                  | CLI wrapper for loading .env during scripts.                |
| `genkit`                       | `^1.19.2, ^1.24.0`               | vendored A2UI spec 0.8 eval tooling, vendored A2UI spec 0.9 eval tooling                                  | Genkit runtime used in vendored A2UI eval tooling.          |
| `genkitx-anthropic`            | `^0.25.0`                        | vendored A2UI spec 0.8 eval tooling, vendored A2UI spec 0.9 eval tooling                                  | Anthropic integration for Genkit.                           |
| `google-artifactregistry-auth` | `^3.5.0`                         | vendored A2UI Angular renderer, vendored A2UI Lit renderer                                                | Google Artifact Registry authentication helper.             |
| `jasmine-core`                 | `~5.9.0`                         | vendored A2UI Angular renderer                                                                            | Development/test dependency for vendored A2UI packages.     |
| `jsdom`                        | `^27.2.0`                        | vendored A2UI Angular renderer                                                                            | Headless DOM implementation for tests/tooling.              |
| `js-yaml`                      | `^4.1.1`                         | vendored A2UI spec 0.9 eval tooling                                                                       | YAML parser/emitter for Node tooling.                       |
| `karma`                        | `^6.4.4`                         | vendored A2UI Angular renderer                                                                            | Browser test runner (vendored Angular tooling).             |
| `karma-chrome-launcher`        | `^3.2.0`                         | vendored A2UI Angular renderer                                                                            | Chrome launcher plugin for Karma.                           |
| `karma-coverage`               | `^2.2.1`                         | vendored A2UI Angular renderer                                                                            | Coverage reporter for Karma.                                |
| `karma-jasmine`                | `^5.1.0`                         | vendored A2UI Angular renderer                                                                            | Jasmine adapter for Karma.                                  |
| `karma-jasmine-html-reporter`  | `^2.1.0`                         | vendored A2UI Angular renderer                                                                            | HTML reporter plugin for Karma/Jasmine.                     |
| `lit`                          | `^3.3.1`                         | vendored A2UI Lit renderer                                                                                | Lit web component framework for control UI and renderers.   |
| `markdown-it`                  | `^14.1.0`                        | vendored A2UI Angular renderer, vendored A2UI Lit renderer                                                | Markdown parser with plugin ecosystem.                      |
| `ng-packagr`                   | `^21.0.0`                        | vendored A2UI Angular renderer                                                                            | Angular library packaging/build tooling.                    |
| `playwright`                   | `^1.56.1`                        | vendored A2UI Angular renderer                                                                            | Browser automation/testing framework.                       |
| `prettier`                     | `^3.6.2`                         | vendored A2UI Angular renderer, vendored A2UI spec 0.8 eval tooling, vendored A2UI spec 0.9 eval tooling  | Code formatter used by vendored tooling.                    |
| `sass`                         | `^1.93.2`                        | vendored A2UI Angular renderer                                                                            | SCSS compiler for styles.                                   |
| `signal-utils`                 | `^0.21.1`                        | vendored A2UI Lit renderer                                                                                | Signal protocol utility helpers.                            |
| `tslib`                        | `^2.3.0, ^2.8.1`                 | vendored A2UI Angular renderer                                                                            | TypeScript helper runtime library.                          |
| `tsx`                          | `^4.20.5, ^4.20.6`               | vendored A2UI spec 0.8 eval tooling, vendored A2UI spec 0.9 eval tooling                                  | TS/ESM execution for scripts/tests.                         |
| `typescript`                   | `^5.8.3, ^5.9.2, ^5.9.3, ~5.9.2` | vendored A2UI Angular renderer, vendored A2UI Lit renderer, vendored A2UI spec 0.8 eval tooling (+1 more) | TypeScript compiler and language services.                  |
| `vitest`                       | `^4.0.15`                        | vendored A2UI Angular renderer                                                                            | Unit/integration test runner.                               |
| `winston`                      | `^3.18.3`                        | vendored A2UI spec 0.9 eval tooling                                                                       | Structured logger used by vendored tooling.                 |
| `wireit`                       | `^0.15.0-pre.2`                  | vendored A2UI Lit renderer                                                                                | Script orchestration and caching for npm scripts.           |
| `yargs`                        | `^18.0.0`                        | vendored A2UI spec 0.8 eval tooling, vendored A2UI spec 0.9 eval tooling                                  | Command-line argument parser utility.                       |
| `zod`                          | `^3.25.76`                       | vendored A2UI spec 0.9 eval tooling                                                                       | Type-safe runtime schema validation.                        |

## Swift (SPM, macOS)

| Library                    | Version       | Source                                                  | Purpose                                                       |
| -------------------------- | ------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `axorcist`                 | `0.1.0`       | https://github.com/steipete/AXorcist.git                | Accessibility automation helpers for macOS app integration.   |
| `commander`                | `0.2.1`       | https://github.com/steipete/Commander.git               | Swift CLI argument parsing utility.                           |
| `elevenlabskit`            | `0.1.0`       | https://github.com/steipete/ElevenLabsKit               | ElevenLabs API bindings for voice/audio features.             |
| `menubarextraaccess`       | `1.2.2`       | https://github.com/orchetect/MenuBarExtraAccess         | Programmatic control around SwiftUI MenuBarExtra behavior.    |
| `peekaboo`                 | `branch:main` | https://github.com/steipete/Peekaboo.git                | Desktop automation bridge/tooling used by macOS app features. |
| `sparkle`                  | `2.8.1`       | https://github.com/sparkle-project/Sparkle              | In-app macOS update framework.                                |
| `swift-algorithms`         | `1.2.1`       | https://github.com/apple/swift-algorithms               | Additional sequence/collection algorithms from Apple.         |
| `swift-concurrency-extras` | `1.3.2`       | https://github.com/pointfreeco/swift-concurrency-extras | Concurrency helper utilities.                                 |
| `swift-log`                | `1.9.1`       | https://github.com/apple/swift-log.git                  | Logging API implementation for Swift services/apps.           |
| `swift-numerics`           | `1.1.1`       | https://github.com/apple/swift-numerics.git             | Numerics math utilities for Swift.                            |
| `swift-subprocess`         | `0.3.0`       | https://github.com/swiftlang/swift-subprocess.git       | Subprocess execution APIs for Swift.                          |
| `swift-system`             | `1.6.4`       | https://github.com/apple/swift-system                   | Low-level system call wrappers for Swift.                     |
| `swiftui-math`             | `0.1.0`       | https://github.com/gonzalezreal/swiftui-math            | Math types/operators for SwiftUI layout/animation logic.      |
| `textual`                  | `0.3.1`       | https://github.com/gonzalezreal/textual                 | Attributed text rendering/model helpers for SwiftUI chat UI.  |

## Android Libraries (Gradle)

| Coordinate                                                | Scope(s)                                    | Purpose                                                         |
| --------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `androidx.activity:activity-compose:1.12.2`               | `implementation`                            | Compose integration with Android Activity lifecycle.            |
| `androidx.camera:camera-camera2:1.5.2`                    | `implementation`                            | CameraX backend for Camera2 implementation.                     |
| `androidx.camera:camera-core:1.5.2`                       | `implementation`                            | CameraX core camera abstractions.                               |
| `androidx.camera:camera-lifecycle:1.5.2`                  | `implementation`                            | Lifecycle-aware CameraX bindings.                               |
| `androidx.camera:camera-video:1.5.2`                      | `implementation`                            | CameraX video capture APIs.                                     |
| `androidx.camera:camera-view:1.5.2`                       | `implementation`                            | Camera preview/view widgets for CameraX.                        |
| `androidx.compose.material:material-icons-extended`       | `implementation`                            | Extended Material icon set for Compose.                         |
| `androidx.compose.material3:material3`                    | `implementation`                            | Material 3 components for Compose.                              |
| `androidx.compose.ui:ui`                                  | `implementation`                            | Core Jetpack Compose UI toolkit.                                |
| `androidx.compose.ui:ui-tooling`                          | `debugImplementation`                       | Interactive Compose tooling for debug builds.                   |
| `androidx.compose.ui:ui-tooling-preview`                  | `implementation`                            | Preview tooling support for Compose components.                 |
| `androidx.compose:compose-bom:2025.12.00`                 | `androidTestImplementation, implementation` | Compose Bill of Materials to align Compose package versions.    |
| `androidx.core:core-ktx:1.17.0`                           | `implementation`                            | Kotlin extensions for Android framework APIs.                   |
| `androidx.exifinterface:exifinterface:1.4.2`              | `implementation`                            | Read/write EXIF metadata for images.                            |
| `androidx.lifecycle:lifecycle-runtime-ktx:2.10.0`         | `implementation`                            | Lifecycle-aware coroutine/runtime helpers.                      |
| `androidx.navigation:navigation-compose:2.9.6`            | `implementation`                            | Navigation stack/routing for Compose UI.                        |
| `androidx.security:security-crypto:1.1.0`                 | `implementation`                            | Encrypted key/value storage and crypto primitives.              |
| `androidx.webkit:webkit:1.15.0`                           | `implementation`                            | Android WebView compatibility and feature APIs.                 |
| `com.google.android.material:material:1.13.0`             | `implementation`                            | Material Components support (theme/resources interoperability). |
| `com.squareup.okhttp3:okhttp:5.3.2`                       | `implementation`                            | HTTP client for network requests.                               |
| `dnsjava:dnsjava:3.6.4`                                   | `implementation`                            | DNS client library used for service discovery lookups.          |
| `io.kotest:kotest-assertions-core-jvm:6.0.7`              | `testImplementation`                        | Kotest assertion library.                                       |
| `io.kotest:kotest-runner-junit5-jvm:6.0.7`                | `testImplementation`                        | Kotest test runner on JUnit 5 platform.                         |
| `junit:junit:4.13.2`                                      | `testImplementation`                        | JUnit test framework (JUnit 4 API).                             |
| `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2` | `implementation`                            | Kotlin coroutine runtime for Android.                           |
| `org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2`    | `testImplementation`                        | Coroutine testing utilities.                                    |
| `org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0`  | `implementation`                            | Kotlin JSON serialization implementation.                       |
| `org.junit.vintage:junit-vintage-engine:6.0.2`            | `testRuntimeOnly`                           | Runs JUnit 3/4 tests on the JUnit Platform.                     |
| `org.robolectric:robolectric:4.16`                        | `testImplementation`                        | JVM-based Android runtime for unit tests.                       |

### Android Build Plugins

| Plugin ID                                   | Version  | Purpose                                                 |
| ------------------------------------------- | -------- | ------------------------------------------------------- |
| `com.android.application`                   | `8.13.2` | Android Gradle plugin for building application modules. |
| `org.jetbrains.kotlin.android`              | `2.2.21` | Kotlin language support for Android modules.            |
| `org.jetbrains.kotlin.plugin.compose`       | `2.2.21` | Compose compiler plugin integration.                    |
| `org.jetbrains.kotlin.plugin.serialization` | `2.2.21` | Kotlin serialization compiler plugin.                   |

## Auxiliary Tooling Dependencies

### Go (`scripts/docs-i18n/go.mod`)

| Library                         | Version  | Purpose                                             |
| ------------------------------- | -------- | --------------------------------------------------- |
| `github.com/joshp123/pi-golang` | `0.0.4`  | Go helper library used by the docs i18n pipeline.   |
| `github.com/yuin/goldmark`      | `1.7.8`  | Markdown parser for docs transformation tasks.      |
| `golang.org/x/net`              | `0.24.0` | Supplemental Go networking packages.                |
| `gopkg.in/yaml.v3`              | `3.0.1`  | YAML parsing/emitting for config and docs metadata. |

### Python (`skills/local-places/pyproject.toml`)

| Library             | Spec                        | Scope          | Purpose                                                    |
| ------------------- | --------------------------- | -------------- | ---------------------------------------------------------- |
| `fastapi`           | `fastapi>=0.110.0`          | `runtime`      | ASGI web framework for the local-places skill API.         |
| `hatchling`         | `hatchling`                 | `build-system` | Python build backend for packaging the local-places skill. |
| `httpx`             | `httpx>=0.27.0`             | `runtime`      | Async HTTP client for outbound API calls.                  |
| `pytest`            | `pytest>=8.0.0`             | `dev`          | Python test runner for local-places skill tests.           |
| `uvicorn[standard]` | `uvicorn[standard]>=0.29.0` | `runtime`      | ASGI app server for running FastAPI locally.               |

### Python Docs (`vendor/a2ui/requirements-docs.txt`)

| Library                          | Version    | Purpose                                                       |
| -------------------------------- | ---------- | ------------------------------------------------------------- |
| `furo`                           | `unpinned` | Furo theme for Sphinx documentation.                          |
| `mkdocs-include-markdown-plugin` | `unpinned` | MkDocs plugin/package for vendored A2UI documentation builds. |
| `mkdocs-llmstxt`                 | `unpinned` | MkDocs plugin/package for vendored A2UI documentation builds. |
| `mkdocs-macros-plugin`           | `unpinned` | MkDocs plugin/package for vendored A2UI documentation builds. |
| `mkdocs-material`                | `unpinned` | Material theme for MkDocs docs site output.                   |
| `mkdocs-mermaid2-plugin`         | `unpinned` | MkDocs plugin/package for vendored A2UI documentation builds. |
| `mkdocs-redirects`               | `unpinned` | MkDocs plugin/package for vendored A2UI documentation builds. |
| `myst-parser`                    | `unpinned` | MyST Markdown parser for Sphinx docs.                         |
| `sphinx`                         | `unpinned` | Sphinx documentation generator for Python docs.               |
