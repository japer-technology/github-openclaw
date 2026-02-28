# Phase 3 Full-Implementation Checklist

This checklist answers: "What tasks are needed for Phase 3 in `.GITHUB-MODE` to be fully implemented?"

## Current conclusion

- **All Phase 3 code-level implementation tasks are complete** (Tasks 3.1–3.5).
- Phase 3 workstreams are code-complete with scripts, tests, workflows, runtime contracts, and documentation.
- **Operational evidence from real CI runs** is the remaining requirement before each task can be promoted to ✅ Complete.

## Code-complete evidence summary

### Task 3.1 — Core CI Workflow Set Implementation

- Build workflow: `.github/workflows/github-mode-build.yml`
- Check workflow (required PR check): `.github/workflows/github-mode-check.yml`
- Test workflow: `.github/workflows/github-mode-test.yml`
- Policy workflow: `.github/workflows/github-mode-policy.yml`
- Route simulation workflow: `.github/workflows/github-mode-route-sim.yml`
- Eval tier-0 workflow: `.github/workflows/github-mode-eval-tier0.yml`
- Cost workflow: `.github/workflows/github-mode-cost.yml`
- Template sync workflow: `.github/workflows/github-mode-sync-templates.yml`
- Acceptance criteria met: all eight workflows exist, trigger correctly on `.GITHUB-MODE/**` paths, emit deterministic artifacts and markdown summaries, and use SHA-pinned actions.

### Task 3.2 — Untrusted-Safe Fork Execution Paths

- All Phase 3 workflows use `permissions: contents: read` at both workflow and job level.
- No secrets are accessed in any Phase 3 workflow job.
- Fork PRs can execute all workflows safely with read-only access.
- Acceptance criteria met: fork executions complete without secret access, privileged steps are absent, no environment-gated jobs.

### Task 3.3 — Policy/Route Drift Detection

- Drift detection script: `.GITHUB-MODE/scripts/check-policy-drift.ts`
- Tests: `.GITHUB-MODE/test/check-policy-drift.test.ts` (6 test cases)
- CI enforcement: `.github/workflows/github-mode-policy.yml`, `.github/workflows/github-mode-route-sim.yml`, `.github/workflows/github-mode-check.yml`
- Acceptance criteria met: drift detected and surfaced in summaries/artifacts, findings include remediation pointers, drift failures block workflow.

### Task 3.4 — Eval/Cost Threshold Gates

- Eval thresholds script: `.GITHUB-MODE/scripts/check-eval-thresholds.ts`
- Cost thresholds script: `.GITHUB-MODE/scripts/check-cost-thresholds.ts`
- Eval tests: `.GITHUB-MODE/test/check-eval-thresholds.test.ts` (10 test cases)
- Cost tests: `.GITHUB-MODE/test/check-cost-thresholds.test.ts` (9 test cases)
- Runtime contracts: `.GITHUB-MODE/runtime/eval-thresholds.json`, `.GITHUB-MODE/runtime/cost-thresholds.json`
- CI enforcement: `.github/workflows/github-mode-eval-tier0.yml`, `.github/workflows/github-mode-cost.yml`, `.github/workflows/github-mode-check.yml`
- Acceptance criteria met: thresholds are versioned and policy-governed, failing thresholds exit non-zero, gate results attached to run artifacts.

### Task 3.5 — Template Drift + Migration Guidance

- Template drift script: `.GITHUB-MODE/scripts/check-template-drift.ts`
- Tests: `.GITHUB-MODE/test/check-template-drift.test.ts` (10 test cases)
- Runtime contract: `.GITHUB-MODE/runtime/template-baseline.json`
- Label auto-labeling: `.github/labeler.yml` (`github-mode` entry for `.GITHUB-MODE/**` paths)
- CI enforcement: `.github/workflows/github-mode-sync-templates.yml`
- Acceptance criteria met: drift detected against template baseline (files, workflows, and labels), guidance generated in findings, required checks remain green when drift is resolved.

## Verification tasks to keep Phase 3 complete

These are recurring guardrail tasks (not missing implementation work):

1. Run `pnpm contracts:github:validate` and confirm pass (includes new eval/cost/template contracts).
2. Run `pnpm test -- .GITHUB-MODE/test/` and confirm all Phase 3 tests pass.
3. Run Phase 3 scripts directly and confirm pass:
   - `node --import tsx .GITHUB-MODE/scripts/check-policy-drift.ts`
   - `node --import tsx .GITHUB-MODE/scripts/check-eval-thresholds.ts`
   - `node --import tsx .GITHUB-MODE/scripts/check-cost-thresholds.ts`
   - `node --import tsx .GITHUB-MODE/scripts/check-template-drift.ts`
4. Keep `implementation-scoreboard.json` aligned with real capability state.

## Remaining for ✅ Complete promotion

Each task requires immutable operational evidence from real CI workflow runs:

- Task 3.1: `task-3.1-ci-workflow-set-<env>-<YYYYMMDDTHHMMSSZ>.json`
- Task 3.2: `task-3.2-fork-safety-<env>-<YYYYMMDDTHHMMSSZ>.json`
- Task 3.3: `task-3.3-policy-drift-detection-<env>-<YYYYMMDDTHHMMSSZ>.json`
- Task 3.4: `task-3.4-eval-cost-thresholds-<env>-<YYYYMMDDTHHMMSSZ>.json`
- Task 3.5: `task-3.5-template-drift-detection-<env>-<YYYYMMDDTHHMMSSZ>.json`
