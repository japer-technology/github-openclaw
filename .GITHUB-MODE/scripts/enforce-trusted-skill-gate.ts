import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type JsonObject = Record<string, unknown>;

const ALLOWLIST_PATH = ".GITHUB-MODE/runtime/trusted-skills-allowlist.json";
const GATE_PATH = ".GITHUB-MODE/runtime/trusted-command-gate.json";

export function readJson(filePath: string, root: string): JsonObject {
  const fullPath = path.join(root, filePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as JsonObject;
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function validateSkillGate(skillDigest: string, root: string): void {
  const gateContract = readJson(GATE_PATH, root);
  if (gateContract.enforcementMode !== "fail_closed") {
    throw new Error("Fail-closed gate blocked startup: enforcementMode must be fail_closed");
  }

  const allowlist = readJson(ALLOWLIST_PATH, root);
  const byDigest = asRecord(allowlist.byDigest, "trusted-skills-allowlist.byDigest");
  const revoked = allowlist.revokedDigests;

  if (!Array.isArray(revoked)) {
    throw new Error("Fail-closed gate blocked startup: revokedDigests must be an array");
  }

  if (revoked.includes(skillDigest)) {
    throw new Error(`Fail-closed gate blocked startup: ${skillDigest} is revoked`);
  }

  const metadata = byDigest[skillDigest];
  const metadataRecord = asRecord(metadata, `trusted allowlist entry for ${skillDigest}`);

  if (metadataRecord.status !== "approved_trusted") {
    throw new Error(`Fail-closed gate blocked startup: ${skillDigest} is not approved_trusted`);
  }

  for (const requiredKey of ["approvalRecord", "evidence"]) {
    if (!(requiredKey in metadataRecord)) {
      throw new Error(
        `Fail-closed gate blocked startup: ${skillDigest} missing required metadata \
\`${requiredKey}\``,
      );
    }
  }
}

function main(): void {
  const skillDigest = process.env.SKILL_DIGEST;
  if (!skillDigest) {
    throw new Error("Fail-closed gate blocked startup: SKILL_DIGEST is missing");
  }

  validateSkillGate(skillDigest, process.cwd());
  console.log(`Trusted skill gate passed for digest ${skillDigest}.`);
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("enforce-trusted-skill-gate.ts")
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
