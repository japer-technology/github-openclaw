# Inter-Repository Communication on GitHub: Deep Analysis for Multi-Agent Orchestration

## Abstract

This document analyzes every viable mechanism by which one GitHub repository can communicate with another repository in the same account (user or organization). The primary lens is **multi-agent orchestration**: how can multiple OpenClaw agents, each operating from their own repository, coordinate work, share state, exchange trust signals, and compose complex workflows?

The analysis covers GitHub-native primitives, their security characteristics, latency profiles, cost implications, and suitability for the collaboration patterns defined in OpenClaw's GitHub Mode architecture (`.GITHUB-MODE/runtime/collaboration-envelope.schema.json`, `entity-manifest.json`, `collaboration-policy.json`).

---

## 1. Motivation

OpenClaw's GitHub Mode roadmap (Phase 6, MVVVP) envisions **multi-entity collaboration**: distinct repository-hosted agents that exchange structured messages, delegate tasks, and compose results — all within GitHub's infrastructure. Before implementing this, we need a clear map of what GitHub actually supports for cross-repo communication.

The key questions are:

1. **What mechanisms exist** for Repo A to trigger work in Repo B?
2. **What mechanisms exist** for Repo A to read state from Repo B?
3. **What mechanisms exist** for Repo A to write state into Repo B?
4. **What are the trust, security, and cost boundaries** of each mechanism?
5. **Which combinations** best serve multi-agent orchestration patterns?

---

## 2. Taxonomy of GitHub-Native Inter-Repo Communication Mechanisms

### 2.1 `repository_dispatch` (Repo A triggers Repo B)

**How it works:** Repo A sends an HTTP POST to the GitHub API (`POST /repos/{owner}/{repo}/dispatches`) with a custom `event_type` string and an optional JSON `client_payload` (max 10 properties at root level). Repo B has a workflow listening on `repository_dispatch` with a matching event type.

**Authentication:** Requires a token (`GITHUB_TOKEN` with `repo` scope, or a fine-grained PAT / GitHub App installation token) that has **write access to the target repository**. The default `GITHUB_TOKEN` in a workflow has access only to the current repository, so cross-repo dispatch always requires an elevated token.

**Payload capacity:** The `client_payload` is JSON, but limited to 10 top-level keys. Nested objects are allowed, so complex payloads can be structured under a single root key.

**Latency:** The dispatch API returns `204 No Content` immediately. The target workflow starts after GitHub's event processing delay (typically 2–15 seconds, occasionally longer under load). There is no built-in mechanism to wait for the target workflow to complete or to receive a result.

**Suitability for orchestration:**

| Strength                                  | Limitation                                              |
| ----------------------------------------- | ------------------------------------------------------- |
| Native event-driven trigger               | One-way fire-and-forget; no built-in response channel   |
| Structured payload via `client_payload`   | 10 top-level key limit (workaround: nest under one key) |
| Workflow filtering by `event_type`        | Requires elevated token for cross-repo access           |
| Can carry correlation IDs, trust metadata | No delivery guarantee beyond HTTP 204 acknowledgment    |

**OpenClaw mapping:** This is the primary candidate for the **collaboration envelope delivery** mechanism. The `client_payload` maps directly to the envelope schema (sourceEntityId, targetEntityId, intent, correlationId, trustLevel, etc.). The envelope schema's fields fit within the payload limits when nested under a single root key.

### 2.2 `workflow_dispatch` (Manual/API trigger with inputs)

**How it works:** Similar to `repository_dispatch` but designed for triggering a specific workflow with typed inputs. Sent via `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` with an `inputs` object and a target `ref` (branch/tag).

**Authentication:** Same as `repository_dispatch` — requires a token with write access to the target repo's Actions.

**Payload capacity:** Inputs are defined in the workflow YAML with explicit types (string, boolean, choice, environment). Maximum 10 inputs per workflow. All values are strings at the API level regardless of declared type.

**Key difference from `repository_dispatch`:** The caller specifies which workflow file to run and which branch/tag to run it from. This gives the caller more control over execution but tighter coupling to the target's workflow structure.

**Suitability for orchestration:**

