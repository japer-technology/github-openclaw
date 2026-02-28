import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type JsonObject = Record<string, unknown>;

const TEMPLATE_BASELINE_PATH = ".GITHUB-MODE/runtime/template-baseline.json";

function readJson(filePath: string, root: string): JsonObject {
  const fullPath = path.join(root, filePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as JsonObject;
}

export type TemplateDriftResult = {
  drifted: boolean;
  findings: TemplateDriftFinding[];
};

export type TemplateDriftFinding = {
  category: "missing-file" | "missing-workflow" | "missing-label";
  item: string;
  message: string;
  guidance: string;
};

export function checkTemplateDrift(root: string): TemplateDriftResult {
  const baseline = readJson(TEMPLATE_BASELINE_PATH, root);
  const findings: TemplateDriftFinding[] = [];

  const requiredFiles = baseline.requiredFiles;
  if (Array.isArray(requiredFiles)) {
    for (const file of requiredFiles) {
      if (typeof file !== "string") {
        continue;
      }
      const fullPath = path.join(root, file);
      if (!existsSync(fullPath)) {
        findings.push({
          category: "missing-file",
          item: file,
          message: `Required file "${file}" is missing.`,
          guidance: `Create "${file}" to match the template baseline. See .GITHUB-MODE/runtime/template-baseline.json for the full list.`,
        });
      }
    }
  }

  const requiredWorkflows = baseline.requiredWorkflows;
  if (Array.isArray(requiredWorkflows)) {
    for (const workflow of requiredWorkflows) {
      if (typeof workflow !== "string") {
        continue;
      }
      const workflowPath = path.join(root, ".github", "workflows", workflow);
      if (!existsSync(workflowPath)) {
        findings.push({
          category: "missing-workflow",
          item: workflow,
          message: `Required workflow "${workflow}" is missing.`,
          guidance: `Create ".github/workflows/${workflow}" to match the template baseline.`,
        });
      }
    }
  }

  const requiredLabels = baseline.requiredLabels;
  if (Array.isArray(requiredLabels)) {
    const labelerPath = path.join(root, ".github", "labeler.yml");
    const labelerContent = existsSync(labelerPath) ? readFileSync(labelerPath, "utf8") : "";

    for (const label of requiredLabels) {
      if (typeof label !== "string") {
        continue;
      }
      const labelPattern = new RegExp(`^"${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":`, "m");
      if (!labelPattern.test(labelerContent)) {
        findings.push({
          category: "missing-label",
          item: label,
          message: `Required label "${label}" is not configured in .github/labeler.yml.`,
          guidance: `Add a "${label}" entry to .github/labeler.yml so PRs touching related paths are auto-labeled.`,
        });
      }
    }
  }

  return { drifted: findings.length > 0, findings };
}

export function validateTemplateBaselineContract(root: string): void {
  const config = readJson(TEMPLATE_BASELINE_PATH, root);

  if (!config.schemaVersion) {
    throw new Error(`${TEMPLATE_BASELINE_PATH}: missing required key \`schemaVersion\``);
  }
  if (!config.baselineVersion) {
    throw new Error(`${TEMPLATE_BASELINE_PATH}: missing required key \`baselineVersion\``);
  }

  const requiredFiles = config.requiredFiles;
  if (!Array.isArray(requiredFiles) || requiredFiles.length === 0) {
    throw new Error(`${TEMPLATE_BASELINE_PATH}: requiredFiles must be a non-empty array`);
  }
}

function formatSummary(result: TemplateDriftResult): string {
  if (!result.drifted) {
    return "Template drift check passed. No drift detected.";
  }

  const lines = ["Template drift detected:", ""];
  for (const finding of result.findings) {
    lines.push(`- [${finding.category}] ${finding.item}: ${finding.message}`);
    lines.push(`  Guidance: ${finding.guidance}`);
  }
  return lines.join("\n");
}

function main(): void {
  const root = process.cwd();

  validateTemplateBaselineContract(root);

  const result = checkTemplateDrift(root);
  const summary = formatSummary(result);

  console.log(summary);

  if (result.drifted) {
    process.exit(1);
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-template-drift.ts")
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
