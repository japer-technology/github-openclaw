/**
 * Upstream additions-only guard.
 *
 * Ensures that GitHub Mode changes are purely additive relative to
 * upstream OpenClaw — no modifications to upstream-owned files.
 * This allows the fork to cleanly pull upstream upgrades.
 *
 * Owned paths (safe to add/modify):
 *   - .GITHUB-MODE/**
 *   - .github/workflows/github-mode-*
 *
 * Everything else is upstream-owned and must not be modified.
 */

import { execSync } from "node:child_process";
import process from "node:process";

export const GITHUB_MODE_OWNED_PATTERNS = [
  /^\.GITHUB-MODE\//,
  /^\.github\/workflows\/github-mode-/,
];

export function isGithubModeOwned(filePath: string): boolean {
  return GITHUB_MODE_OWNED_PATTERNS.some((pattern) => pattern.test(filePath));
}

export type DiffEntry = { status: string; path: string };

export function parseDiffEntries(diffOutput: string): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const line of diffOutput.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 2) {
      continue;
    }
    const status = parts[0].trim();
    if (status.startsWith("R") || status.startsWith("C")) {
      // Renames (R100) and copies (C100) have two paths: old\tnew
      entries.push({ status, path: parts[1].trim() });
      if (parts.length >= 3) {
        entries.push({ status, path: parts[2].trim() });
      }
    } else {
      entries.push({ status, path: parts[1].trim() });
    }
  }
  return entries;
}

export function findViolations(entries: DiffEntry[]): string[] {
  const violations: string[] = [];
  for (const entry of entries) {
    if (entry.status === "A") {
      continue;
    }
    if (!isGithubModeOwned(entry.path)) {
      violations.push(`${entry.status}\t${entry.path}`);
    }
  }
  return violations;
}

function determineBaseRef(): string {
  for (const branch of ["main", "master"]) {
    try {
      execSync(`git rev-parse --verify origin/${branch}`, { stdio: "pipe" });
      return `origin/${branch}`;
    } catch {
      // Try next branch name
    }
  }
  console.log("No remote base branch found. Comparing against HEAD~1.");
  return "HEAD~1";
}

function getModifiedUpstreamFiles(): string[] {
  const baseRef = determineBaseRef();

  let diffOutput: string;
  try {
    diffOutput = execSync(`git diff --name-status ${baseRef}...HEAD`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    try {
      diffOutput = execSync(`git diff --name-status HEAD~1..HEAD`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      console.log("Cannot determine diff base. Skipping additions-only check.");
      return [];
    }
  }

  if (!diffOutput) {
    return [];
  }

  return findViolations(parseDiffEntries(diffOutput));
}

function main(): void {
  console.log("Checking that GitHub Mode changes are additions-only...\n");

  const violations = getModifiedUpstreamFiles();

  if (violations.length === 0) {
    console.log(
      "✅ All changes are additive. No upstream-owned files were modified.\n" +
        "   The fork can cleanly pull upstream OpenClaw upgrades.",
    );
    return;
  }

  console.error("❌ Non-additive changes detected in upstream-owned files:\n");
  for (const v of violations) {
    console.error(`   ${v}`);
  }
  console.error(
    "\nGitHub Mode changes must be purely additive — only new files or\n" +
      "modifications to GitHub-Mode-owned paths are allowed.\n" +
      "\nOwned paths:\n" +
      "  - .GITHUB-MODE/**\n" +
      "  - .github/workflows/github-mode-*\n" +
      "\nTo fix: move your changes into GitHub-Mode-owned paths or\n" +
      "use the extension system (extensions/) for runtime additions.",
  );
  process.exit(1);
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-upstream-additions-only.ts")
) {
  main();
}
