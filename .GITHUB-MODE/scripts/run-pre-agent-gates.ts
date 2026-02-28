import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type JsonObject = Record<string, unknown>;

const COMMAND_POLICY_PATH = ".GITHUB-MODE/runtime/command-policy.json";
const TRUST_LEVELS_PATH = ".GITHUB-MODE/runtime/trust-levels.json";
const TRUSTED_SKILLS_ALLOWLIST_PATH = ".GITHUB-MODE/runtime/trusted-skills-allowlist.json";
const TRUSTED_COMMAND_GATE_PATH = ".GITHUB-MODE/runtime/trusted-command-gate.json";

export type GateRecord = {
  gate: "skill-package-scan" | "lockfile-provenance" | "policy-eval";
  result: "PASS" | "FAIL";
  reason: string;
  evidence: string;
};

export type PreAgentGatesResult = {
  passed: boolean;
  gates: GateRecord[];
};

function readJson(filePath: string, root: string): JsonObject {
  const fullPath = path.join(root, filePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as JsonObject;
}

/**
 * Gate 1: Skill/package scan — verifies the trusted-command-gate is fail-closed
 * and the skills allowlist is structurally valid.
 */
function runSkillPackageScan(root: string): GateRecord {
  const gate = "skill-package-scan" as const;

  try {
    const gateContract = readJson(TRUSTED_COMMAND_GATE_PATH, root);
    if (gateContract.enforcementMode !== "fail_closed") {
      return {
        gate,
        result: "FAIL",
        reason: "trusted-command-gate enforcementMode is not fail_closed",
        evidence: TRUSTED_COMMAND_GATE_PATH,
      };
    }

    const allowlist = readJson(TRUSTED_SKILLS_ALLOWLIST_PATH, root);
    if (!allowlist.byDigest || typeof allowlist.byDigest !== "object") {
      return {
        gate,
        result: "FAIL",
        reason: "trusted-skills-allowlist missing or invalid byDigest",
        evidence: TRUSTED_SKILLS_ALLOWLIST_PATH,
      };
    }

    if (!Array.isArray(allowlist.revokedDigests)) {
      return {
        gate,
        result: "FAIL",
        reason: "trusted-skills-allowlist revokedDigests is not an array",
        evidence: TRUSTED_SKILLS_ALLOWLIST_PATH,
      };
    }

    return {
      gate,
      result: "PASS",
      reason: "skill-package-scan passed: gate is fail_closed and allowlist is valid",
      evidence: `${TRUSTED_COMMAND_GATE_PATH}, ${TRUSTED_SKILLS_ALLOWLIST_PATH}`,
    };
  } catch (error) {
    return {
      gate,
      result: "FAIL",
      reason: `skill-package-scan error: ${error instanceof Error ? error.message : String(error)}`,
      evidence: TRUSTED_COMMAND_GATE_PATH,
    };
  }
}

/**
 * Gate 2: Lockfile/provenance checks — verifies allowlist entries have
 * required provenance metadata (source, approvalRecord, evidence).
 */
function runLockfileProvenance(root: string): GateRecord {
  const gate = "lockfile-provenance" as const;

  try {
    const allowlist = readJson(TRUSTED_SKILLS_ALLOWLIST_PATH, root);
    const byDigest = allowlist.byDigest;

    if (!byDigest || typeof byDigest !== "object" || Array.isArray(byDigest)) {
      return {
        gate,
        result: "FAIL",
        reason: "trusted-skills-allowlist byDigest is invalid",
        evidence: TRUSTED_SKILLS_ALLOWLIST_PATH,
      };
    }

    const entries = Object.entries(byDigest as Record<string, unknown>);
    for (const [digest, entry] of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return {
          gate,
          result: "FAIL",
          reason: `allowlist entry ${digest} is not a valid object`,
          evidence: TRUSTED_SKILLS_ALLOWLIST_PATH,
        };
      }

      const record = entry as Record<string, unknown>;
      for (const requiredField of ["source", "approvalRecord", "evidence"]) {
        if (!(requiredField in record)) {
          return {
            gate,
            result: "FAIL",
            reason: `allowlist entry ${digest} missing provenance field: ${requiredField}`,
            evidence: TRUSTED_SKILLS_ALLOWLIST_PATH,
          };
        }
      }
    }

    return {
      gate,
      result: "PASS",
      reason: "lockfile-provenance passed: all allowlist entries have required provenance",
      evidence: TRUSTED_SKILLS_ALLOWLIST_PATH,
    };
  } catch (error) {
    return {
      gate,
      result: "FAIL",
      reason: `lockfile-provenance error: ${error instanceof Error ? error.message : String(error)}`,
      evidence: TRUSTED_SKILLS_ALLOWLIST_PATH,
    };
  }
}