| Strength                          | Limitation                                           |
| --------------------------------- | ---------------------------------------------------- |
| Explicit workflow targeting       | Tight coupling: caller must know workflow filename   |
| Typed inputs with validation      | 10-input limit; all string at API level              |
| Ref-pinning (run specific branch) | Still one-way; no built-in response                  |
| Shows in "manually triggered" UI  | Less suitable for automated agent-to-agent messaging |

**OpenClaw mapping:** Better suited for **operator-initiated cross-repo commands** (e.g., "tell Repo B to run its promotion workflow on branch X") than for automated agent-to-agent messaging. Could serve as a fallback or explicit command channel.

### 2.3 Reusable Workflows (`workflow_call`)

**How it works:** A workflow in Repo A calls a workflow defined in Repo B using the `uses: owner/repo/.github/workflows/file.yml@ref` syntax. The called workflow runs **in the context of the caller** (Repo A's `GITHUB_TOKEN`, Repo A's secrets unless explicitly passed).

**Authentication:** The called workflow inherits the caller's context. No additional token is needed if the target repo is public or in the same organization. For private repos within the same org, the target repo must explicitly allow workflow sharing via Settings → Actions → Access.

**Payload capacity:** Inputs and outputs are defined in the called workflow's `workflow_call` trigger. Inputs support string, boolean, and number types. Outputs are strings. Secrets can be passed explicitly or inherited.

**Execution model:** The called workflow is **inlined** into the caller's run. It appears as a job within the caller's workflow run. It does not create a separate workflow run in Repo B. This means Repo B's workflow code is reused, but execution context, billing, and artifacts belong to Repo A.

**Suitability for orchestration:**

| Strength                                      | Limitation                                                    |
| --------------------------------------------- | ------------------------------------------------------------- |
| Structured inputs/outputs                     | Runs in caller's context, not callee's                        |
| Typed parameters                              | Does not trigger a run in Repo B                              |
| Composable: chain multiple reusable workflows | Callee cannot access its own secrets unless explicitly passed |
| No additional tokens needed (same org)        | Max 4 levels of nesting                                       |

**OpenClaw mapping:** Ideal for **shared capability reuse** — common validation steps, contract checking, or security scanning that multiple entity repos want to run identically. Less suitable for independent agent execution because the work runs in the caller's context, not the target entity's.

### 2.4 GitHub Actions Artifacts (Shared state via workflow runs)

**How it works:** Workflows upload artifacts (`actions/upload-artifact`) which are associated with a specific workflow run. The REST API (`GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts`) allows downloading artifacts from any accessible repository.

**Authentication:** Reading artifacts from another repo requires a token with `actions:read` permission on the target repo. Downloading artifact content requires `actions:read` scope.

**Payload capacity:** Artifacts can be up to 500 MB (compressed). They are zip files containing arbitrary content.

**Retention:** Default 90 days, configurable per-repo (1–400 days). Artifacts are immutable once uploaded.

**Suitability for orchestration:**

| Strength                                | Limitation                                      |
| --------------------------------------- | ----------------------------------------------- |
| Large payload capacity                  | Requires knowing the run ID to locate artifacts |
| Immutable, auditable                    | Not a real-time communication channel           |
| Rich content (files, binaries, reports) | Retention is finite                             |
| Cross-repo readable with proper tokens  | Upload is local to the producing workflow only  |

**OpenClaw mapping:** Best for **result exchange** — Repo A dispatches a task to Repo B, Repo B produces artifacts, and Repo A polls or is notified to download them. Artifacts can carry signed attestations, evaluation outputs, or structured reports.

### 2.5 GitHub Actions Cache (Shared cache across repos)

**How it works:** `actions/cache` stores and restores cached content by key. Within the same repository, caches are shared across workflows and branches (with scope rules). **Cross-repository cache sharing is not supported** — each repo has its own isolated cache namespace.

**Suitability for orchestration:** **Not viable for inter-repo communication.** Caches are repo-scoped. Mentioned here for completeness and to prevent wasted investigation.

### 2.6 GitHub API: Issues, PRs, and Comments

**How it works:** Repo A creates or comments on issues/PRs in Repo B via the REST or GraphQL API. This is the most flexible communication channel — any structured data can be encoded in issue bodies, comments, or labels.

**Authentication:** Requires a token with appropriate permissions on the target repo (`issues:write`, `pull-requests:write`).

**Payload capacity:** Issue/PR bodies up to 65,536 characters. Comments up to 65,536 characters. Labels are 50 characters each but unlimited count.

