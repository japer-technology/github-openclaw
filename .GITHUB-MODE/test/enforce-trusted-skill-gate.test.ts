import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateSkillGate } from "../scripts/enforce-trusted-skill-gate.js";

function createFixtureRoot(
  gate: Record<string, unknown>,
  allowlist: Record<string, unknown>,
): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "skill-gate-"));
  const runtimeDir = path.join(root, ".GITHUB-MODE", "runtime");
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(
    path.join(runtimeDir, "trusted-command-gate.json"),
    JSON.stringify(gate, null, 2),
    "utf8",
  );
  writeFileSync(
    path.join(runtimeDir, "trusted-skills-allowlist.json"),
    JSON.stringify(allowlist, null, 2),
    "utf8",
  );
  return root;
}

const APPROVED_DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const REVOKED_DIGEST = "sha256:rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr";
const UNKNOWN_DIGEST = "sha256:uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu";

const VALID_GATE = { enforcementMode: "fail_closed" };

const VALID_ALLOWLIST = {
  byDigest: {
    [APPROVED_DIGEST]: {
      skillName: "test-skill",
      status: "approved_trusted",
      approvalRecord: { securityApprover: "@sec", runtimeApprover: "@rt" },
      evidence: { scanArtifact: "scan-1", policyArtifact: "policy-1" },
    },
  },
  revokedDigests: [REVOKED_DIGEST],
};

describe("enforce-trusted-skill-gate", () => {
  it("passes for an approved trusted skill digest", () => {
    const root = createFixtureRoot(VALID_GATE, VALID_ALLOWLIST);
    expect(() => validateSkillGate(APPROVED_DIGEST, root)).not.toThrow();
  });

  it("fails when enforcementMode is not fail_closed", () => {
    const root = createFixtureRoot({ enforcementMode: "permissive" }, VALID_ALLOWLIST);
    expect(() => validateSkillGate(APPROVED_DIGEST, root)).toThrow(
      "enforcementMode must be fail_closed",
    );
  });

  it("fails when revokedDigests is not an array", () => {
    const allowlist = { ...VALID_ALLOWLIST, revokedDigests: "not-an-array" };
    const root = createFixtureRoot(VALID_GATE, allowlist);
    expect(() => validateSkillGate(APPROVED_DIGEST, root)).toThrow(
      "revokedDigests must be an array",
    );
  });

  it("fails for a revoked skill digest", () => {
    const root = createFixtureRoot(VALID_GATE, VALID_ALLOWLIST);
    expect(() => validateSkillGate(REVOKED_DIGEST, root)).toThrow(`${REVOKED_DIGEST} is revoked`);
  });

  it("fails for an unknown skill digest not in the allowlist", () => {
    const root = createFixtureRoot(VALID_GATE, VALID_ALLOWLIST);
    expect(() => validateSkillGate(UNKNOWN_DIGEST, root)).toThrow("must be an object");
  });

  it("fails when skill status is not approved_trusted", () => {
    const allowlist = {
      byDigest: {
        [APPROVED_DIGEST]: {
          ...VALID_ALLOWLIST.byDigest[APPROVED_DIGEST],
          status: "pending_review",
        },
      },
      revokedDigests: [],
    };
    const root = createFixtureRoot(VALID_GATE, allowlist);
    expect(() => validateSkillGate(APPROVED_DIGEST, root)).toThrow("is not approved_trusted");
  });

  it("fails when approvalRecord metadata is missing", () => {
    const { approvalRecord: _, ...withoutApproval } = VALID_ALLOWLIST.byDigest[APPROVED_DIGEST];
    const allowlist = {
      byDigest: { [APPROVED_DIGEST]: withoutApproval },
      revokedDigests: [],
    };
    const root = createFixtureRoot(VALID_GATE, allowlist);
    expect(() => validateSkillGate(APPROVED_DIGEST, root)).toThrow(
      "missing required metadata `approvalRecord`",
    );
  });

  it("fails when evidence metadata is missing", () => {
    const { evidence: _, ...withoutEvidence } = VALID_ALLOWLIST.byDigest[APPROVED_DIGEST];
    const allowlist = {
      byDigest: { [APPROVED_DIGEST]: withoutEvidence },
      revokedDigests: [],
    };
    const root = createFixtureRoot(VALID_GATE, allowlist);
    expect(() => validateSkillGate(APPROVED_DIGEST, root)).toThrow(
      "missing required metadata `evidence`",
    );
  });
});
