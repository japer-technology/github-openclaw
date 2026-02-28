import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv from "ajv";

type JsonObject = Record<string, unknown>;

type ContractCheck = {
  file: string;
  requiredKeys: string[];
};

const ROOT = process.cwd();
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

const requiredContracts: ContractCheck[] = [
  {
    file: ".GITHUB-MODE/runtime/runtime-manifest.json",
    requiredKeys: ["schemaVersion", "manifestVersion", "components"],
  },
  {
    file: ".GITHUB-MODE/runtime/adapter-contracts.json",
    requiredKeys: ["schemaVersion", "contractsVersion", "adapters"],
  },
  {
    file: ".GITHUB-MODE/runtime/command-policy.json",
    requiredKeys: [
      "schemaVersion",
      "policyVersion",
      "allowedActions",
      "constraints",
      "enforcementMode",
    ],
  },
  {
    file: ".GITHUB-MODE/runtime/trust-levels.json",
    requiredKeys: ["schemaVersion", "trustVersion", "levels"],
  },
  {
    file: ".GITHUB-MODE/runtime/parity-matrix.json",
    requiredKeys: ["schemaVersion", "matrixVersion", "mappings"],
  },
  {
    file: ".GITHUB-MODE/runtime/workspace-convergence-map.json",
    requiredKeys: [
      "schemaVersion",
      "convergenceVersion",
      "acceptanceCriteria",
      "requiredHighValueWorkflows",
      "reconciliationSignals",
    ],
  },
  {
    file: ".GITHUB-MODE/runtime/entity-manifest.json",
    requiredKeys: ["schemaVersion", "entityId", "owner", "trustTier"],
  },
  {
    file: ".GITHUB-MODE/runtime/collaboration-policy.json",
    requiredKeys: ["schemaVersion", "policyVersion", "defaultAction", "allowedRoutes"],
  },
  {
    file: ".GITHUB-MODE/runtime/skills-quarantine-registry.json",
    requiredKeys: ["schemaVersion", "registryVersion", "classifierOutcomes", "submissions"],
  },
  {
    file: ".GITHUB-MODE/runtime/trusted-skills-allowlist.json",
    requiredKeys: ["schemaVersion", "allowlistVersion", "keyType", "byDigest", "revokedDigests"],
  },
  {
    file: ".GITHUB-MODE/runtime/trusted-command-gate.json",
    requiredKeys: [
      "schemaVersion",
      "gateVersion",
      "enforcementMode",
      "allowRuntimeFetch",
      "trustedWorkflows",
      "requiredMetadata",
    ],
  },
  {
    file: ".GITHUB-MODE/runtime/skills-emergency-revocations.json",
    requiredKeys: ["schemaVersion", "revocationVersion", "events"],
  },
  {
    file: ".GITHUB-MODE/runtime/eval-thresholds.json",
    requiredKeys: ["schemaVersion", "thresholdsVersion", "enforcementMode", "tiers", "subsystems"],
  },
  {
    file: ".GITHUB-MODE/runtime/cost-thresholds.json",
    requiredKeys: ["schemaVersion", "thresholdsVersion", "enforcementMode", "gates"],
  },
  {
    file: ".GITHUB-MODE/runtime/template-baseline.json",
    requiredKeys: ["schemaVersion", "baselineVersion", "requiredFiles"],
  },
];

