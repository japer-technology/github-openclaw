import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type JsonObject = Record<string, unknown>;

const COMMAND_POLICY_PATH = ".GITHUB-MODE/runtime/command-policy.json";
const TRUST_LEVELS_PATH = ".GITHUB-MODE/runtime/trust-levels.json";
const PARITY_MATRIX_PATH = ".GITHUB-MODE/runtime/parity-matrix.json";

function readJson(filePath: string, root: string): JsonObject {
  const fullPath = path.join(root, filePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as JsonObject;
}

export type DriftResult = {
  drifted: boolean;
  findings: DriftFinding[];
};

export type DriftFinding = {
  source: string;
  field: string;
  message: string;
  remediation: string;
};

export function checkPolicyDrift(root: string): DriftResult {
  const findings: DriftFinding[] = [];

  const commandPolicy = readJson(COMMAND_POLICY_PATH, root);
  if (commandPolicy.enforcementMode !== "enforce") {
    findings.push({
      source: COMMAND_POLICY_PATH,
      field: "enforcementMode",
      message: `Expected "enforce", found "${String(commandPolicy.enforcementMode)}".`,
      remediation: `Set enforcementMode to "enforce" in ${COMMAND_POLICY_PATH}.`,
    });
  }

  const allowedActions = commandPolicy.allowedActions;
  if (!Array.isArray(allowedActions) || allowedActions.length === 0) {
    findings.push({
      source: COMMAND_POLICY_PATH,
      field: "allowedActions",
      message: "allowedActions must be a non-empty array.",
      remediation: `Add at least one action to allowedActions in ${COMMAND_POLICY_PATH}.`,
    });
  }

  const constraints = commandPolicy.constraints;
  if (!Array.isArray(constraints) || constraints.length === 0) {
    findings.push({
      source: COMMAND_POLICY_PATH,
      field: "constraints",
      message: "constraints must be a non-empty array.",
      remediation: `Add at least one constraint to ${COMMAND_POLICY_PATH}.`,
    });
  }

  const trustLevels = readJson(TRUST_LEVELS_PATH, root);
  const levels = trustLevels.levels;
  if (!Array.isArray(levels)) {
    findings.push({
      source: TRUST_LEVELS_PATH,
      field: "levels",
      message: "levels must be an array.",
      remediation: `Define trust levels in ${TRUST_LEVELS_PATH}.`,
    });
  } else {
    const hasUntrusted = levels.some(
      (level) =>
        typeof level === "object" && level !== null && (level as JsonObject).id === "untrusted",
    );
    if (!hasUntrusted) {
      findings.push({
        source: TRUST_LEVELS_PATH,
        field: "levels",
        message: 'Missing required "untrusted" trust level.',
        remediation: `Add an "untrusted" level to ${TRUST_LEVELS_PATH}.`,
      });
    }

    const hasTrusted = levels.some(
      (level) =>
        typeof level === "object" && level !== null && (level as JsonObject).id === "trusted",
    );
    if (!hasTrusted) {
      findings.push({
        source: TRUST_LEVELS_PATH,
        field: "levels",
        message: 'Missing required "trusted" trust level.',
        remediation: `Add a "trusted" level to ${TRUST_LEVELS_PATH}.`,
      });
    }
  }

  const parity = readJson(PARITY_MATRIX_PATH, root);
  const mappings = parity.mappings;
  if (!Array.isArray(mappings)) {
    findings.push({
      source: PARITY_MATRIX_PATH,
      field: "mappings",
      message: "mappings must be an array.",
      remediation: `Define parity mappings in ${PARITY_MATRIX_PATH}.`,
    });
  } else {
    for (const [index, mapping] of mappings.entries()) {
      const row = mapping as JsonObject;
      if (!row.workflow || !row.parity) {
        findings.push({
          source: PARITY_MATRIX_PATH,
          field: `mappings[${index}]`,
          message: "Mapping missing required workflow or parity field.",
          remediation: `Add workflow and parity fields to mappings[${index}] in ${PARITY_MATRIX_PATH}.`,
        });
      }
    }
  }

  return { drifted: findings.length > 0, findings };
}

function formatSummary(result: DriftResult): string {
  if (!result.drifted) {
    return "Policy/route drift check passed. No drift detected.";
  }

  const lines = ["Policy/route drift detected:", ""];
  for (const finding of result.findings) {
    lines.push(`- [${finding.source}] ${finding.field}: ${finding.message}`);
    lines.push(`  Remediation: ${finding.remediation}`);
  }
  return lines.join("\n");
}

function main(): void {
  const root = process.cwd();
  const result = checkPolicyDrift(root);
  const summary = formatSummary(result);

  console.log(summary);

  if (result.drifted) {
    process.exit(1);
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-policy-drift.ts")
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
