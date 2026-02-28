import { execSync } from "node:child_process";
import process from "node:process";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type BreakingChange = {
  filePath: string;
  kind: "removed-key" | "renamed-key" | "required-semantics";
  path: string;
  detail: string;
};

type VersionCheck = {
  filePath: string;
  ok: boolean;
  detail: string;
};

type CompatibilityResult = {
  breakingChanges: BreakingChange[];
  versionChecks: VersionCheck[];
  migrationNoteAdded: boolean;
  errors: string[];
};

const CONTRACT_PATH_PREFIX = ".GITHUB-MODE/runtime/";
const RUNTIME_README_PATH = ".GITHUB-MODE/runtime/README.md";

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonFileAtRef(gitRef: string, filePath: string): JsonValue | null {
  try {
    const raw = execSync(`git show ${gitRef}:${filePath}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return JSON.parse(raw) as JsonValue;
  } catch {
    return null;
  }
}

function readFileAtRef(gitRef: string, filePath: string): string {
  try {
    return execSync(`git show ${gitRef}:${filePath}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

function resolveBaseRef(): string {
  const githubBaseRef = process.env.GITHUB_BASE_REF?.trim();
  if (githubBaseRef) {
    return `origin/${githubBaseRef}`;
  }
  for (const candidate of ["origin/main", "origin/master", "HEAD~1"]) {
    try {
      execSync(`git rev-parse --verify ${candidate}`, { stdio: "pipe" });
      return candidate;
    } catch {
      // Keep searching.
    }
  }
  return "HEAD~1";
}

function listChangedContractFiles(baseRef: string): string[] {
  const raw = execSync(`git diff --name-only ${baseRef}...HEAD`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((filePath) => filePath.startsWith(CONTRACT_PATH_PREFIX))
    .filter((filePath) => filePath.endsWith(".json"));
}

function collectBreakingChanges(
  filePath: string,
  baseValue: JsonValue,
  headValue: JsonValue,
  currentPath = "$",
): BreakingChange[] {
  const changes: BreakingChange[] = [];

  if (isObject(baseValue) && isObject(headValue)) {
    const baseKeys = new Set(Object.keys(baseValue));
    const headKeys = new Set(Object.keys(headValue));

    const removedKeys = [...baseKeys].filter((key) => !headKeys.has(key));
    for (const removedKey of removedKeys) {
      changes.push({
        filePath,
        kind: "removed-key",
        path: `${currentPath}.${removedKey}`,
        detail: `Key removed: ${removedKey}`,
      });
    }

    if (removedKeys.length > 0) {
      const addedKeys = [...headKeys].filter((key) => !baseKeys.has(key));
      for (const addedKey of addedKeys) {
        changes.push({
          filePath,
          kind: "renamed-key",
          path: `${currentPath}.${addedKey}`,
          detail: `Potential key rename detected (removed ${removedKeys.join(", ")} and added ${addedKey})`,
        });
      }
    }

    for (const key of baseKeys) {
      if (!headKeys.has(key)) {
        continue;
      }
      changes.push(
        ...collectBreakingChanges(
          filePath,
          baseValue[key],
          headValue[key],
          `${currentPath}.${key}`,
        ),
      );
    }
    return changes;
  }

  if (Array.isArray(baseValue) && Array.isArray(headValue)) {
    if (currentPath.endsWith(".required")) {
      const baseRequired = baseValue.filter((entry): entry is string => typeof entry === "string");
      const headRequired = new Set(
        headValue.filter((entry): entry is string => typeof entry === "string"),
      );
      const removedRequired = baseRequired.filter((key) => !headRequired.has(key));
      if (removedRequired.length > 0) {
        changes.push({
          filePath,
          kind: "required-semantics",
          path: currentPath,
          detail: `Required keys removed: ${removedRequired.join(", ")}`,
        });
      }
    }
    return changes;
  }

  const fieldName = currentPath.split(".").pop();
  if (
    fieldName === "required" &&
    typeof baseValue === "boolean" &&
    typeof headValue === "boolean"
  ) {
    if (baseValue !== headValue) {
      changes.push({
        filePath,
        kind: "required-semantics",
        path: currentPath,
        detail: `Required semantics changed from ${String(baseValue)} to ${String(headValue)}`,
      });
    }
  }

  return changes;
}

function parseMajor(version: string): number | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1] ?? "", 10);
}

export function hasMajorVersionBump(
  baseValue: JsonValue,
  headValue: JsonValue,
): { ok: boolean; detail: string } {
  if (!isObject(baseValue) || !isObject(headValue)) {
    return { ok: false, detail: "Contract payload is not a JSON object." };
  }

  const versionKeys = Object.keys(baseValue).filter(
    (key) =>
      key.endsWith("Version") && key !== "schemaVersion" && typeof baseValue[key] === "string",
  );

  if (versionKeys.length === 0) {
    return { ok: false, detail: "No top-level *Version key was found in the base contract." };
  }

  for (const key of versionKeys) {
    const baseVersion = baseValue[key];
    const headVersion = headValue[key];
    if (typeof baseVersion !== "string" || typeof headVersion !== "string") {
      continue;
    }

    const baseMajor = parseMajor(baseVersion);
    const headMajor = parseMajor(headVersion);

    if (baseMajor === null || headMajor === null) {
      continue;
    }

    if (headMajor > baseMajor) {
      return {
        ok: true,
        detail: `${key} bumped major version (${baseVersion} -> ${headVersion}).`,
      };
    }
  }

  return {
    ok: false,
    detail: `Breaking change detected but no major bump found in keys: ${versionKeys.join(", ")}.`,
  };
}

function migrationNotesSection(markdown: string): string {
  const header = /^### Migration notes\s*$/m;
  const match = header.exec(markdown);
  if (!match || match.index === undefined) {
    return "";
  }
  const afterHeader = markdown.slice(match.index + match[0].length);
  const nextHeadingMatch = /\n##?\s+|\n###\s+/.exec(afterHeader);
  if (!nextHeadingMatch || nextHeadingMatch.index === undefined) {
    return afterHeader.trim();
  }
  return afterHeader.slice(0, nextHeadingMatch.index).trim();
}

export function hasNewMigrationNote(baseReadme: string, headReadme: string): boolean {
  const baseLines = new Set(
    migrationNotesSection(baseReadme)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== "- _(none yet)_"),
  );

  const headLines = migrationNotesSection(headReadme)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "- _(none yet)_");

  return headLines.some((line) => !baseLines.has(line));
}

