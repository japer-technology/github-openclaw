import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

const SCOREBOARD_PATH = ".GITHUB-MODE/runtime/implementation-scoreboard.json";
const SPEC_ARTIFACT_PREFIX = ".GITHUB-MODE/docs/planning/";

export type ScoreState = "spec-only" | "scaffold" | "operational";

export type Capability = {
  id: string;
  description: string;
  state: ScoreState;
  evidence?: string[];
};

export type Scoreboard = {
  version: number;
  capabilities: Capability[];
};

export type DiffEntry = {
  status: string;
  path: string;
};

type ReportFormat = "json" | "markdown";

type CliOptions = {
  summary: boolean;
  reportFile?: string;
  reportFormat: ReportFormat;
};

export function parseDiffEntries(diffOutput: string): DiffEntry[] {
  const entries: DiffEntry[] = [];

  for (const line of diffOutput.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 2) {
      continue;
    }

    const status = parts[0].trim();
    if (status.startsWith("R") || status.startsWith("C")) {
      entries.push({ status, path: parts[1].trim() });
      if (parts[2]) {
        entries.push({ status, path: parts[2].trim() });
      }
      continue;
    }

    entries.push({ status, path: parts[1].trim() });
  }

  return entries;
}

function determineBaseRef(): string {
  for (const branch of ["main", "master"]) {
    try {
      execSync(`git rev-parse --verify origin/${branch}`, { stdio: "pipe" });
      return `origin/${branch}`;
    } catch {
      // Try next branch name.
    }
  }

  return "HEAD~1";
}

function getDiffEntries(): DiffEntry[] {
  const baseRef = determineBaseRef();

  try {
    const diffOutput = execSync(`git diff --name-status ${baseRef}...HEAD`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (!diffOutput) {
      return [];
    }

    return parseDiffEntries(diffOutput);
  } catch {
    return [];
  }
}

export function isSpecArtifact(path: string): boolean {
  return (
    path.startsWith(SPEC_ARTIFACT_PREFIX) && path.endsWith(".md") && !path.endsWith("/README.md")
  );
}

export function getAddedSpecArtifacts(entries: DiffEntry[]): string[] {
  const additions = new Set<string>();
  for (const entry of entries) {
    if (entry.status === "A" && isSpecArtifact(entry.path)) {
      additions.add(entry.path);
    }
  }
  return [...additions].toSorted();
}

export function hasScoreboardUpdate(entries: DiffEntry[]): boolean {
  return entries.some((entry) => entry.path === SCOREBOARD_PATH && entry.status !== "D");
}

export function loadScoreboard(path = SCOREBOARD_PATH): Scoreboard {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as Scoreboard;
  return parsed;
}

export function validateScoreboard(scoreboard: Scoreboard): void {
  const allowedStates: ScoreState[] = ["spec-only", "scaffold", "operational"];

  if (!Array.isArray(scoreboard.capabilities) || scoreboard.capabilities.length === 0) {
    throw new Error("implementation-scoreboard.json must contain at least one capability.");
  }

  const ids = new Set<string>();
  for (const capability of scoreboard.capabilities) {
    if (!capability.id || !capability.description) {
      throw new Error("Each capability requires non-empty id and description fields.");
    }
    if (ids.has(capability.id)) {
      throw new Error(`Duplicate capability id found: ${capability.id}`);
    }
    ids.add(capability.id);

    if (!allowedStates.includes(capability.state)) {
      throw new Error(
        `Capability ${capability.id} has invalid state "${capability.state}". ` +
          `Expected one of: ${allowedStates.join(", ")}.`,
      );
    }
  }
}

export function getScoreCounts(scoreboard: Scoreboard): Record<ScoreState, number> {
  const counts: Record<ScoreState, number> = {
    "spec-only": 0,
    scaffold: 0,
    operational: 0,
  };

  for (const capability of scoreboard.capabilities) {
    counts[capability.state] += 1;
  }

  return counts;
}

export function renderSummaryMarkdown(scoreboard: Scoreboard): string {
  const counts = getScoreCounts(scoreboard);
  const total = scoreboard.capabilities.length;
  const operationalRatio = `${counts.operational}/${total}`;

  return [
    `- Capabilities tracked: **${total}**`,
    `- Operational: **${counts.operational}**`,
    `- Scaffold: **${counts.scaffold}**`,
    `- Spec-only: **${counts["spec-only"]}**`,
    `- Implementation ratio (operational/total): **${operationalRatio}**`,
  ].join("\n");
}

export function buildParityReport(scoreboard: Scoreboard): {
  generatedAt: string;
  scoreboardVersion: number;
  summary: string;
  counts: Record<ScoreState, number>;
  totalCapabilities: number;
  capabilities: Capability[];
} {
  const counts = getScoreCounts(scoreboard);

  return {
    generatedAt: "1970-01-01T00:00:00.000Z",
    scoreboardVersion: scoreboard.version,
    summary: renderSummaryMarkdown(scoreboard),
    counts,
    totalCapabilities: scoreboard.capabilities.length,
    capabilities: [...scoreboard.capabilities].toSorted((a, b) => a.id.localeCompare(b.id)),
  };
}

export function renderParityReportMarkdown(scoreboard: Scoreboard): string {
  const report = buildParityReport(scoreboard);
  const header = [
    "# GitHub Mode Parity Report",
    "",
    `Generated at: ${report.generatedAt}`,
    `Scoreboard version: ${report.scoreboardVersion}`,
    "",
    "## Summary",
    report.summary,
    "",
    "## Capabilities",
    "| ID | State | Description |",
    "| --- | --- | --- |",
  ];

  const capabilities = report.capabilities.map(
    (capability) => `| ${capability.id} | ${capability.state} | ${capability.description} |`,
  );

  return [...header, ...capabilities].join("\n");
}

export function writeParityReport(
  scoreboard: Scoreboard,
  outputPath: string,
  format: ReportFormat,
): void {
  const reportContent =
    format === "json"
      ? `${JSON.stringify(buildParityReport(scoreboard), null, 2)}\n`
      : `${renderParityReportMarkdown(scoreboard)}\n`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, reportContent, "utf8");
}