**Suitability for orchestration:**

| Strength                                         | Limitation                                       |
| ------------------------------------------------ | ------------------------------------------------ |
| Human-readable audit trail                       | Not designed for machine-to-machine messaging    |
| Rich formatting (Markdown, task lists)           | Parsing structured data from Markdown is fragile |
| Native notification/subscription system          | Rate-limited (especially for creation: 250/hr)   |
| Can trigger `issue_comment` / `issues` workflows | Higher latency than dispatch                     |

**OpenClaw mapping:** Suited for **long-running task coordination** where human visibility is valuable — opening a tracking issue in Repo B for a multi-step task, posting progress updates as comments, and closing when complete. The existing subagent announce pattern maps naturally to issue comment threads.

### 2.7 GitHub API: Commit Status and Check Runs

**How it works:** Repo A can post commit statuses or create check runs on commits in Repo B. This is a signaling mechanism — it attaches pass/fail/pending state to specific commits.

**Authentication:** Requires `statuses:write` or `checks:write` on the target repo.

**Suitability for orchestration:**

| Strength                               | Limitation                                                         |
| -------------------------------------- | ------------------------------------------------------------------ |
| Native integration with PR merge gates | Limited payload (status description: 140 chars; check run: richer) |
| Visible in PR UI                       | Signals only, not general-purpose messaging                        |
| Can block or unblock merges            | Requires knowing the target commit SHA                             |

**OpenClaw mapping:** Useful for **cross-repo validation gates** — Repo A's agent validates something and signals pass/fail on Repo B's PR. Maps to the bot-PR workflow's provenance and policy attestation checks.

### 2.8 GitHub Packages and Container Registry

**How it works:** Repos publish packages (npm, Docker images, etc.) to GitHub Packages. Other repos in the same account can pull these packages.

**Authentication:** `GITHUB_TOKEN` can read packages from other public repos in the same org. Private packages require `packages:read` permission.

**Suitability for orchestration:** **Indirect.** Useful for sharing versioned build artifacts or tool distributions, but not a communication channel. An agent repo could publish its capabilities as a versioned package that other agent repos consume.

### 2.9 GitHub Deployments API

**How it works:** Create deployment records and deployment statuses on any repository. Deployments are a lightweight state machine (pending → in_progress → success/failure/error).

**Authentication:** Requires `deployments:write` on the target repo.

**Suitability for orchestration:**

| Strength                                                   | Limitation                                |
| ---------------------------------------------------------- | ----------------------------------------- |
| Built-in state machine with named environments             | Semantically tied to "deployment" concept |
| Can trigger `deployment` and `deployment_status` workflows | Limited custom metadata                   |
| Environment protection rules apply                         | Not designed for general messaging        |

**OpenClaw mapping:** Could model **promotion workflows** — Agent A "deploys" a change to Agent B's environment, triggering approval gates. However, overloading the deployment concept for general orchestration creates semantic confusion.

### 2.10 GitHub Projects (V2) and GraphQL

**How it works:** Organization-level Projects can span multiple repositories. Items (issues/PRs/draft items) can be added, moved between status columns, and annotated with custom fields via the GraphQL API.

**Authentication:** Requires `project` scope or a GitHub App with project permissions.

**Suitability for orchestration:**

| Strength                              | Limitation                                                  |
| ------------------------------------- | ----------------------------------------------------------- |
| Cross-repo by design                  | Organization-level only (not user accounts)                 |
| Custom fields for structured metadata | GraphQL-only API (more complex)                             |
| Kanban/status tracking built in       | Not an event trigger (no project change → workflow trigger) |

**OpenClaw mapping:** Potential **orchestration dashboard** — a shared project board showing all active cross-entity tasks, their status, and provenance. However, the lack of event triggers means it cannot directly initiate workflows.

### 2.11 OIDC Token Federation

**How it works:** GitHub Actions can request OIDC tokens (`ACTIONS_ID_TOKEN_REQUEST_TOKEN`) that contain claims about the workflow run (repository, actor, ref, environment, etc.). These tokens can be presented to external services or validated by other workflows.

**Authentication:** Built-in to Actions; no additional tokens needed to request an OIDC token for the current workflow.

**Suitability for orchestration:**