function readJson(filePath: string): JsonObject {
  const absolutePath = path.join(ROOT, filePath);
  const raw = readFileSync(absolutePath, "utf8");
  return JSON.parse(raw) as JsonObject;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function assertRequiredKeys(filePath: string, data: JsonObject, keys: string[]): void {
  for (const key of keys) {
    if (!(key in data)) {
      throw new Error(`${filePath}: missing required key \`${key}\``);
    }
  }
}

function validateManifestSchema(): void {
  const schemaPath = ".GITHUB-MODE/runtime/manifest.schema.json";
  const manifestPath = ".GITHUB-MODE/runtime/runtime-manifest.json";
  const schema = readJson(schemaPath);
  const manifest = readJson(manifestPath);

  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = validate(manifest);
  if (!valid) {
    const errors = validate.errors
      ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new Error(`${manifestPath}: schema validation failed (${errors ?? "unknown error"})`);
  }
}

function validateEntityManifestSchema(): void {
  const schemaPath = ".GITHUB-MODE/runtime/entity-manifest.schema.json";
  const instancePath = ".GITHUB-MODE/runtime/entity-manifest.json";
  const schema = readJson(schemaPath);
  const instance = readJson(instancePath);

  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = validate(instance);
  if (!valid) {
    const errors = validate.errors
      ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new Error(`${instancePath}: schema validation failed (${errors ?? "unknown error"})`);
  }
}

function validateCollaborationPolicySchema(): void {
  const schemaPath = ".GITHUB-MODE/runtime/collaboration-policy.schema.json";
  const instancePath = ".GITHUB-MODE/runtime/collaboration-policy.json";
  const schema = readJson(schemaPath);
  const instance = readJson(instancePath);

  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = validate(instance);
  if (!valid) {
    const errors = validate.errors
      ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new Error(`${instancePath}: schema validation failed (${errors ?? "unknown error"})`);
  }
}

function validateCollaborationEnvelopeSchema(): void {
  const schemaPath = ".GITHUB-MODE/runtime/collaboration-envelope.schema.json";
  const schema = readJson(schemaPath);

  const ajv = new Ajv({ allErrors: true, strict: false, logger: false });
  const validate = ajv.compile(schema);
  if (!validate) {
    throw new Error(`${schemaPath}: schema compilation failed`);
  }
}

const VALID_PARITY_VALUES = ["native", "adapter", "emulated", "installed-only"] as const;

function validateParityMatrix(): void {
  const parityPath = ".GITHUB-MODE/runtime/parity-matrix.json";
  const parity = readJson(parityPath);
  const mappings = parity.mappings;

  if (!Array.isArray(mappings) || mappings.length === 0) {
    throw new Error(`${parityPath}: mappings must be a non-empty array`);
  }

  for (const [index, mapping] of mappings.entries()) {
    if (!mapping || typeof mapping !== "object") {
      throw new Error(`${parityPath}: mappings[${index}] must be an object`);
    }

    const row = mapping as JsonObject;
    for (const required of ["workflow", "installedRuntime", "githubMode", "parity"]) {
      if (!(required in row)) {
        throw new Error(`${parityPath}: mappings[${index}] missing required key \`${required}\``);
      }
    }

    if (!VALID_PARITY_VALUES.includes(row.parity as (typeof VALID_PARITY_VALUES)[number])) {
      throw new Error(
        `${parityPath}: mappings[${index}] has invalid parity value \`${String(row.parity)}\` (must be one of: ${VALID_PARITY_VALUES.join(", ")})`,
      );
    }

    if (row.parity === "installed-only") {
      if (!("owner" in row) || !("rationale" in row)) {
        throw new Error(
          `${parityPath}: mappings[${index}] parity=installed-only requires both \`owner\` and \`rationale\``,
        );
      }
    }
  }
}

function validateConvergenceMap(): void {
  const convergencePath = ".GITHUB-MODE/runtime/workspace-convergence-map.json";
  const convergence = readJson(convergencePath);

  const acceptanceCriteria = convergence.acceptanceCriteria;
  if (!Array.isArray(acceptanceCriteria) || acceptanceCriteria.length === 0) {
    throw new Error(`${convergencePath}: acceptanceCriteria must be a non-empty array`);
  }

  const reconciliationSignals = convergence.reconciliationSignals;
  if (!Array.isArray(reconciliationSignals) || reconciliationSignals.length === 0) {
    throw new Error(`${convergencePath}: reconciliationSignals must be a non-empty array`);
  }

  const hasRequiredSignal = reconciliationSignals.some(
    (signal) =>
      typeof signal === "object" && signal !== null && (signal as JsonObject).required === true,
  );

  if (!hasRequiredSignal) {
    throw new Error(
      `${convergencePath}: must include at least one reconciliation signal with required=true`,
    );
  }
}

function validateRequiredHighValueWorkflowCoverage(): void {
  const convergencePath = ".GITHUB-MODE/runtime/workspace-convergence-map.json";
  const parityPath = ".GITHUB-MODE/runtime/parity-matrix.json";
  const convergence = readJson(convergencePath);
  const parity = readJson(parityPath);

  const requiredWorkflows = convergence.requiredHighValueWorkflows;
  if (!Array.isArray(requiredWorkflows) || requiredWorkflows.length === 0) {
    throw new Error(`${convergencePath}: requiredHighValueWorkflows must be a non-empty array`);
  }

  const invalidRequired = requiredWorkflows.filter((workflow) => typeof workflow !== "string");
  if (invalidRequired.length > 0) {
    throw new Error(
      `${convergencePath}: requiredHighValueWorkflows must contain only workflow ID strings`,
    );
  }

  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const workflow of requiredWorkflows as string[]) {
    if (seen.has(workflow)) {
      duplicates.add(workflow);
    }
    seen.add(workflow);
  }

  if (duplicates.size > 0) {
    throw new Error(
      `${convergencePath}: requiredHighValueWorkflows contains duplicates: ${Array.from(duplicates)
        .toSorted()
        .join(", ")}`,
    );
  }

  const mappings = parity.mappings;
  if (!Array.isArray(mappings)) {
    throw new Error(`${parityPath}: mappings must be an array`);
  }

  const parityWorkflowIds = new Set<string>();
  for (const [index, mapping] of mappings.entries()) {
    if (!mapping || typeof mapping !== "object") {
      throw new Error(`${parityPath}: mappings[${index}] must be an object`);
    }

    const workflow = (mapping as JsonObject).workflow;
    if (typeof workflow !== "string" || workflow.length === 0) {
      throw new Error(`${parityPath}: mappings[${index}].workflow must be a non-empty string`);
    }

    parityWorkflowIds.add(workflow);
  }

  const missing = (requiredWorkflows as string[]).filter(
    (workflow) => !parityWorkflowIds.has(workflow),
  );
  if (missing.length > 0) {
    throw new Error(
      `${parityPath}: missing required high-value workflow mappings for: ${missing.toSorted().join(", ")}`,
    );
  }
}

