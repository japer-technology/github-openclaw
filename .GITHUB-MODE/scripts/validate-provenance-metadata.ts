import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv from "ajv";

type JsonObject = Record<string, unknown>;

const PROVENANCE_SCHEMA_PATH = ".GITHUB-MODE/runtime/provenance-metadata.schema.json";
const COMMAND_POLICY_PATH = ".GITHUB-MODE/runtime/command-policy.json";

export type ProvenanceMetadata = {
  source_command: string;
  commit_sha: string;
  run_id: string;
  policy_version: string;
};

export type ProvenanceValidationResult = {
  gate: "provenance-metadata";
  result: "PASS" | "FAIL";
  reason: string;
  evidence: string;
  provenance: ProvenanceMetadata | null;
  timestamp: string;
};

const REQUIRED_PROVENANCE_FIELDS = [
  "source_command",
  "commit_sha",
  "run_id",
  "policy_version",
] as const;

function readJson(filePath: string, root: string): JsonObject {
  const fullPath = path.join(root, filePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as JsonObject;
}

/**
 * Validate provenance metadata against the provenance-metadata.schema.json schema.
 *
 * Fail-closed: missing fields, invalid format, or schema mismatch results in FAIL.
 */
export function validateProvenanceMetadata(
  root: string,
  provenance: Record<string, unknown>,
): ProvenanceValidationResult {
  const timestamp = new Date().toISOString();
  const base = {
    gate: "provenance-metadata" as const,
    timestamp,
  };

  // 1. Check all required fields are present
  for (const field of REQUIRED_PROVENANCE_FIELDS) {
    if (!(field in provenance) || typeof provenance[field] !== "string") {
      return {
        ...base,
        result: "FAIL",
        reason: `missing or invalid provenance field: ${field}`,
        evidence: "provenance input",
        provenance: null,
      };
    }
    if (provenance[field].length === 0) {
      return {
        ...base,
        result: "FAIL",
        reason: `provenance field "${field}" is empty`,
        evidence: "provenance input",
        provenance: null,
      };
    }
  }

  // 2. Validate against JSON Schema
  let schema: JsonObject;
  try {
    schema = readJson(PROVENANCE_SCHEMA_PATH, root);
  } catch (error) {
    return {
      ...base,
      result: "FAIL",
      reason: `failed to read provenance schema: ${error instanceof Error ? error.message : String(error)}`,
      evidence: PROVENANCE_SCHEMA_PATH,
      provenance: null,
    };
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const valid = validate(provenance);

  if (!valid) {
    const errors = validate.errors
      ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    return {
      ...base,
      result: "FAIL",
      reason: `provenance schema validation failed: ${errors ?? "unknown error"}`,
      evidence: PROVENANCE_SCHEMA_PATH,
      provenance: null,
    };
  }

  // 3. Validate policy_version matches command-policy.json
  try {
    const commandPolicy = readJson(COMMAND_POLICY_PATH, root);
    const policyVersion = commandPolicy.policyVersion;
    if (typeof policyVersion === "string" && policyVersion !== provenance.policy_version) {
      return {
        ...base,
        result: "FAIL",
        reason: `provenance policy_version "${String(provenance.policy_version)}" does not match command-policy policyVersion "${policyVersion}"`,
        evidence: `${COMMAND_POLICY_PATH}, provenance input`,
        provenance: null,
      };
    }
  } catch (error) {
    return {
      ...base,
      result: "FAIL",
      reason: `failed to read command-policy.json for policy version cross-check: ${error instanceof Error ? error.message : String(error)}`,
      evidence: COMMAND_POLICY_PATH,
      provenance: null,
    };
  }

  const validProvenance: ProvenanceMetadata = {
    source_command: provenance.source_command as string,
    commit_sha: provenance.commit_sha as string,
    run_id: provenance.run_id as string,
    policy_version: provenance.policy_version as string,
  };

  return {
    ...base,
    result: "PASS",
    reason: `provenance metadata valid: command="${validProvenance.source_command}", sha="${validProvenance.commit_sha.slice(0, 7)}", run="${validProvenance.run_id}", policy="${validProvenance.policy_version}"`,
    evidence: `${PROVENANCE_SCHEMA_PATH}, ${COMMAND_POLICY_PATH}`,
    provenance: validProvenance,
  };
}

function formatValidationSummary(result: ProvenanceValidationResult): string {
  const icon = result.result === "PASS" ? "✅" : "❌";
  const lines: string[] = [
    "## Provenance Metadata Validation",
    "",
    `${icon} **Result:** ${result.result}`,
    `- Gate: \`${result.gate}\``,
    `- Reason: ${result.reason}`,
    `- Evidence: ${result.evidence}`,
    `- Timestamp: ${result.timestamp}`,
  ];

  if (result.provenance) {
    lines.push("");
    lines.push("### Provenance Fields");
    lines.push(`- Source Command: \`${result.provenance.source_command}\``);
    lines.push(`- Commit SHA: \`${result.provenance.commit_sha}\``);
    lines.push(`- Run ID: \`${result.provenance.run_id}\``);
    lines.push(`- Policy Version: \`${result.provenance.policy_version}\``);
  }

  return lines.join("\n");
}

function main(): void {
  const sourceCommand = process.env.GITHUB_MODE_COMMAND;
  if (!sourceCommand) {
    console.error("❌ GITHUB_MODE_COMMAND environment variable is required");
    process.exit(1);
  }

  const commitSha = process.env.GITHUB_SHA;
  if (!commitSha) {
    console.error("❌ GITHUB_SHA environment variable is required");
    process.exit(1);
  }

  const runId = process.env.GITHUB_RUN_ID;
  if (!runId) {
    console.error("❌ GITHUB_RUN_ID environment variable is required");
    process.exit(1);
  }

  const root = process.cwd();

  // Read policy version from command-policy.json
  let policyVersion = "unknown";
  try {
    const commandPolicy = readJson(COMMAND_POLICY_PATH, root);
    if (typeof commandPolicy.policyVersion === "string") {
      policyVersion = commandPolicy.policyVersion;
    }
  } catch {
    console.error("❌ Failed to read command-policy.json for policy version");
    process.exit(1);
  }

  const provenance: Record<string, unknown> = {
    source_command: sourceCommand,
    commit_sha: commitSha,
    run_id: runId,
    policy_version: policyVersion,
  };

  const result = validateProvenanceMetadata(root, provenance);
  const summary = formatValidationSummary(result);

  // Parse optional CLI args for output files
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json-out" && argv[index + 1]) {
      writeFileSync(argv[index + 1], `${JSON.stringify(result, null, 2)}\n`, "utf8");
      index += 1;
      continue;
    }
    if (arg === "--summary-out" && argv[index + 1]) {
      writeFileSync(argv[index + 1], `${summary}\n`, "utf8");
      index += 1;
    }
  }

  console.log(summary);
  console.log("\n--- PROVENANCE_VALIDATION_JSON ---");
  console.log(JSON.stringify(result, null, 2));

  if (result.result === "FAIL") {
    process.exit(1);
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("validate-provenance-metadata.ts")
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