| Strength                                     | Limitation                                                  |
| -------------------------------------------- | ----------------------------------------------------------- |
| Cryptographically verifiable source identity | Designed for external IdP federation, not repo-to-repo      |
| Contains repo, ref, actor, run_id claims     | Target must validate JWT (requires JWKS endpoint knowledge) |
| No shared secrets needed for identity proof  | Does not trigger anything by itself                         |

**OpenClaw mapping:** **Trust verification layer.** When Repo A dispatches an envelope to Repo B, Repo A can include an OIDC token. Repo B validates the token to cryptographically confirm the message came from the claimed source repository, run, and ref. This maps directly to the collaboration envelope's `trustLevel` and `sourceCommitSha` fields.

---

## 3. Composite Patterns for Multi-Agent Orchestration

Individual mechanisms are building blocks. Orchestration requires composing them into patterns.

### 3.1 Pattern: Fire-and-Forget Task Delegation

```
Repo A (Orchestrator)                    Repo B (Worker)
        │                                       │
        │──── repository_dispatch ─────────────>│
        │     (collaboration envelope           │
        │      in client_payload)               │
        │                                       │── workflow executes task
        │                                       │── uploads artifacts
        │                                       │
        │<─── repository_dispatch ──────────────│
        │     (completion envelope              │
        │      with artifact references)        │
        │                                       │
```

**Mechanism chain:** `repository_dispatch` → workflow execution → `actions/upload-artifact` → `repository_dispatch` (callback).

**Tokens required:** Each repo needs a PAT or GitHub App token with `repo` scope on the other. Alternatively, a single GitHub App installed on both repos.

**Trust model:** Envelopes carry OIDC tokens for source verification. Both repos validate incoming envelopes against their `collaboration-policy.json`.

**Latency:** 2–15s dispatch delay + workflow execution time + 2–15s callback delay.

**When to use:** Independent tasks where the orchestrator does not need to wait synchronously. Maps to OpenClaw's subagent spawn pattern.

### 3.2 Pattern: Polling-Based Result Collection

```
Repo A (Orchestrator)                    Repo B (Worker)
        │                                       │
        │──── repository_dispatch ─────────────>│
        │     (task envelope)                   │
        │                                       │── workflow executes
        │                                       │── uploads artifact
        │                                       │── sets commit status on shared ref
        │                                       │
        │──── poll: GET /repos/B/actions/runs ──│
        │──── poll: GET /repos/B/actions/       │
        │     runs/{id}/artifacts               │
        │──── download artifact ────────────────│
        │                                       │
```

**Mechanism chain:** `repository_dispatch` → workflow execution → artifact upload → REST API polling from Repo A.

**Tokens required:** Repo A needs `actions:read` on Repo B to poll run status and download artifacts.

**Advantage over 3.1:** No callback dispatch needed; Repo B does not need write access to Repo A. Trust is asymmetric — only the orchestrator needs cross-repo access.

**Disadvantage:** Polling introduces latency and consumes API rate limit. Suitable when the orchestrator is already running a long workflow.

### 3.3 Pattern: Shared Reusable Workflow Library

```
Repo C (Shared Capabilities)
  └── .github/workflows/
      ├── validate-contracts.yml
      ├── security-scan.yml
      └── attestation-check.yml

Repo A uses: owner/repo-c/.github/workflows/validate-contracts.yml@v1
Repo B uses: owner/repo-c/.github/workflows/security-scan.yml@v1
```

**Mechanism:** `workflow_call` (reusable workflows).

**Trust model:** The calling repo controls execution context. Repo C provides capability code but does not execute independently. Version pinning (`@v1`, `@sha`) ensures reproducibility.

**When to use:** When multiple agent repos need identical validation, scanning, or policy checking logic. Avoids duplicating workflow code across entity repos.

### 3.4 Pattern: Issue-Tracked Long-Running Coordination

```
Repo A (Orchestrator)                    Repo B (Worker)
        │                                       │
        │──── Create issue in Repo B ──────────>│
        │     (structured task in body)         │
        │                                       │── issue triggers workflow
        │                                       │   (via `issues: opened`)
        │                                       │── posts progress comments
        │                                       │── closes issue on completion
        │                                       │
        │<─── `issues: closed` event or ────────│
        │     polling issue state               │
        │                                       │
```

**Mechanism chain:** GitHub API (issue creation) → `issues` event trigger → comment updates → issue close.

