# GitHub Mode and OpenClaw secret supply analysis

## Executive summary

This analysis combines:

1. GitHub Mode policy/contract constraints under `.GITHUB-MODE`.
2. Current workflow usage in `.github/workflows`.
3. OpenClaw runtime secret storage patterns (agent and state paths).
4. A complete strategy map for supplying secrets from GitHub to OpenClaw-compatible automation.

Current state in this repository:

- GitHub Mode is intentionally strict and currently inventory-tracks only `GITHUB_TOKEN` as a workflow secret primitive.
- GitHub Mode blocks static cloud credentials in workflow env/`secrets.*` mappings and prefers OIDC federation.
- OpenClaw runtime stores long-lived model credentials in per-agent `auth-profiles.json` and legacy imports from `credentials/oauth.json`.

---

## 1) What `.GITHUB-MODE` currently enforces

### 1.1 Secret baseline

The machine-readable inventory defines only one secret-like runtime credential for GitHub Mode workflows: `GITHUB_TOKEN` (ephemeral, per-run, GitHub-managed). This is tracked in `.GITHUB-MODE/runtime/secrets-inventory.json`.

Implication: GitHub Mode is designed to avoid user-managed static secrets wherever possible.

### 1.2 Threat model and trust boundaries

The trigger trust matrix explicitly requires:

- no privileged execution in untrusted contexts,
- no secret exposure to fork PRs,
- explicit privilege gates for elevated operations.

This means any secret supply method must be conditional on trigger trust and fork safety.

### 1.3 OIDC policy

`.GITHUB-MODE/docs/security/0004-oidc-trust-relationships-and-fallback.md` and `.GITHUB-MODE/scripts/check-github-mode-oidc-credentials.ts` codify that:

- workflows should use OIDC where cloud credentials are needed,
- static cloud secrets in workflow env/secrets are prohibited,
- `id-token: write` should exist only on jobs that truly need federation.

### 1.4 Workflow lint rules relevant to secrets

`.GITHUB-MODE/scripts/github-mode-security-lint.ts` adds hard policy checks that materially constrain secret handling:

- explicit permissions are required,
- write permissions in PR contexts require fork guards,
- secret references in PR contexts require fork guards,
- third-party actions must be SHA-pinned.

This significantly reduces accidental secret exfiltration paths.

---

## 2) What this repository actually uses today

### 2.1 GitHub-hosted ephemeral token usage

`secrets.GITHUB_TOKEN` is used in multiple workflows (including container login and GitHub API operations), consistent with the inventory intent.

### 2.2 User-managed secret usage present outside GitHub Mode scope

`secrets.GH_APP_PRIVATE_KEY` is used in labeler/auto-response/stale workflows to mint GitHub App installation tokens through `actions/create-github-app-token`.

This is an important distinction:

- **GitHub Mode workflows**: policy wants minimal/no static secrets.
- **Repository-wide workflows**: some still rely on static app private key secret material.

### 2.3 OIDC scaffold posture

The OIDC deploy scaffold declares `id-token: write` on deploy job and binds deployment to environment (`github-mode-${inputs.environment}`), matching GitHub Mode’s intended federation model.

---

## 3) How OpenClaw stores secrets (runtime perspective)

OpenClaw secret persistence is intentionally split by scope:

1. **State root** defaults to `~/.openclaw` (override: `OPENCLAW_STATE_DIR`).
2. **Per-agent auth store** at `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`.
3. **Legacy OAuth import file** at `~/.openclaw/credentials/oauth.json`.
4. **Channel credentials** under `~/.openclaw/credentials/...` (for channel-specific auth artifacts like WhatsApp creds).

The docs explicitly describe this as a token sink model where runtime credentials are read from `auth-profiles.json` and migrated/imported as needed.

Operationally, this means GitHub-delivered secrets should generally land in one of two places:

- runtime environment variables consumed at process start, or
- generated config/auth files in state paths (`auth-profiles.json` / channel credential files).

---

## 4) Complete ways to supply secrets from GitHub

Below is the full delivery surface, from most preferred (GitHub Mode-aligned) to least preferred.

## A. Ephemeral `GITHUB_TOKEN` (default for GitHub API/repo operations)

**How**

- Use workflow/job `permissions` to scope minimal access.
- Consume via `${{ secrets.GITHUB_TOKEN }}` or implicit token in GitHub Actions APIs.

**Best for**

- checkout, PR comments, labels, status updates, artifact/release actions in same repo.

**Pros**

- auto-rotated per job,
- no manual key management,
- aligns with `.GITHUB-MODE/runtime/secrets-inventory.json` baseline.

**Limits**

- not suitable for external cloud/provider auth unless exchanged via OIDC or chained systems.

## B. OIDC federation (`id-token: write`) -> cloud short-lived credentials -> secret manager

**How**

1. Workflow requests `id-token: write` only on deploy/federation job.
2. Job exchanges GitHub OIDC JWT with cloud IAM trust policy.
3. Job reads runtime secrets from cloud secret manager (AWS/GCP/Azure).
4. Job injects only short-lived/session-scoped values into OpenClaw process steps.

**Best for**

- deployments, production credential retrieval, high-assurance CI.

**Pros**

- no static cloud secret in GitHub,
- auditable trust relationship,
- shortest secret lifetime.

**GitHub Mode alignment**

- this is the preferred path and is enforced by `check-github-mode-oidc-credentials.ts`.

## C. Environment secrets (GitHub Environments: dev/staging/prod)

**How**

- Define secrets in environment scope,
- gate access by required reviewers / branch policies,
- map jobs to `environment: github-mode-<env>`.

**Best for**