export function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    summary: false,
    reportFormat: "markdown",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--summary") {
      options.summary = true;
      continue;
    }

    if (arg === "--report-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--report-file requires a file path argument.");
      }
      options.reportFile = value;
      index += 1;
      continue;
    }

    if (arg === "--report-format") {
      const value = args[index + 1];
      if (value !== "json" && value !== "markdown") {
        throw new Error("--report-format must be either 'json' or 'markdown'.");
      }
      options.reportFormat = value;
      index += 1;
      continue;
    }
  }

  return options;
}

export function enforceSpecToImplementationTracking(entries: DiffEntry[]): void {
  const addedSpecs = getAddedSpecArtifacts(entries);
  if (addedSpecs.length === 0) {
    return;
  }

  if (!hasScoreboardUpdate(entries)) {
    throw new Error(
      [
        "New planning/spec artifacts were added without updating implementation scoreboard.",
        "Added artifacts:",
        ...addedSpecs.map((artifact) => `  - ${artifact}`),
        `Update ${SCOREBOARD_PATH} in the same change to keep spec-vs-implementation tracking current.`,
      ].join("\n"),
    );
  }
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  const entries = getDiffEntries();
  const scoreboard = loadScoreboard();
  validateScoreboard(scoreboard);

  if (options.reportFile) {
    writeParityReport(scoreboard, options.reportFile, options.reportFormat);
    console.log(`📄 Wrote parity report to ${options.reportFile}`);
  }

  if (options.summary) {
    console.log(renderSummaryMarkdown(scoreboard));
    return;
  }

  enforceSpecToImplementationTracking(entries);

  console.log("✅ Implementation scoreboard is valid and spec tracking guard passed.");
  console.log(renderSummaryMarkdown(scoreboard));
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-implementation-scoreboard.ts")
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