**Advantage:** Full audit trail visible to humans. Natural mapping to task tracking. Supports long-running tasks with progress updates.

**Disadvantage:** Higher latency. Rate-limited issue creation (250/hr). Semantic overloading of issues.

**When to use:** Tasks requiring human oversight, multi-step progress tracking, or cross-team visibility.

### 3.5 Pattern: Hub-and-Spoke with GitHub App

```
                    GitHub App
                   (installed on all repos)
                        │
           ┌────────────┼────────────┐
           │            │            │
        Repo A       Repo B       Repo C
       (Agent 1)    (Agent 2)    (Agent 3)
```

**Mechanism:** A GitHub App is installed on all participating repos. Each repo's workflows authenticate as the App to interact with other repos. The App's permissions define the trust boundary.

**Token management:** Each workflow requests an installation token (`actions/create-github-app-token`) scoped to the target repos. Tokens are short-lived (1 hour) and scoped to specific permissions.

**Advantage:** No long-lived PATs. Centralized permission management. Fine-grained scoping per interaction.

**This is the recommended authentication model for production multi-agent orchestration.**

---

## 4. Security Analysis

### 4.1 Token Scoping and Least Privilege

| Token Type                    | Cross-Repo Capable     | Scope Control                    | Rotation            | Recommendation                 |
| ----------------------------- | ---------------------- | -------------------------------- | ------------------- | ------------------------------ |
| Default `GITHUB_TOKEN`        | No (current repo only) | Workflow-level `permissions`     | Per-run (automatic) | Use for intra-repo only        |
| Fine-Grained PAT              | Yes                    | Per-repo, per-permission         | Manual (expiry)     | Acceptable for dev/testing     |
| Classic PAT                   | Yes                    | Broad (`repo` scope)             | Manual              | Avoid for production           |
| GitHub App Installation Token | Yes                    | Per-installation, per-permission | Automatic (1 hour)  | **Recommended for production** |

### 4.2 Trust Verification

Cross-repo messages should be verified at multiple levels:

1. **Token validity:** The calling workflow's token must have appropriate permissions. GitHub enforces this at the API level.

2. **Source identity (OIDC):** The caller can include an OIDC token in the dispatch payload. The receiver validates the JWT against GitHub's OIDC provider (`https://token.actions.githubusercontent.com`) and checks claims (repository, ref, actor, environment).

3. **Envelope integrity:** The collaboration envelope includes `sourceCommitSha` and `sourceRunId`, allowing the receiver to verify the exact source state via the API.

4. **Policy enforcement:** The receiver's `collaboration-policy.json` defines allowed routes. Messages from unallowlisted sources are rejected before processing.

### 4.3 Threat Model for Cross-Repo Dispatch

| Threat                                         | Mitigation                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Compromised token dispatches malicious payload | OIDC verification + policy allowlist + payload schema validation                           |
| Replay attack (old envelope re-sent)           | `correlationId` deduplication + `ttlSeconds` expiry + `createdAt` freshness check          |
| Privilege escalation via dispatch              | Receiver runs with its own permissions, not caller's. Dispatch payload is data only.       |
| Secrets exfiltration via callback              | Callback payloads are validated against envelope schema. No secret forwarding in payloads. |
| Denial of service via dispatch flooding        | GitHub API rate limits (5000 req/hr per token). Receiver workflow concurrency controls.    |

### 4.4 Fail-Closed Principle

OpenClaw's existing `collaboration-policy.json` defaults to `"defaultAction": "deny"` with an empty `allowedRoutes` list. This is correct: all cross-repo communication is blocked until explicitly permitted. The analysis in this document does not change this default — it maps mechanisms onto the existing deny-by-default architecture.

---

## 5. Cost and Rate Limit Analysis

### 5.1 GitHub Actions Minutes

Cross-repo dispatch creates workflow runs in the target repo, consuming that repo's Actions minutes allocation. For same-org repos, minutes are pooled at the organization level.

| Plan       | Included Minutes/Month | Cost Per Extra Minute (Linux) |
| ---------- | ---------------------- | ----------------------------- |
| Free       | 2,000                  | N/A (hard limit)              |
| Team       | 3,000                  | $0.008                        |
| Enterprise | 50,000                 | $0.008                        |