- transitional workflows, environment-specific non-cloud credentials, controlled break-glass.

**Pros**

- tighter blast radius than repo secrets,
- native approval gates.

**Risks**

- still static at rest in GitHub; must be rotated and inventory-tracked.

**GitHub Mode status**

- allowed by policy docs in principle, but current GitHub Mode inventory says no user-managed secrets are needed now.

## D. Repository secrets

**How**

- Store in repo secret store; reference via `${{ secrets.NAME }}`.

**Best for**

- non-environment-scoped credentials where OIDC is impossible.

**Pros**

- easy to wire.

**Risks**

- broad blast radius,
- hard to segment by deployment stage,
- higher accidental exposure risk if guardrails regress.

**Recommendation**

- avoid for cloud creds under GitHub Mode; use only as last resort for non-federable systems.

## E. Organization secrets (selected repositories)

**How**

- manage centrally at org level, scoped to selected repos.

**Best for**

- shared automation credentials across many repos.

**Pros**

- centralized rotation/governance.

**Risks**

- cross-repo blast radius if over-shared.

**Use with OpenClaw**

- acceptable only for carefully scoped shared credentials and only outside strict GitHub Mode minimal-secret posture.

## F. GitHub App authentication chain

**How**

1. Store app private key as a secret (`GH_APP_PRIVATE_KEY`).
2. Use `actions/create-github-app-token` to mint short-lived installation token.
3. Use minted token for GitHub API actions.

**Best for**

- automations needing app identity or scopes not suitable for `GITHUB_TOKEN`.

**Pros**

- operationally useful for cross-repo/org automations.

**Risks**

- private key is static sensitive material,
- must be carefully scoped/rotated.

**Repository reality**

- this pattern is already used in non-GitHub-Mode workflows.

## G. Reusable workflow secret forwarding

**How**

- caller workflow passes specific secrets (`secrets: { ... }`) or `secrets: inherit` to called workflow.

**Best for**

- centralizing deployment logic in reusable workflows.

**Pros**

- DRY pipeline architecture.

**Risks**

- `inherit` can overexpose secrets to called workflows.

**Recommendation**

- prefer explicit named mapping over `inherit`; keep called workflow minimal-permission and trusted-only triggers.

## H. Dependabot / Codespaces secret stores (adjacent GitHub channels)

**How**

- Dependabot secrets for dependency update jobs,
- Codespaces secrets for developer environment bootstrap.

**Best for**

- specific platform channels, not general CI runtime secrets.

**Use for OpenClaw**

- usually not primary for GitHub Actions-driven OpenClaw runtime provisioning.

## I. GitHub Variables (`vars`) + secrets composition

**How**

- put non-sensitive selectors in `vars` (region, endpoint, profile names), sensitive values in `secrets`/OIDC retrieval.

**Why important**

- reduces secret sprawl,
- keeps templating and routing separate from credentials.

---

## 5) Mapping GitHub supply methods to OpenClaw secret sinks

When CI/CD needs to provision OpenClaw, you typically need to set one or more:

- model API keys/tokens,
- OAuth refresh/access materials,
- channel bot tokens,
- optional pairing/allowlist material.

Recommended mapping:

1. **Preferred**: OIDC -> cloud secret manager -> write to runtime env (`ANTHROPIC_API_KEY`, etc.) for process lifetime only.
2. **If persistent state required on host**: use OpenClaw CLI to write into `auth-profiles.json` and channel credential stores from ephemeral CI values.
3. **For GitHub API-only actions**: use `GITHUB_TOKEN` or GitHub App installation token.

Avoid writing secrets into repo files; OpenClaw is already designed to keep runtime credentials in state paths under `~/.openclaw`.

---

## 6) Risk analysis and hardening recommendations

## Immediate hardening opportunities

1. Keep GitHub Mode inventory truthful by ensuring any new `${{ secrets.* }}` in `github-mode-*` workflows updates both docs + JSON inventory.
2. Continue banning static cloud secret patterns through `check-github-mode-oidc-credentials.ts`.
3. Add explicit secret-name allowlist for GitHub Mode workflows (currently mostly policy-by-convention).
4. Ensure all workflows that can run on PR contexts keep fork guards on any write/secret pathways.

## OpenClaw runtime hardening implications

1. Prefer per-agent auth isolation; never share `agentDir` between agents.
2. Keep long-lived creds only in state directory files (not checked-in config).
3. Use process-level env for ephemeral runs; use `auth-profiles.json` only when persistence is required.

---

## 7) Decision matrix: which secret path to choose

- Need GitHub API access in repo only -> `GITHUB_TOKEN`.
- Need GitHub API as app identity/cross-repo -> GitHub App token minting (from app private key secret).
- Need cloud credentials for deploy -> OIDC federation (preferred).
- Need env-specific static credential and OIDC unavailable -> environment secret (with approvals) as temporary fallback.
- Need broad shared secret across many repos -> org secret (strict scope + rotation).
- Need non-sensitive runtime selector -> GitHub variable (`vars`).

---

## 8) Practical implementation blueprint for OpenClaw deployments from GitHub

1. **Gate** deploy workflows by GitHub Environment and required reviewers.
2. **Federate** using OIDC, not static cloud keys.
3. **Fetch** OpenClaw-needed secrets from cloud secret manager at runtime.
4. **Inject** as ephemeral env vars for transient jobs, or write via OpenClaw commands to state files on target host if persistence is needed.
5. **Verify** with OpenClaw health/status checks and redact logs.
6. **Rotate** via source system, not by editing repo files.

This blueprint aligns GitHub Mode policy intent with OpenClaw’s credential storage architecture.
