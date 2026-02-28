# Critique 2: The Documentation Is the Product

## Context

This is a follow-up to [Critique-1.md](Critique-1.md), which identified five structural problems in the original GitHub Mode proposal: narrative framing, persistent memory, supply-chain security, latency mismatch, and happy-path engineering.

Since Critique 1, the `.GITHUB-MODE` document set has expanded substantially. The narrative has been reframed around multiplayer collaboration. Persistent memory design is specified with a data model and failure contracts. A skills quarantine pipeline is thoroughly documented. Latency is explicitly declared as intentional non-parity with a six-checkpoint UX lifecycle. The `overview.md` and `implementation-plan.md` now address most of Critique 1's concerns at the specification level.

This second critique examines what the expanded document set reveals about the project's trajectory. The central observation is that the documentation has become the deliverable rather than a guide to one, and that several structural risks have emerged that did not exist when Critique 1 was written.

---

## Problems identified

### 1. Phantom completion: phases marked done without implementation evidence

The implementation plan marks Phases 0, 1, and 2 as "Complete." Phase 0 is legitimately complete: ADRs exist, the upstream smoke workflows exist independently of GitHub Mode, and the trigger trust matrix document is merged. Phase 1 is defensible: runtime contracts exist as JSON files with schema validators, and `pnpm contracts:github:validate` runs in CI.

Phase 2 is marked complete but its deliverables are partially aspirational:

- **GitHub Environments** (`github-mode-dev`, `github-mode-staging`, `github-mode-prod`): the docs reference these as created, but environments are repository settings, not file artifacts. There is no verification that they actually exist in the repository's settings, and no CI check asserts their presence.
- **Skills quarantine pipeline**: Security doc 0002 describes a thorough pipeline with intake, static scan, policy evaluation, two-party approval, and emergency revocation. The runtime contracts (`skills-quarantine-registry.json`, `trusted-skills-allowlist.json`, `skills-emergency-revocations.json`, `trusted-command-gate.json`) exist. But the pipeline itself is a specification: no actual skill has been scanned by an automated scanner, no actual two-party approval has been executed with distinct human identities, and the test data uses placeholder hashes (`1111111...`, `aaaaaaa...`). The approval records in the registry reference `@openclaw/security-lead` and `@openclaw/runtime-owner` — roles, not people.
- **OIDC integration**: Security doc 0004 specifies OIDC trust relationships and fallback policy. The verification script (`check-github-mode-oidc-credentials.ts`) exists. But no actual cloud trust policy has been configured, and no OIDC token exchange has been tested against a real provider.

Marking a phase "Complete" when the deliverables are documents and placeholder data rather than operational infrastructure creates false confidence in the plan's progress. A reader who trusts the phase status would believe security controls are enforced; in practice, only the contract validation and security lint workflows are running.

**Suggested fix:** Distinguish between "specified" and "operational." A phase is complete when its deliverables are not just documented but verified in a live environment with evidence. Use a status like "Specified — pending operational verification" for Phase 2 deliverables that exist only as documents and contract files.

---

### 2. Single-person governance signing all roles

Every ADR and security document is approved by the same person (Eric Mourant / `@japer`) wearing every hat: Runtime maintainer, GitHub mode maintainer, Security maintainer, Release maintainer. The skills quarantine pipeline (Security 0002) explicitly requires "two-party authorization" with "distinct people" and states "approvers cannot approve their own submitted skill version."

The governance model mandates multi-party control but the governance documents themselves are self-approved. This is not unusual for a project's early stage, but it contradicts the security posture the documents claim. A reader evaluating the project's trust model would find that the documents requiring dual approval were unilaterally approved.

**Suggested fix:** Either acknowledge the bootstrap problem explicitly ("Phase 2 governance is self-certified; external review will be required before production trust claims are valid") or recruit at least one additional reviewer before marking security deliverables as accepted. The approval signoff sections could include a "Bootstrap note" field indicating single-party approval with a date by which multi-party review must be completed.

---

### 3. The overlay boundary is contradicted by the shared-runtime-spine plan