**Implication:** High-frequency agent-to-agent dispatch can consume significant minutes. Design orchestration patterns with workflow consolidation in mind — batch multiple small tasks into single workflow runs where possible.

### 5.2 API Rate Limits

| Endpoint                 | Rate Limit             | Notes                                 |
| ------------------------ | ---------------------- | ------------------------------------- |
| REST API (authenticated) | 5,000 req/hr per token | Shared across all API calls           |
| `repository_dispatch`    | Part of REST limit     | No separate limit                     |
| Issue creation           | 250/hr globally        | Stricter sub-limit                    |
| GraphQL API              | 5,000 points/hr        | Point cost varies by query complexity |

**Implication:** Polling-based patterns (3.2) consume rate limit continuously. Dispatch-based patterns (3.1) consume rate limit only at trigger and callback time. For high-frequency orchestration, dispatch-based patterns are more rate-limit-efficient.

### 5.3 Artifact Storage

| Plan       | Included Storage | Retention               |
| ---------- | ---------------- | ----------------------- |
| Free       | 500 MB           | 90 days (default)       |
| Team       | 2 GB             | 90 days (configurable)  |
| Enterprise | 50 GB            | 400 days (configurable) |

**Implication:** Using artifacts as an inter-repo data exchange channel is viable for moderate volumes but requires attention to retention and cleanup policies.

---

## 6. Mapping to OpenClaw's Collaboration Architecture

### 6.1 Collaboration Envelope Delivery

The collaboration envelope (`.GITHUB-MODE/runtime/collaboration-envelope.schema.json`) maps to `repository_dispatch` as follows:

```yaml
# Sender workflow step
- name: Dispatch collaboration envelope
  uses: peter-evans/repository-dispatch@v3
  with:
    token: ${{ steps.app-token.outputs.token }}
    repository: owner/target-repo
    event-type: collaboration-envelope
    client-payload: |
      {
        "envelope": {
          "schemaVersion": "1.0",
          "sourceEntityId": "openclaw-primary",
          "targetEntityId": "openclaw-worker-1",
          "intent": "validate-contracts",
          "sourceCommitSha": "${{ github.sha }}",
          "sourceRunId": "${{ github.run_id }}",
          "trustLevel": "trusted",
          "policyVersion": "v1.0.0",
          "correlationId": "${{ steps.uuid.outputs.value }}",
          "createdAt": "${{ steps.timestamp.outputs.value }}",
          "ttlSeconds": 3600,
          "payload": { ... }
        }
      }
```

The entire envelope nests under a single `envelope` key, staying within the 10 top-level key limit.

### 6.2 Entity Manifest Discovery

Each agent repo publishes its `entity-manifest.json` at a well-known path. The orchestrator reads it via the Contents API:

```
GET /repos/{owner}/{repo}/contents/.GITHUB-MODE/runtime/entity-manifest.json
```

This provides capability discovery without requiring the target repo to be running. The manifest is a static declaration, not a runtime service.

### 6.3 Collaboration Policy Enforcement

The receiver workflow validates incoming envelopes:

1. Parse `client_payload.envelope`
2. Validate against `collaboration-envelope.schema.json`
3. Check `sourceEntityId` against `collaboration-policy.json` allowed routes
4. Verify `trustLevel` meets the route's minimum trust requirement
5. Optionally validate OIDC token for cryptographic source proof
6. If all checks pass, execute the intent; otherwise, reject with logged denial

### 6.4 Response Channel

For bidirectional orchestration, the response flows back via the same mechanism:

- Worker completes task → uploads artifacts → dispatches a response envelope back to the orchestrator's repo
- The response envelope references the original `correlationId` for request-response pairing
- The orchestrator's `repository_dispatch` handler processes the response

---

## 7. Recommended Architecture for OpenClaw Multi-Agent Orchestration

Based on this analysis, the recommended architecture composes mechanisms as follows:

### 7.1 Authentication Layer

**GitHub App** installed on all participating repos. Short-lived installation tokens for all cross-repo API calls. No long-lived PATs.

### 7.2 Trigger Layer

**`repository_dispatch`** as the primary inter-agent messaging channel. Each entity repo listens for `collaboration-envelope` events and validates incoming envelopes against its policy.

### 7.3 Capability Sharing Layer