/**
 * Gate 3: Policy evaluation — verifies command-policy enforcement mode and
 * that the requested command is in the allowed set. Validates trust level
 * exists for the given actor context.
 */
function runPolicyEval(root: string, command: string): GateRecord {
  const gate = "policy-eval" as const;

  try {
    const commandPolicy = readJson(COMMAND_POLICY_PATH, root);

    if (commandPolicy.enforcementMode !== "enforce") {
      return {
        gate,
        result: "FAIL",
        reason: `command-policy enforcementMode is "${String(commandPolicy.enforcementMode)}", expected "enforce"`,
        evidence: COMMAND_POLICY_PATH,
      };
    }

    const allowedCommands = commandPolicy.allowedCommands;
    if (!Array.isArray(allowedCommands)) {
      return {
        gate,
        result: "FAIL",
        reason: "command-policy allowedCommands is not an array",
        evidence: COMMAND_POLICY_PATH,
      };
    }

    if (!allowedCommands.includes(command)) {
      return {
        gate,
        result: "FAIL",
        reason: `command "${command}" is not in allowedCommands`,
        evidence: COMMAND_POLICY_PATH,
      };
    }

    const trustLevels = readJson(TRUST_LEVELS_PATH, root);
    const levels = trustLevels.levels;
    if (!Array.isArray(levels) || levels.length === 0) {
      return {
        gate,
        result: "FAIL",
        reason: "trust-levels has no defined levels",
        evidence: TRUST_LEVELS_PATH,
      };
    }

    return {
      gate,
      result: "PASS",
      reason: `policy-eval passed: command "${command}" is allowed and trust levels are valid`,
      evidence: `${COMMAND_POLICY_PATH}, ${TRUST_LEVELS_PATH}`,
    };
  } catch (error) {
    return {
      gate,
      result: "FAIL",
      reason: `policy-eval error: ${error instanceof Error ? error.message : String(error)}`,
      evidence: COMMAND_POLICY_PATH,
    };
  }
}

/**
 * Run all three pre-agent gates in deterministic order (fail-closed).
 * Returns immediately on first failure.
 */
export function runPreAgentGates(root: string, command: string): PreAgentGatesResult {
  const gates: GateRecord[] = [];

  // Gate 1: skill/package scan
  const skillScan = runSkillPackageScan(root);
  gates.push(skillScan);
  if (skillScan.result === "FAIL") {
    return { passed: false, gates };
  }

  // Gate 2: lockfile/provenance checks
  const lockfileProvenance = runLockfileProvenance(root);
  gates.push(lockfileProvenance);
  if (lockfileProvenance.result === "FAIL") {
    return { passed: false, gates };
  }

  // Gate 3: policy evaluation
  const policyEval = runPolicyEval(root, command);
  gates.push(policyEval);
  if (policyEval.result === "FAIL") {
    return { passed: false, gates };
  }

  return { passed: true, gates };
}

function formatGatesSummary(result: PreAgentGatesResult): string {
  const lines: string[] = ["## Pre-Agent Gates Summary", ""];
  for (const gate of result.gates) {
    const icon = gate.result === "PASS" ? "✅" : "❌";
    lines.push(`${icon} **${gate.gate}**: ${gate.result}`);
    lines.push(`   Reason: ${gate.reason}`);
    lines.push(`   Evidence: ${gate.evidence}`);
    lines.push("");
  }
  lines.push(result.passed ? "All gates passed." : "Gate check failed. Agent execution blocked.");
  return lines.join("\n");
}

function parseCliArgs(argv: string[]): {
  jsonOut?: string;
  summaryOut?: string;
} {
  const parsed: { jsonOut?: string; summaryOut?: string } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json-out") {
      parsed.jsonOut = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--summary-out") {
      parsed.summaryOut = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

function main(): void {
  const command = process.env.GITHUB_MODE_COMMAND;
  if (!command) {
    console.error("❌ GITHUB_MODE_COMMAND environment variable is required");
    process.exit(1);
  }

  const root = process.cwd();
  const result = runPreAgentGates(root, command);
  const summary = formatGatesSummary(result);
  const { jsonOut, summaryOut } = parseCliArgs(process.argv.slice(2));

  if (jsonOut) {
    writeFileSync(jsonOut, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  if (summaryOut) {
    writeFileSync(summaryOut, `${summary}\n`, "utf8");
  }

  console.log(summary);

  // Emit gate records as JSON for artifact collection
  console.log("\n--- GATE_RECORDS_JSON ---");
  console.log(JSON.stringify(result, null, 2));

  if (!result.passed) {
    process.exit(1);
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("run-pre-agent-gates.ts")
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