ADR 0001 establishes a clear prohibition: "GitHub mode workflows or actions importing installed runtime internals from `src/**`" is explicitly forbidden. The `check-upstream-additions-only.ts` script enforces this — any modification to files outside `.GITHUB-MODE/` or `.github/workflows/github-mode-*` fails CI.

However, `overview.md` Section 4.1 ("Shared runtime spine") states that GitHub Mode "reuses these core modules":

- `src/auto-reply/reply`
- `src/agents/pi-embedded-runner`
- `src/agents/pi-tools.ts`
- `src/agents/tools/*`
- `src/routing/*`

The implementation plan's Section 3, Guardrail 6 adds: "GitHub Mode TypeScript runtime code lives in `extensions/github/`, never in `src/`."

These three statements are in tension:

1. ADR 0001 says: do not import from `src/`.
2. The overview says: reuse `src/` modules directly.
3. The implementation plan says: use `extensions/github/` as the bridge.

The `extensions/github/` directory does not exist. No extension plugin has been created. The mechanism by which `extensions/github/` would access `src/agents/pi-embedded-runner` without "importing installed runtime internals from `src/**`" is not specified. The plugin SDK (`openclaw/plugin-sdk`) provides a stable API surface, but it re-exports a subset of `src/` capabilities — it does not expose the agent runner, the embedded runner loop, or the tool-policy engine that the overview lists as the shared spine.

The three analysis documents exploring source-code extraction (`Source-Code-Scrape.md`, `Source-Code-Copy.md`, `Source-Code-Pull.md`) acknowledge this tension by proposing to copy `src/` modules into `.GITHUB-MODE/openclaw/`. But this directly contradicts the overlay's core value proposition: zero upstream mutation and clean install/uninstall. A copy of 16 modules duplicated inside `.GITHUB-MODE/` is not an overlay; it is a vendored fork.

**Suggested fix:** Resolve the architectural contradiction before Phase 4. Either:

- (a) Extend the plugin SDK to expose the agent runner, tool-policy, and routing APIs that GitHub Mode needs, maintaining the SDK as the only coupling point. This preserves the overlay boundary.
- (b) Accept that GitHub Mode requires a build-time dependency on `src/` and update ADR 0001 to allow read-only imports from a defined allowlist of `src/` modules. This trades boundary purity for implementation simplicity.
- (c) Adopt the source-copy approach, but reclassify the project from "overlay" to "vendored derivative" and update all documentation that claims conflict-free upstream sync.

Do not leave all three options as open analyses while the plan progresses. The contradiction will block Phase 4 delivery.

---

### 4. Fifty artifacts, one running workflow

The `.GITHUB-MODE` directory contains approximately 50 artifacts: 16 analysis documents, 7 planning documents, 4 security documents, 2 ADRs, 18 runtime contract files, 9 scripts, 3 test suites, and supporting files (README, ACTIVE, LICENCE, SECURITY, assets).

The actual running infrastructure consists of:

- `github-mode-contracts.yml` — validates JSON contract schemas on PR and push.
- `github-mode-security-lint.yml` — lints GitHub Mode workflow files for permission and pinning issues.
- `github-mode-security.yml` — runs environment and OIDC credential checks.
- `github-mode-trusted-command.yml` — a scaffold that checks a skill digest against the allowlist.
- `github-mode-ci-scaffold.yml`, `github-mode-oidc-deploy-scaffold.yml` — scaffolds.
- `github-mode-skill-intake.yml`, `github-mode-skill-static-scan.yml`, `github-mode-skill-policy-classifier.yml`, `github-mode-skill-emergency-revocation.yml` — skill pipeline scaffolds.

Ten workflows exist. Two perform substantive validation (contracts, security lint). The rest are scaffolds that perform partial or placeholder steps. None of the 20+ planned workflows from the overview's Section 8 ("Workflow Portfolio") — the build, check, test, policy, route-sim, eval, cost, command, agent-run, bot-pr, drift, promote-dev/staging/prod, incident, bootstrap-entity, sync-templates, collab-dispatch, collab-receive workflows — have been implemented.