**Reusable workflows** (`workflow_call`) in a shared capabilities repo for common validation, security scanning, and contract checking. Pinned to immutable refs (tags or SHAs).

### 7.4 State Exchange Layer

**Artifacts** for rich data exchange (evaluation results, attestation reports, compiled outputs). **Issue comments** for human-visible progress tracking on long-running tasks.

### 7.5 Trust Layer

**OIDC tokens** embedded in dispatch payloads for cryptographic source verification. **Collaboration policy** enforcement on every incoming envelope. **Fail-closed** default.

### 7.6 Coordination Layer

**Commit statuses / check runs** for cross-repo validation gates on PRs. **Deployments API** for promotion workflows with environment protection rules.

---

## 8. Implementation Priorities

Given the current state of GitHub Mode (pre-MVVP), the recommended implementation order is:

| Priority | Mechanism                             | Rationale                          |
| -------- | ------------------------------------- | ---------------------------------- |
| P0       | GitHub App token infrastructure       | Foundation for all cross-repo auth |
| P0       | `repository_dispatch` sender/receiver | Core messaging channel             |
| P0       | Envelope validation workflow          | Policy enforcement on receipt      |
| P1       | OIDC token embedding and verification | Trust verification                 |
| P1       | Artifact-based result exchange        | Rich data sharing                  |
| P1       | Reusable workflow library             | DRY shared capabilities            |
| P2       | Issue-based long-running coordination | Human-visible task tracking        |
| P2       | Cross-repo commit status / check runs | Validation gates                   |
| P3       | Organization Projects integration     | Orchestration dashboard            |
| P3       | Deployments API for promotion         | Environment-gated promotions       |

---

## 9. Mechanisms Evaluated and Excluded

| Mechanism           | Why Excluded                                                |
| ------------------- | ----------------------------------------------------------- |
| Actions Cache       | Repo-scoped; no cross-repo sharing                          |
| GitHub Discussions  | No workflow trigger; poor machine-to-machine interface      |
| GitHub Wiki         | No API for structured updates; no workflow triggers         |
| Git submodules      | Static dependency, not a communication channel              |
| GitHub Pages        | Publishing-only; no bidirectional communication             |
| Webhooks (external) | Requires external endpoint; breaks GitHub-native constraint |

---

## 10. Open Questions

1. **Concurrency control:** When multiple orchestrators dispatch to the same worker repo simultaneously, how should the worker handle queuing? GitHub's built-in concurrency groups can limit to one active run per group, but more nuanced scheduling (priority, FIFO, deduplication) requires application-level logic.

2. **Delivery guarantees:** `repository_dispatch` returns 204 but does not guarantee workflow execution (the repo could have Actions disabled, the event type might not match, etc.). Should the orchestrator verify that a workflow run was created after dispatch?

3. **Large payload exchange:** For payloads exceeding `client_payload` size limits, should the pattern be: dispatch envelope with artifact reference → worker downloads artifact from orchestrator's run? This inverts the artifact flow direction.

4. **Cross-organization collaboration:** This analysis assumes same-account (user or org) repos. Cross-org collaboration introduces additional trust boundaries (GitHub App must be installed on both orgs, OIDC claims differ). Future analysis should address this.

5. **Cost modeling:** What is the expected Actions minutes budget for a realistic multi-agent orchestration scenario (e.g., 3 agent repos, 50 tasks/day)? This determines whether the architecture is viable on Free/Team plans or requires Enterprise.

---

## 11. Summary

GitHub provides a rich set of primitives for inter-repository communication. No single mechanism covers all orchestration needs, but they compose well:

- **`repository_dispatch`** is the backbone: structured event delivery between repos with correlation and trust metadata.
- **GitHub App tokens** are the authentication model: short-lived, fine-grained, centrally managed.
- **OIDC tokens** are the trust verification model: cryptographic proof of source identity without shared secrets.
- **Artifacts** are the data exchange model: large, immutable, auditable payloads.
- **Reusable workflows** are the capability sharing model: DRY, version-pinned, composable.
- **Issues/Comments** are the human coordination model: visible, auditable, familiar.

OpenClaw's existing collaboration envelope schema, entity manifest, and deny-by-default policy are well-designed for this mechanism set. The implementation path is clear: GitHub App infrastructure first, then dispatch-based messaging, then progressively layer trust verification, result exchange, and human coordination.
