import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type JsonObject = Record<string, unknown>;

const EVAL_THRESHOLDS_PATH = ".GITHUB-MODE/runtime/eval-thresholds.json";

function readJson(filePath: string, root: string): JsonObject {
  const fullPath = path.join(root, filePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as JsonObject;
}

export type EvalGateResult = {
  passed: boolean;
  findings: EvalFinding[];
};

export type EvalFinding = {
  subsystemId: string;
  tier: string;
  metric: string;
  actualScore: number;
  threshold: number;
  passed: boolean;
};

export type EvalInput = {
  subsystemId: string;
  score: number;
};

type Tier = {
  id: string;
  minScore: number;
  maxRegressionDelta: number;
  blocksPromotion: boolean;
};

type Subsystem = {
  id: string;
  tier: string;
  metric: string;
  baseline: number;
};

export function checkEvalThresholds(inputs: EvalInput[], root: string): EvalGateResult {
  const config = readJson(EVAL_THRESHOLDS_PATH, root);

  if (config.enforcementMode !== "enforce") {
    return { passed: true, findings: [] };
  }

  const tiers = config.tiers as Tier[];
  const subsystems = config.subsystems as Subsystem[];

  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error(`${EVAL_THRESHOLDS_PATH}: tiers must be a non-empty array`);
  }

  if (!Array.isArray(subsystems) || subsystems.length === 0) {
    throw new Error(`${EVAL_THRESHOLDS_PATH}: subsystems must be a non-empty array`);
  }

  const tierMap = new Map<string, Tier>();
  for (const tier of tiers) {
    tierMap.set(tier.id, tier);
  }

  const findings: EvalFinding[] = [];

  for (const input of inputs) {
    const subsystem = subsystems.find((sub) => sub.id === input.subsystemId);
    if (!subsystem) {
      continue;
    }

    const tier = tierMap.get(subsystem.tier);
    if (!tier) {
      throw new Error(
        `${EVAL_THRESHOLDS_PATH}: tier "${subsystem.tier}" referenced by subsystem "${subsystem.id}" not found`,
      );
    }

    const threshold = tier.minScore;
    const passed = input.score >= threshold;

    findings.push({
      subsystemId: input.subsystemId,
      tier: subsystem.tier,
      metric: subsystem.metric,
      actualScore: input.score,
      threshold,
      passed,
    });
  }

  const allPassed = findings.every((finding) => finding.passed);
  return { passed: allPassed, findings };
}

export function validateEvalThresholdsContract(root: string): void {
  const config = readJson(EVAL_THRESHOLDS_PATH, root);

  if (!config.schemaVersion) {
    throw new Error(`${EVAL_THRESHOLDS_PATH}: missing required key \`schemaVersion\``);
  }
  if (!config.thresholdsVersion) {
    throw new Error(`${EVAL_THRESHOLDS_PATH}: missing required key \`thresholdsVersion\``);
  }
  if (!config.enforcementMode) {
    throw new Error(`${EVAL_THRESHOLDS_PATH}: missing required key \`enforcementMode\``);
  }

  const tiers = config.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error(`${EVAL_THRESHOLDS_PATH}: tiers must be a non-empty array`);
  }

  for (const [index, tier] of tiers.entries()) {
    const record = tier as Tier;
    if (!record.id || typeof record.minScore !== "number") {
      throw new Error(`${EVAL_THRESHOLDS_PATH}: tiers[${index}] requires id and numeric minScore`);
    }
  }

  const subsystems = config.subsystems;
  if (!Array.isArray(subsystems) || subsystems.length === 0) {
    throw new Error(`${EVAL_THRESHOLDS_PATH}: subsystems must be a non-empty array`);
  }
}

function formatSummary(result: EvalGateResult): string {
  if (result.passed && result.findings.length === 0) {
    return "Eval threshold check passed (no evaluated subsystems).";
  }

  const lines = [
    result.passed ? "Eval threshold check passed." : "Eval threshold check FAILED.",
    "",
  ];
  for (const finding of result.findings) {
    const status = finding.passed ? "PASS" : "FAIL";
    lines.push(
      `- [${status}] ${finding.subsystemId} (${finding.metric}): ${finding.actualScore} (threshold: ${finding.threshold})`,
    );
  }
  return lines.join("\n");
}

function main(): void {
  const root = process.cwd();

  validateEvalThresholdsContract(root);

  const scoresJson = process.env.EVAL_SCORES;
  const inputs: EvalInput[] = scoresJson ? (JSON.parse(scoresJson) as EvalInput[]) : [];
  const result = checkEvalThresholds(inputs, root);
  const summary = formatSummary(result);

  console.log(summary);

  if (!result.passed) {
    process.exit(1);
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-eval-thresholds.ts")
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