export function analyzeCompatibility(
  changedFiles: string[],
  baseContracts: Record<string, JsonValue>,
  headContracts: Record<string, JsonValue>,
  baseReadme: string,
  headReadme: string,
): CompatibilityResult {
  const breakingChanges: BreakingChange[] = [];
  const versionChecks: VersionCheck[] = [];

  for (const filePath of changedFiles) {
    const baseValue = baseContracts[filePath];
    const headValue = headContracts[filePath];

    if (baseValue === undefined || headValue === undefined) {
      continue;
    }

    const fileBreakingChanges = collectBreakingChanges(filePath, baseValue, headValue);
    if (fileBreakingChanges.length === 0) {
      continue;
    }

    breakingChanges.push(...fileBreakingChanges);

    const version = hasMajorVersionBump(baseValue, headValue);
    versionChecks.push({ filePath, ...version });
  }

  const migrationNoteAdded = hasNewMigrationNote(baseReadme, headReadme);

  const errors: string[] = [];
  const filesMissingMajorBump = versionChecks.filter((check) => !check.ok);
  if (breakingChanges.length > 0 && filesMissingMajorBump.length > 0) {
    for (const failedCheck of filesMissingMajorBump) {
      errors.push(`${failedCheck.filePath}: ${failedCheck.detail}`);
    }
  }

  if (breakingChanges.length > 0 && !migrationNoteAdded) {
    errors.push(
      "Breaking changes require a new entry under `.GITHUB-MODE/runtime/README.md` -> `### Migration notes`.",
    );
  }

  return { breakingChanges, versionChecks, migrationNoteAdded, errors };
}

function main(): void {
  const baseRef = resolveBaseRef();
  console.log(`Checking runtime contract compatibility against ${baseRef}...`);

  let changedFiles: string[] = [];
  try {
    changedFiles = listChangedContractFiles(baseRef);
  } catch (error) {
    console.log("Unable to compute changed runtime contract files. Skipping compatibility guard.");
    console.log(String(error));
    return;
  }

  if (changedFiles.length === 0) {
    console.log("✅ No runtime contract JSON files changed.");
    return;
  }

  const baseContracts: Record<string, JsonValue> = {};
  const headContracts: Record<string, JsonValue> = {};

  for (const filePath of changedFiles) {
    const baseValue = parseJsonFileAtRef(baseRef, filePath);
    const headValue = parseJsonFileAtRef("HEAD", filePath);

    if (baseValue === null || headValue === null) {
      continue;
    }

    baseContracts[filePath] = baseValue;
    headContracts[filePath] = headValue;
  }

  const result = analyzeCompatibility(
    changedFiles,
    baseContracts,
    headContracts,
    readFileAtRef(baseRef, RUNTIME_README_PATH),
    readFileAtRef("HEAD", RUNTIME_README_PATH),
  );

  if (result.breakingChanges.length === 0) {
    console.log("✅ No breaking contract changes detected.");
    return;
  }

  console.error("❌ Breaking contract changes detected:\n");
  for (const change of result.breakingChanges) {
    console.error(`- ${change.filePath} :: ${change.kind} @ ${change.path} (${change.detail})`);
  }

  if (result.errors.length > 0) {
    console.error("\nCompatibility requirements not met:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    "\n✅ Breaking changes are accompanied by major version bump(s) and migration notes.",
  );
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-contract-compatibility.ts")
) {
  main();
}
