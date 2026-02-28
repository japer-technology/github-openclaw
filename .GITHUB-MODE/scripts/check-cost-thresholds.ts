import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type JsonObject = Record<string, unknown>;

const COST_THRESHOLDS_PATH = ".GITHUB-MODE/runtime/cost-thresholds.json";

function readJson(filePath: string, root: string): JsonObject {
  const fullPath = path.join(root, filePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as JsonObject;
}

export type CostGateResult = {
  passed: boolean;
  findings: CostFinding[];
};

export type CostFinding = {
  gateId: string;
  actualAmount: number;
  maxAmount: number;
  passed: boolean;
};

export type CostInput = {
  gateId: string;
  amount: number;
};

type CostGate = {
  id: string;
  description: string;
  maxAmount: number;
  blocksPromotion: boolean;
};

export function checkCostThresholds(inputs: CostInput[], root: string): CostGateResult {
  const config = readJson(COST_THRESHOLDS_PATH, root);

  if (config.enforcementMode !== "enforce") {
    return { passed: true, findings: [] };
  }

  const gates = config.gates as CostGate[];
  if (!Array.isArray(gates) || gates.length === 0) {
    throw new Error(`${COST_THRESHOLDS_PATH}: gates must be a non-empty array`);
  }

  const gateMap = new Map<string, CostGate>();
  for (const gate of gates) {
    gateMap.set(gate.id, gate);
  }

  const findings: CostFinding[] = [];

  for (const input of inputs) {
    const gate = gateMap.get(input.gateId);
    if (!gate) {
      continue;
    }

    const passed = input.amount <= gate.maxAmount;

    findings.push({
      gateId: input.gateId,
      actualAmount: input.amount,
      maxAmount: gate.maxAmount,
      passed,
    });
  }

  const allPassed = findings.every((finding) => finding.passed);
  return { passed: allPassed, findings };
}

export function validateCostThresholdsContract(root: string): void {
  const config = readJson(COST_THRESHOLDS_PATH, root);

  if (!config.schemaVersion) {
    throw new Error(`${COST_THRESHOLDS_PATH}: missing required key \`schemaVersion\``);
  }
  if (!config.thresholdsVersion) {
    throw new Error(`${COST_THRESHOLDS_PATH}: missing required key \`thresholdsVersion\``);
  }
  if (!config.enforcementMode) {
    throw new Error(`${COST_THRESHOLDS_PATH}: missing required key \`enforcementMode\``);
  }

  const gates = config.gates;
  if (!Array.isArray(gates) || gates.length === 0) {
    throw new Error(`${COST_THRESHOLDS_PATH}: gates must be a non-empty array`);
  }

  for (const [index, gate] of gates.entries()) {
    const record = gate as CostGate;
    if (!record.id || typeof record.maxAmount !== "number") {
      throw new Error(`${COST_THRESHOLDS_PATH}: gates[${index}] requires id and numeric maxAmount`);
    }
  }
}

function formatSummary(result: CostGateResult): string {
  if (result.passed && result.findings.length === 0) {
    return "Cost threshold check passed (no cost inputs).";
  }

  const lines = [
    result.passed ? "Cost threshold check passed." : "Cost threshold check FAILED.",
    "",
  ];
  for (const finding of result.findings) {
    const status = finding.passed ? "PASS" : "FAIL";
    lines.push(
      `- [${status}] ${finding.gateId}: $${finding.actualAmount.toFixed(2)} (max: $${finding.maxAmount.toFixed(2)})`,
    );
  }
  return lines.join("\n");
}

function main(): void {
  const root = process.cwd();

  validateCostThresholdsContract(root);

  const costsJson = process.env.COST_INPUTS;
  const inputs: CostInput[] = costsJson ? (JSON.parse(costsJson) as CostInput[]) : [];
  const result = checkCostThresholds(inputs, root);
  const summary = formatSummary(result);

  console.log(summary);

  if (!result.passed) {
    process.exit(1);
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-cost-thresholds.ts")
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
