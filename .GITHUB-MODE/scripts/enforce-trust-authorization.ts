import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type JsonObject = Record<string, unknown>;

const TRUST_LEVELS_PATH = ".GITHUB-MODE/runtime/trust-levels.json";
const ADAPTER_CONTRACTS_PATH = ".GITHUB-MODE/runtime/adapter-contracts.json";
const COMMAND_POLICY_PATH = ".GITHUB-MODE/runtime/command-policy.json";

export type TrustLevel = {
  id: string;
  allowsSecrets: boolean;
  allowsPrivilegedMutation: boolean;
};

export type AdapterContract = {
  name: string;
  capability: string;
  trustLevels: string[];
  constraints: string[];
};

export type AuthorizationDecision = {
  allowed: boolean;
  actor: string;
  trustLevel: string;
  adapter: string;
  reason: string;
  evidence: string;
  timestamp: string;
};

function readJson(filePath: string, root: string): JsonObject {
  const fullPath = path.join(root, filePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as JsonObject;
}

/**
 * Resolve the trust level definition for a given trust level id.
 * Returns undefined if the level does not exist.
 */
export function resolveTrustLevel(root: string, levelId: string): TrustLevel | undefined {
  const trustLevels = readJson(TRUST_LEVELS_PATH, root);
  const levels = trustLevels.levels;
  if (!Array.isArray(levels)) {
    return undefined;
  }
  return levels.find(
    (level: unknown) =>
      level !== null &&
      typeof level === "object" &&
      (level as Record<string, unknown>).id === levelId,
  ) as TrustLevel | undefined;
}

/**
 * Resolve the adapter contract for a given adapter name.
 * Returns undefined if the adapter does not exist.
 */
export function resolveAdapterContract(
  root: string,
  adapterName: string,
): AdapterContract | undefined {
  const contracts = readJson(ADAPTER_CONTRACTS_PATH, root);
  const adapters = contracts.adapters;
  if (!Array.isArray(adapters)) {
    return undefined;
  }
  return adapters.find(
    (adapter: unknown) =>
      adapter !== null &&
      typeof adapter === "object" &&
      (adapter as Record<string, unknown>).name === adapterName,
  ) as AdapterContract | undefined;
}

/**
 * Validate that command-policy.json is in enforcement mode with active constraints.
 * Returns an error reason string if validation fails, or undefined if valid.
 */
export function validateCommandPolicyEnforcement(root: string): string | undefined {
  let commandPolicy: JsonObject;
  try {
    commandPolicy = readJson(COMMAND_POLICY_PATH, root);
  } catch {
    return `command-policy.json could not be read — fail-closed denial`;
  }

  if (commandPolicy.enforcementMode !== "enforce") {
    return `command-policy enforcementMode is "${String(commandPolicy.enforcementMode)}", expected "enforce" — fail-closed denial`;
  }

  const constraints = commandPolicy.constraints;
  if (!Array.isArray(constraints) || constraints.length === 0) {
    return "command-policy.json constraints are missing or empty — fail-closed denial";
  }

  return undefined;
}

/**
 * Enforce trust-level-based authorization for an actor requesting an adapter.
 *
 * Fail-closed: any indeterminate state (missing trust level, missing adapter,
 * invalid data, inactive command policy) results in denial.
 */
export function enforceTrustAuthorization(
  root: string,
  actor: string,
  trustLevelId: string,
  adapterName: string,
): AuthorizationDecision {
  const timestamp = new Date().toISOString();
  const base = { actor, trustLevel: trustLevelId, adapter: adapterName, timestamp };

  // Validate command policy is in active enforcement
  const policyError = validateCommandPolicyEnforcement(root);
  if (policyError) {
    return {
      ...base,
      allowed: false,
      reason: policyError,
      evidence: COMMAND_POLICY_PATH,
    };
  }

  // Resolve trust level definition
  const trustLevel = resolveTrustLevel(root, trustLevelId);
  if (!trustLevel) {
    return {
      ...base,
      allowed: false,
      reason: `trust level "${trustLevelId}" not found in trust-levels.json — fail-closed denial`,
      evidence: TRUST_LEVELS_PATH,
    };
  }

  // Resolve adapter contract
  const adapterContract = resolveAdapterContract(root, adapterName);
  if (!adapterContract) {
    return {
      ...base,
      allowed: false,
      reason: `adapter "${adapterName}" not found in adapter-contracts.json — fail-closed denial`,
      evidence: ADAPTER_CONTRACTS_PATH,
    };
  }

  // Check if the actor's trust level is in the adapter's allowed trust levels
  if (!adapterContract.trustLevels.includes(trustLevelId)) {
    return {
      ...base,
      allowed: false,
      reason: `actor "${actor}" with trust level "${trustLevelId}" is not authorized for adapter "${adapterName}" (requires: ${adapterContract.trustLevels.join(", ")})`,
      evidence: `${TRUST_LEVELS_PATH}, ${ADAPTER_CONTRACTS_PATH}`,
    };
  }

  // If adapter requires privileged mutation, verify trust level permits it
  const requiresPrivilege = adapterContract.trustLevels.every((tl) => {
    const resolved = resolveTrustLevel(root, tl);
    return resolved?.allowsPrivilegedMutation === true;
  });

  if (requiresPrivilege && !trustLevel.allowsPrivilegedMutation) {
    return {
      ...base,
      allowed: false,
      reason: `adapter "${adapterName}" requires privileged mutation but trust level "${trustLevelId}" does not permit it — no privileged execution from untrusted contexts`,
      evidence: `${TRUST_LEVELS_PATH}, ${ADAPTER_CONTRACTS_PATH}`,
    };
  }

  // If all of the adapter's allowed trust levels require secrets, verify the actor's
  // trust level also permits secrets (fail-closed for secret-backed adapters).
  const adapterRequiresSecrets = adapterContract.trustLevels.every((tl) => {
    const resolved = resolveTrustLevel(root, tl);
    return resolved?.allowsSecrets === true;
  });

  if (adapterRequiresSecrets && !trustLevel.allowsSecrets) {
    return {
      ...base,
      allowed: false,
      reason: `adapter "${adapterName}" requires secret access but trust level "${trustLevelId}" does not allow secrets — no privileged execution from untrusted contexts`,
      evidence: `${TRUST_LEVELS_PATH}, ${ADAPTER_CONTRACTS_PATH}`,
    };
  }

  return {
    ...base,
    allowed: true,
    reason: `actor "${actor}" with trust level "${trustLevelId}" is authorized for adapter "${adapterName}"`,
    evidence: `${TRUST_LEVELS_PATH}, ${ADAPTER_CONTRACTS_PATH}`,
  };
}

function formatDecisionSummary(decision: AuthorizationDecision): string {
  const icon = decision.allowed ? "✅" : "❌";
  const lines: string[] = [
    "## Trust Authorization Decision",
    "",
    `${icon} **Result:** ${decision.allowed ? "ALLOWED" : "DENIED"}`,
    `- Actor: \`${decision.actor}\``,
    `- Trust Level: \`${decision.trustLevel}\``,
    `- Adapter: \`${decision.adapter}\``,
    `- Reason: ${decision.reason}`,
    `- Evidence: ${decision.evidence}`,
    `- Timestamp: ${decision.timestamp}`,
  ];
  return lines.join("\n");
}

function main(): void {
  const actor = process.env.GITHUB_ACTOR;
  if (!actor) {
    console.error("❌ GITHUB_ACTOR environment variable is required");
    process.exit(1);
  }

  const trustLevelId = process.env.GITHUB_MODE_TRUST_LEVEL;
  if (!trustLevelId) {
    console.error("❌ GITHUB_MODE_TRUST_LEVEL environment variable is required");
    process.exit(1);
  }

  const adapterName = process.env.GITHUB_MODE_ADAPTER;
  if (!adapterName) {
    console.error("❌ GITHUB_MODE_ADAPTER environment variable is required");
    process.exit(1);
  }

  const root = process.cwd();
  const decision = enforceTrustAuthorization(root, actor, trustLevelId, adapterName);
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
  console.log("\n--- AUTHORIZATION_DECISION_JSON ---");
  console.log(JSON.stringify(decision, null, 2));

  if (!decision.allowed) {
    process.exit(1);
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("enforce-trust-authorization.ts")
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