function validateCollaborationPolicyDenyDefault(): void {
  const policyPath = ".GITHUB-MODE/runtime/collaboration-policy.json";
  const policy = readJson(policyPath);

  if (policy.defaultAction !== "deny") {
    throw new Error(
      `${policyPath}: defaultAction must be "deny" (deny-by-default collaboration policy)`,
    );
  }
}

function validateSkillsQuarantineRegistry(): void {
  const registryPath = ".GITHUB-MODE/runtime/skills-quarantine-registry.json";
  const registry = readJson(registryPath);

  const outcomes = registry.classifierOutcomes;
  if (!Array.isArray(outcomes)) {
    throw new Error(`${registryPath}: classifierOutcomes must be an array`);
  }

  const expectedOutcomes = ["approved_limited", "approved_trusted", "rejected_policy"];
  for (const outcome of expectedOutcomes) {
    if (!outcomes.includes(outcome)) {
      throw new Error(`${registryPath}: classifierOutcomes missing ${outcome}`);
    }
  }

  const submissions = registry.submissions;
  if (!Array.isArray(submissions) || submissions.length === 0) {
    throw new Error(`${registryPath}: submissions must be a non-empty array`);
  }

  const hasPendingScan = submissions.some(
    (entry) =>
      typeof entry === "object" && entry !== null && (entry as JsonObject).state === "pending_scan",
  );

  if (!hasPendingScan) {
    throw new Error(`${registryPath}: expected at least one submission with state=pending_scan`);
  }
}

function validateTrustedAllowlist(): void {
  const allowlistPath = ".GITHUB-MODE/runtime/trusted-skills-allowlist.json";
  const allowlist = readJson(allowlistPath);

  if (allowlist.keyType !== "sha256") {
    throw new Error(`${allowlistPath}: keyType must be sha256`);
  }

  const byDigest = asRecord(allowlist.byDigest, `${allowlistPath}: byDigest must be an object`);
  const revokedDigests = allowlist.revokedDigests;

  if (!Array.isArray(revokedDigests)) {
    throw new Error(`${allowlistPath}: revokedDigests must be an array`);
  }

  for (const digest of [...Object.keys(byDigest), ...revokedDigests]) {
    if (typeof digest !== "string" || !DIGEST_PATTERN.test(digest)) {
      throw new Error(`${allowlistPath}: invalid digest key \`${String(digest)}\``);
    }
  }

  for (const [digest, metadata] of Object.entries(byDigest)) {
    const record = asRecord(metadata, `${allowlistPath}: metadata for ${digest} must be an object`);

    if (record.status !== "approved_trusted") {
      throw new Error(`${allowlistPath}: ${digest} status must be approved_trusted`);
    }

    const approval = asRecord(
      record.approvalRecord,
      `${allowlistPath}: ${digest} approvalRecord must be an object`,
    );

    const submittedBy = approval.submittedBy;
    const securityApprover = approval.securityApprover;
    const runtimeApprover = approval.runtimeApprover;

    if (
      typeof submittedBy !== "string" ||
      typeof securityApprover !== "string" ||
      typeof runtimeApprover !== "string"
    ) {
      throw new Error(
        `${allowlistPath}: ${digest} approvalRecord requires submitter + two approvers`,
      );
    }

    if (securityApprover === runtimeApprover) {
      throw new Error(`${allowlistPath}: ${digest} approvers must be distinct`);
    }

    if (submittedBy === securityApprover || submittedBy === runtimeApprover) {
      throw new Error(`${allowlistPath}: ${digest} submitter cannot self-approve`);
    }
  }
}

