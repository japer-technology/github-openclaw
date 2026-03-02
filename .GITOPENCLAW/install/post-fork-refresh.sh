#!/usr/bin/env bash
# post-fork-refresh.sh — Remove upstream-only files after syncing fork with master.
#
# Usage:
#   bash .GITOPENCLAW/install/post-fork-refresh.sh
#
# Run this after `git merge upstream/main` to strip files that are not needed
# for GITOPENCLAW execution. See .GITOPENCLAW/docs/FORK-REFRESH-FILE-REMOVAL-ANALYSIS.md
# for the full rationale and per-category justification.
#
# Files kept:
#   .GITOPENCLAW/   — agent core (lifecycle, state, config, docs, tests)
#   .github/        — workflows, issue templates, actions
#   .gitignore      — prevents accidental commits
#   .gitattributes  — line ending normalization
#   LICENSE         — legally required

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "=== GITOPENCLAW Post-Fork-Refresh Cleanup ==="
echo "Repo: $REPO_ROOT"
echo ""

# ── Directories to remove ────────────────────────────────────────────────────
REMOVE_DIRS=(
  src
  apps
  docs
  extensions
  vendor
  ui
  skills
  Swabble
  scripts
  test
  packages
  assets
  changelog
  git-hooks
  patches
  .agent
  .agents
  .pi
  .vscode
)

# ── Top-level files to remove ────────────────────────────────────────────────
REMOVE_FILES=(
  CHANGELOG.md
  .secrets.baseline
  pnpm-lock.yaml
  README.md
  appcast.xml
  AGENTS.md
  CLAUDE.md
  SECURITY.md
  VISION.md
  CONTRIBUTING.md
  package.json
  setup-podman.sh
  docker-setup.sh
  docs.acp.md
  openclaw.mjs
  openclaw.podman.env
  pnpm-workspace.yaml
  render.yaml
  pyproject.toml
  tsconfig.json
  tsconfig.plugin-sdk.dts.json
  tsdown.config.ts
  fly.toml
  fly.private.toml
  docker-compose.yml
  Dockerfile
  Dockerfile.sandbox
  Dockerfile.sandbox-browser
  Dockerfile.sandbox-common
  .env.example
  .dockerignore
  .detect-secrets.cfg
  .mailmap
  .markdownlint-cli2.jsonc
  .npmrc
  .oxfmtrc.jsonc
  .oxlintrc.json
  .pre-commit-config.yaml
  .shellcheckrc
  .swiftformat
  .swiftlint.yml
  zizmor.yml
  vitest.config.ts
  vitest.unit.config.ts
  vitest.live.config.ts
  vitest.gateway.config.ts
  vitest.extensions.config.ts
  vitest.e2e.config.ts
)

removed_dirs=0
removed_files=0
skipped=0

for dir in "${REMOVE_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    git rm -rf --quiet "$dir" && ((removed_dirs++)) || true
  else
    ((skipped++)) || true
  fi
done

for file in "${REMOVE_FILES[@]}"; do
  if [ -f "$file" ]; then
    git rm --quiet "$file" && ((removed_files++)) || true
  else
    ((skipped++)) || true
  fi
done

echo "Removed: $removed_dirs directories, $removed_files files"
echo "Skipped (already absent): $skipped"
echo ""
echo "Remaining tracked files: $(git ls-files | wc -l)"
echo ""

if ! git diff --cached --quiet; then
  echo "Changes staged. Commit with:"
  echo "  git commit -m 'chore: post-fork-refresh cleanup — remove upstream-only files'"
else
  echo "No changes to commit (files were already removed)."
fi
