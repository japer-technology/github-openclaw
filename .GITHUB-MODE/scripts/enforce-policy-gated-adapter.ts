import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type JsonObject = Record<string, unknown>;

const COMMAND_POLICY_PATH = ".GITHUB-MODE/runtime/command-policy.json";
const ADAPTER_CONTRACTS_PATH = ".GITHUB-MODE/runtime/adapter-contracts.json";

export type AdapterContract = {
  name: string;
  capability: string;
  trustLevels: string[];
  constraints: string[];
};

export type PolicyDecision = {
  gate: "policy-gated-adapter";
  result: "PASS" | "FAIL";
  adapter: string;
  action: string;
  reason: string;
  evidence: string;
  policyVersion: string;
  enforcementMode: string;
  timestamp: string;
};

function readJson(filePath: string, root: string): JsonObject {
  const fullPath = path.join(root, filePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as JsonObject;
}

/**
 * Enforce policy-gated adapter invocation.
 *
 * Validates that:
 * 1. Command policy enforcement mode is "enforce".
 * 2. The adapter exists in adapter-contracts.json.
 * 3. The requested action is in the policy's allowedActions.
 * 4. The adapter's constraints are non-empty and structurally valid.
 *
 * Fail-closed: any missing data, invalid state, or policy violation results in FAIL.
 */
export function enforcePolicyGatedAdapter(
  root: string,
  adapterName: string,
  action: string,
): PolicyDecision {
  const timestamp = new Date().toISOString();
  const base = {
    gate: "policy-gated-adapter" as const,
    adapter: adapterName,
    action,
    timestamp,
  };

  // Load command policy
  let commandPolicy: JsonObject;
  try {
    commandPolicy = readJson(COMMAND_POLICY_PATH, root);
  } catch (error) {
    return {
      ...base,
      result: "FAIL",
      reason: `failed to read command-policy.json: ${error instanceof Error ? error.message : String(error)}`,
      evidence: COMMAND_POLICY_PATH,
      policyVersion: "unknown",
      enforcementMode: "unknown",
    };
  }

  const policyVersion =
    typeof commandPolicy.policyVersion === "string" ? commandPolicy.policyVersion : "unknown";
  const enforcementMode =
    typeof commandPolicy.enforcementMode === "string" ? commandPolicy.enforcementMode : "unknown";

  // 1. Validate enforcement mode
  if (commandPolicy.enforcementMode !== "enforce") {
    return {
      ...base,
      result: "FAIL",
      reason: `command-policy enforcementMode is "${enforcementMode}", expected "enforce" — fail-closed denial`,
      evidence: COMMAND_POLICY_PATH,
      policyVersion,
      enforcementMode,
    };
  }

  // 2. Validate adapter exists in adapter-contracts.json
  let adapterContracts: JsonObject;
  try {
    adapterContracts = readJson(ADAPTER_CONTRACTS_PATH, root);
  } catch (error) {
    return {
      ...base,
      result: "FAIL",
      reason: `failed to read adapter-contracts.json: ${error instanceof Error ? error.message : String(error)}`,
      evidence: ADAPTER_CONTRACTS_PATH,
      policyVersion,
      enforcementMode,
    };
  }

  const adapters = adapterContracts.adapters;
  if (!Array.isArray(adapters)) {
    return {
      ...base,
      result: "FAIL",
      reason: "adapter-contracts.json adapters is not an array — fail-closed denial",
      evidence: ADAPTER_CONTRACTS_PATH,
      policyVersion,
      enforcementMode,
    };
  }

  const adapter = adapters.find(
    (a: unknown) =>
      a !== null && typeof a === "object" && (a as Record<string, unknown>).name === adapterName,
  ) as AdapterContract | undefined;

  if (!adapter) {
    return {
      ...base,
      result: "FAIL",
      reason: `adapter "${adapterName}" not found in adapter-contracts.json — fail-closed denial`,
      evidence: ADAPTER_CONTRACTS_PATH,
      policyVersion,
      enforcementMode,
    };
  }

  // 3. Validate adapter has non-empty constraints
  if (!Array.isArray(adapter.constraints) || adapter.constraints.length === 0) {
    return {
      ...base,
      result: "FAIL",
      reason: `adapter "${adapterName}" has no constraints defined — fail-closed denial`,
      evidence: ADAPTER_CONTRACTS_PATH,
      policyVersion,
      enforcementMode,
    };
  }

  // 4. Validate the requested action is in allowedActions
  const allowedActions = commandPolicy.allowedActions;
  if (!Array.isArray(allowedActions)) {
    return {
      ...base,
      result: "FAIL",
      reason: "command-policy allowedActions is not an array — fail-closed denial",
      evidence: COMMAND_POLICY_PATH,
      policyVersion,
      enforcementMode,
    };
  }

  if (!allowedActions.includes(action)) {
    return {
      ...base,
      result: "FAIL",
      reason: `action "${action}" is not in allowedActions (allowed: ${allowedActions.join(", ")}) — policy denial`,
      evidence: COMMAND_POLICY_PATH,
      policyVersion,
      enforcementMode,
    };
  }

  // All checks pass
  return {
    ...base,
    result: "PASS",
    reason: `adapter "${adapterName}" with action "${action}" passed policy gate (enforcement: ${enforcementMode}, policy: ${policyVersion})`,
    evidence: `${COMMAND_POLICY_PATH}, ${ADAPTER_CONTRACTS_PATH}`,
    policyVersion,
    enforcementMode,
  };
}

function formatDecisionSummary(decision: PolicyDecision): string {
  const icon = decision.result === "PASS" ? "✅" : "❌";
  const lines: string[] = [
    "## Policy-Gated Adapter Decision",
    "",
    `${icon} **Result:** ${decision.result}`,
    `- Gate: \`${decision.gate}\``,
    `- Adapter: \`${decision.adapter}\``,
    `- Action: \`${decision.action}\``,
    `- Reason: ${decision.reason}`,
    `- Policy Version: \`${decision.policyVersion}\``,
    `- Enforcement Mode: \`${decision.enforcementMode}\``,
    `- Evidence: ${decision.evidence}`,
    `- Timestamp: ${decision.timestamp}`,
  ];
  return lines.join("\n");
}

function main(): void {
  const adapterName = process.env.GITHUB_MODE_ADAPTER;
  if (!adapterName) {
    console.error("❌ GITHUB_MODE_ADAPTER environment variable is required");
    process.exit(1);
  }

  const action = process.env.GITHUB_MODE_ACTION;
  if (!action) {
    console.error("❌ GITHUB_MODE_ACTION environment variable is required");
    process.exit(1);
  }

  const root = process.cwd();
  const decision = enforcePolicyGatedAdapter(root, adapterName, action);
  const summary = formatDecisionSummary(decision);

  // Parse optional CLI args for output files
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json-out" && argv[index + 1]) {
      writeFileSync(argv[index + 1], `${JSON.stringify(decision, null, 2)}\n`, "utf8");
      index += 1;
      continue;
    }
    if (arg === "--summary-out" && argv[index + 1]) {
      writeFileSync(argv[index + 1], `${summary}\n`, "utf8");
      index += 1;
    }
  }

  console.log(summary);
  console.log("\n--- POLICY_DECISION_JSON ---");
  console.log(JSON.stringify(decision, null, 2));

  if (decision.result === "FAIL") {
    process.exit(1);
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("enforce-policy-gated-adapter.ts")
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