function validateTrustedCommandGate(): void {
  const gatePath = ".GITHUB-MODE/runtime/trusted-command-gate.json";
  const gate = readJson(gatePath);

  if (gate.enforcementMode !== "fail_closed") {
    throw new Error(`${gatePath}: enforcementMode must be fail_closed`);
  }

  if (gate.allowRuntimeFetch !== false) {
    throw new Error(`${gatePath}: allowRuntimeFetch must be false in trusted mode`);
  }

  const workflows = gate.trustedWorkflows;
  if (!Array.isArray(workflows) || workflows.length === 0) {
    throw new Error(`${gatePath}: trustedWorkflows must be a non-empty array`);
  }
}

function validateEmergencyRevocations(): void {
  const revocationsPath = ".GITHUB-MODE/runtime/skills-emergency-revocations.json";
  const revocations = readJson(revocationsPath);
  const events = revocations.events;

  if (!Array.isArray(events) || events.length === 0) {
    throw new Error(`${revocationsPath}: events must be a non-empty array`);
  }

  for (const [index, event] of events.entries()) {
    const record = asRecord(event, `${revocationsPath}: events[${index}] must be an object`);

    if (record.status !== "revoked") {
      throw new Error(`${revocationsPath}: events[${index}] status must be revoked`);
    }

    const digest = record.skillDigest;
    if (typeof digest !== "string" || !DIGEST_PATTERN.test(digest)) {
      throw new Error(`${revocationsPath}: events[${index}] has invalid skillDigest`);
    }

    const actions = asRecord(
      record.actions,
      `${revocationsPath}: events[${index}] actions must be an object`,
    );

    if (actions.invalidatedAllowlist !== true || actions.invalidatedCaches !== true) {
      throw new Error(`${revocationsPath}: events[${index}] must invalidate allowlist and caches`);
    }

    if (
      typeof actions.emittedIncidentIssue !== "string" ||
      actions.emittedIncidentIssue.length === 0
    ) {
      throw new Error(`${revocationsPath}: events[${index}] missing emitted incident issue`);
    }
  }
}

function validateAdapterContractsSchema(): void {
  const schemaPath = ".GITHUB-MODE/runtime/adapter-contracts.schema.json";
  const instancePath = ".GITHUB-MODE/runtime/adapter-contracts.json";
  const schema = readJson(schemaPath);
  const instance = readJson(instancePath);

  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = validate(instance);
  if (!valid) {
    const errors = validate.errors
      ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new Error(`${instancePath}: schema validation failed (${errors ?? "unknown error"})`);
  }
}

function validateProvenanceMetadataSchema(): void {
  const schemaPath = ".GITHUB-MODE/runtime/provenance-metadata.schema.json";
  const schema = readJson(schemaPath);

  const ajv = new Ajv({ allErrors: true, strict: false, logger: false });
  const validate = ajv.compile(schema);
  if (!validate) {
    throw new Error(`${schemaPath}: schema compilation failed`);
  }

  const requiredFields = schema.required;
  if (!Array.isArray(requiredFields) || requiredFields.length === 0) {
    throw new Error(`${schemaPath}: must declare at least one required field`);
  }

  const expectedFields = ["source_command", "commit_sha", "run_id", "policy_version"];
  for (const field of expectedFields) {
    if (!requiredFields.includes(field)) {
      throw new Error(`${schemaPath}: missing required provenance field "${field}"`);
    }
  }
}

function validateTaskReadinessMarker(): void {
  const tasksPath = ".GITHUB-MODE/docs/planning/implementation-tasks.md";
  const tasksDoc = readFileSync(path.join(ROOT, tasksPath), "utf8");
  const marker = "Task 1 readiness: ✅ Ready to commence";

  if (!tasksDoc.includes(marker)) {
    throw new Error(`${tasksPath}: missing readiness marker \`${marker}\``);
  }
}

function main(): void {
  for (const contract of requiredContracts) {
    const data = readJson(contract.file);
    assertRequiredKeys(contract.file, data, contract.requiredKeys);
  }

  validateManifestSchema();
  validateEntityManifestSchema();
  validateAdapterContractsSchema();
  validateCollaborationPolicySchema();
  validateCollaborationEnvelopeSchema();
  validateCollaborationPolicyDenyDefault();
  validateParityMatrix();
  validateConvergenceMap();
  validateRequiredHighValueWorkflowCoverage();
  validateSkillsQuarantineRegistry();
  validateTrustedAllowlist();
  validateTrustedCommandGate();
  validateEmergencyRevocations();
  validateProvenanceMetadataSchema();
  validateTaskReadinessMarker();

  console.log("GitHub runtime contracts: validation passed.");
}

main();