The ratio of documentation to implementation is approximately 40:1 by artifact count. This is a pattern where the documentation IS the product. The analysis layer alone (16 documents including performance analysis, GitHub Actions minute budgets, general theory papers, and applicability studies for other repositories) exceeds the volume of all implementation artifacts combined.

This is not inherently wrong — design-first development is legitimate. But the documentation does not present itself as pre-implementation design. The phase statuses, acceptance criteria checkmarks, and "Complete" labels present a picture of a project that has delivered working infrastructure through its second phase. The actual state is closer to: comprehensive specification with foundational CI validation and workflow scaffolds.

**Suggested fix:** Add a "Project Status" section to the top-level README that honestly reports the ratio. Something like: "Current state: comprehensive specification (Phases 0-1 complete, Phase 2 specified), with contract validation and security lint running in CI. Core workflows (command, agent-run, bot-PR, drift, promotion) are not yet implemented." This sets expectations for new readers and prevents the documentation from functioning as a substitute for delivery.

---

### 5. ACTIVE.md is a feature flag with no implementation

`ACTIVE.md` is described in the README as: "Delete or rename this file and GitHub Mode is completely disabled." This implies runtime behavior that checks for the file's existence.

Nothing checks for this file. No workflow has a condition like `if: hashFiles('.GITHUB-MODE/ACTIVE.md') != ''`. No script reads it. No CI step gates on its presence. The file contains a heading and a logo image.

The feature flag pattern is a good idea — it appears in the General Theory document as "Layer 1" of the five-layer repository wrapper. But an unimplemented feature flag is worse than no feature flag, because it teaches users that deleting the file has an effect when it does not.

**Suggested fix:** Either wire `ACTIVE.md` into the `github-mode-contracts.yml` workflow (fail-fast if absent) so the claim becomes true, or remove the "delete to disable" claim from the file and README until the check is implemented. A single `if` condition in the contracts workflow would make this real.

---

### 6. Runtime contracts are structurally validated but never enforced at runtime

The contract validation pipeline (`pnpm contracts:github:validate`) verifies that JSON files are well-formed, contain required keys, and satisfy structural invariants (for example, `installed-only` entries must have `owner` and `rationale`). This is valuable — it prevents schema drift.

But no workflow or runtime code reads these contracts to make decisions. Consider:

- `command-policy.json` lists `allowedActions: ["plan", "validate", "open-pr"]`. No workflow checks incoming commands against this list.
- `trust-levels.json` defines three tiers with `allowsSecrets` and `allowsPrivilegedMutation` flags. No workflow reads these flags to gate behavior.
- `parity-matrix.json` maps 20 workflows to parity classifications. No CI check verifies that the claimed workflow files actually exist.
- `trusted-command-gate.json` sets `enforcementMode: "fail_closed"` and `allowRuntimeFetch: false`. Only the `enforce-trusted-skill-gate.ts` script reads the gate contract, and only for skill digest verification.

The contracts function as documentation formatted as JSON. They are human-readable specifications that happen to be machine-parseable. But "machine-parseable" is not "machine-enforced." Until a workflow evaluates `trust-levels.json` before granting secret access, or checks `command-policy.json` before executing a command, the contracts are aspirational, not operational.

This matters because the implementation plan's definition of done (Section 12) includes "Security controls are fully GitHub-native, continuously enforced." Structural validation of JSON schemas is necessary but not sufficient for "continuously enforced."

**Suggested fix:** For each runtime contract, define a "consumption point" — the specific workflow step or script that reads the contract and makes a decision based on it. Track these as implementation tasks in `implementation-tasks.md`. Until a consumption point exists, the contract is a specification, not an enforcement mechanism. Label it accordingly.

---

### 7. Multi-entity collaboration is over-engineered for current state

The runtime contracts include `entity-manifest.json`, `entity-manifest.schema.json`, `collaboration-policy.json`, `collaboration-policy.schema.json`, and `collaboration-envelope.schema.json`. These artifacts support the multi-entity collaboration model described in Section 6 of the overview — a Phase 6 deliverable.

The contract validator checks all of these files on every PR. The implementation plan places multi-entity collaboration four phases after the current state (Phase 6 depends on Phase 5, which depends on Phase 4, which depends on Phases 2+3).

Validating Phase 6 contracts in CI before Phase 3 has started creates two risks:

1. **Premature commitment:** The collaboration envelope schema locks in a message format before any entity has sent or received a message. Schema changes later will require migration notes and version bumps against a contract that has never been used.
2. **Validation noise:** Every PR touching `.GITHUB-MODE/` triggers validation of collaboration contracts that no one is working on. If the contracts need to change for Phase 6 reasons, the changes will be reviewed against Phase 2 context where the reviewers lack the implementation experience to evaluate them.

**Suggested fix:** Keep the collaboration schemas as reference specifications but exclude them from mandatory CI validation until Phase 5 is underway. The contract validator could skip files tagged with a `"phase": 6` field, or the schemas could be moved to a `drafts/` subdirectory that is not validated on every PR.

---

### 8. The analysis layer has expanded beyond decision support

The `docs/analysis/` directory contains 16 documents. Several serve clear decision-support functions:

- `why.md` — motivation and positioning
- `non-goals.md` — scope boundaries
- `overlay-implementation.md` — architecture decision analysis
- `performance.md` — quantified performance comparison
- `Critique-1.md` — external feedback

Others have expanded into standalone research papers that do not directly inform implementation decisions:

- `GitHub-Mode-General-Theory.md` — abstracts the pattern into a general "repository wrapper" theory applicable to any GitHub repository.
- `GitHub-Mode-For-Other-Popular-GitHub.md` — applies the theory to five repository archetypes (JS monorepos, Kubernetes controllers, ML repos, security tooling, documentation repos) with wrapper designs for each.
- `GitHub-Actions-Minutes.md` — 300+ lines quantifying runner minute consumption, including a billing analysis for a hypothetical private repository and multi-scenario monthly projections.
- `Source-Code-Scrape.md`, `Source-Code-Copy.md`, `Source-Code-Pull.md` — three separate analyses of how to extract OpenClaw modules for standalone or in-repo GitHub Mode use, including directory structures, copy scripts, binding layer inventories, and sync workflows.

The general theory and cross-repository applicability papers do not inform any open implementation task. The source-code extraction trilogy analyzes an architectural option that has not been selected and that contradicts the current overlay approach.

For a project that has not yet shipped its MVP command workflow, this volume of pre-implementation analysis represents scope creep at the documentation layer. The documents are individually well-written, but collectively they expand the project's intellectual surface area faster than its implementation surface area.

**Suggested fix:** Freeze the analysis layer. No new analysis documents until the MVP workflow portfolio (contract validation + trusted command + bot PR + drift detection) is operational. Existing analyses are valuable as reference material, but further analysis documents should be gated by implementation progress, not produced in parallel with it.

---

### 9. Performance claims lack empirical validation

`performance.md` provides detailed timing estimates across seven dimensions (interaction latency, throughput, cold/warm start, memory performance, tool execution, compute resources, end-to-end task completion). The estimates are internally consistent and plausibly sourced from general knowledge of GitHub Actions infrastructure.

However, every number in the document is an estimate. No benchmark has been run. No workflow has been timed. The latency budget breakdown (Section 5) presents a "typical PR review task" timeline totaling 170 seconds, with specific phase allocations, without citing any actual workflow run.

This matters because the performance analysis is used to set user expectations (Section 7: "What to tell users") and to justify architectural decisions (tiered execution, Cloudflare Workers middle tier, checkpoint co-location). If the estimates are materially wrong — if runner allocation takes 5 seconds instead of 20 on a well-configured pool, or if hydration takes 30 seconds instead of 15 — the optimization priorities change.

**Suggested fix:** Label the performance document as "Projected performance model — no empirical data." When the first substantive GitHub Mode workflows are operational, run benchmarks and update the document with measured values alongside the projections. This transforms the document from speculative to calibrated.

---

### 10. Security documents describe aspirational controls, not operational ones

The security document set (trigger trust matrix, skills quarantine pipeline, secrets inventory, OIDC trust relationships) is thorough and well-structured. The trigger trust matrix (Security 0001) covers 10 threat scenarios with preventive and detective controls. The skills quarantine pipeline (Security 0002) specifies four gates with explicit workflow startup enforcement mapping.

But the controls are described in future tense. The secrets inventory (Security 0003) honestly acknowledges: "GitHub Mode workflows currently require no user-managed repository or environment secrets. They only rely on the GitHub-managed ephemeral GITHUB_TOKEN." The elaborate rotation runbook, emergency revocation flow, and quarterly review cadence are for a scenario that does not yet exist.

The trigger trust matrix describes detective controls like "simulated fork PR test job validates environment variables are absent" and "periodic rule drift checks in governance workflow." These test jobs and governance workflows do not exist.

This is not a criticism of the security design — it is genuinely strong. The problem is presentational: the documents read as descriptions of an operational security posture rather than specifications for one. A security auditor reviewing these documents would need to independently verify which controls are enforced versus documented.

**Suggested fix:** Add an "Implementation status" column to each control in the threat matrix and quarantine pipeline. Mark each as `documented`, `implemented`, or `enforced-in-CI`. This makes the gap between design and implementation visible at a glance and provides a checklist for Phase 2 operational verification.

---

### 11. Test coverage does not match specification depth

Three test files exist:

- `validate-github-runtime-contracts.test.ts` — tests the contract schema validator.
- `check-upstream-additions-only.test.ts` — tests the upstream guard script.
- `github-mode-security-lint.test.ts` — tests the workflow security linter.

These tests cover the three scripts that actually run in CI. They are well-targeted for the current implementation.

But the specification depth vastly exceeds test coverage. The overview document specifies:

- A failure-mode contract with five failure scenarios, each with detection, user-visible error, retry policy, and recovery path (Section 4.3).
- A six-checkpoint lifecycle with required progress emissions, fallback behavior, and degraded-telemetry handling (Section 3.4).
- A user-facing state model with six states and specific CLI and GitHub surface behaviors (Section 3.4).
- Trust-tiered command authorization (Section 7).

None of these specifications have corresponding tests, even at the contract level. For example: the failure-mode contract could be tested by asserting that every failure mode in the overview has a matching entry in a runtime contract. The checkpoint lifecycle could be tested by validating that a hypothetical run trace includes all six checkpoints in order.

Specification without tests is assertion without verification. As the specification grows, the gap between what is claimed and what is proven widens.

**Suggested fix:** For each specification section that describes required runtime behavior, add at least one contract-level test that verifies the specification is internally consistent and traceable. These do not need to test runtime implementation (that comes later), but they should verify that contracts, schemas, and documents agree with each other.

---

## Summary: what the project needs next

The `.GITHUB-MODE` specification is remarkably thorough. The problems identified here are not about quality of thought — the architecture, security model, and planning are strong. The problems are about the gap between specification and implementation, and the project's tendency to expand documentation breadth rather than implementation depth.

The highest-impact changes, in priority order:

1. **Resolve the overlay vs. shared-runtime-spine contradiction** (Problem 3). This is an architectural blocker. Phase 4 cannot be designed coherently while the project simultaneously claims it does not import from `src/` and plans to reuse five `src/` modules.

2. **Ship the MVP workflow portfolio** (Problem 4). Contract validation and security lint are running. The next real milestone is a working trusted-command-to-bot-PR flow, even if it handles only a single command (`explain`) with minimal adaptation.

3. **Recalibrate phase statuses** (Problem 1). Mark Phase 2 as "Specified" rather than "Complete" until the operational deliverables (environments, OIDC, quarantine enforcement) are verified in a live repository setting.

4. **Wire `ACTIVE.md` into CI** (Problem 5). This is a small change that makes a claimed behavior true.

5. **Add implementation-status tracking to security controls** (Problem 10). This is a documentation change that makes the security posture honest without weakening it.

6. **Freeze analysis production** (Problem 8). Redirect the energy currently producing analysis documents into the implementation tasks that remain before MVP.

The project has done the hard work of designing a credible system. The next phase is proving that the design works by building it.
