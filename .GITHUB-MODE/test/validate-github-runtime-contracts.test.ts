import { execSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PARITY_PATH = ".GITHUB-MODE/runtime/parity-matrix.json";
const CONVERGENCE_PATH = ".GITHUB-MODE/runtime/workspace-convergence-map.json";

const ROOT = process.cwd();
const SCRIPT = ".GITHUB-MODE/scripts/validate-github-runtime-contracts.ts";

function runValidator(): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node --import tsx ${SCRIPT}`, {
      encoding: "utf8",
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout: stdout.trim(), exitCode: 0 };
  } catch (error) {
    const err = error as { status: number; stderr?: string; stdout?: string };
    return { stdout: (err.stderr ?? err.stdout ?? "").trim(), exitCode: err.status };
  }
}

function withTempFile<T>(filePath: string, content: string, fn: () => T): T {
  const absolutePath = path.join(ROOT, filePath);
  const original = readFileSync(absolutePath, "utf8");
  writeFileSync(absolutePath, content, "utf8");
  try {
    return fn();
  } finally {
    writeFileSync(absolutePath, original, "utf8");
  }
}

function withRemovedFile<T>(filePath: string, fn: () => T): T {
  const absolutePath = path.join(ROOT, filePath);
  const original = readFileSync(absolutePath, "utf8");
  rmSync(absolutePath);
  try {
    return fn();
  } finally {
    writeFileSync(absolutePath, original, "utf8");
  }
}

type ParityMapping = {
  workflow: string;
  installedRuntime: string;
  githubMode: string;
  parity: string;
};
type ParityContract = { mappings: ParityMapping[] } & Record<string, unknown>;
type ConvergenceContract = { requiredHighValueWorkflows: string[] } & Record<string, unknown>;

function withRuntimeContracts<T>(
  fn: (contracts: { parity: ParityContract; convergence: ConvergenceContract }) => T,
): T {
  const parity = JSON.parse(readFileSync(path.join(ROOT, PARITY_PATH), "utf8")) as ParityContract;
  const convergence = JSON.parse(
    readFileSync(path.join(ROOT, CONVERGENCE_PATH), "utf8"),
  ) as ConvergenceContract;
  return fn({ parity, convergence });
}

describe("validate-github-runtime-contracts", () => {
  it("passes with valid contracts", () => {
    const result = runValidator();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("validation passed");
  });

  it("fails when runtime-manifest.json is missing a required key", () => {
    const result = withTempFile(
      ".GITHUB-MODE/runtime/runtime-manifest.json",
      JSON.stringify({ schemaVersion: "1.0" }),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("missing required key");
  });

  it("fails when parity-matrix.json has an invalid parity value", () => {
    const invalidMatrix = {
      schemaVersion: "1.0",
      matrixVersion: "v1.0.0",
      mappings: [
        {
          workflow: "test",
          installedRuntime: "test",
          githubMode: "test",
          parity: "full",
        },
      ],
    };
    const result = withTempFile(PARITY_PATH, JSON.stringify(invalidMatrix, null, 2), runValidator);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("invalid parity value");
  });

  it("fails when installed-only parity entry lacks owner", () => {
    const noOwner = {
      schemaVersion: "1.0",
      matrixVersion: "v1.0.0",
      mappings: [
        {
          workflow: "test",
          installedRuntime: "test",
          githubMode: "test",
          parity: "installed-only",
          rationale: "test rationale",
        },
      ],
    };
    const result = withTempFile(PARITY_PATH, JSON.stringify(noOwner, null, 2), runValidator);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("requires both");
  });

  it("fails when convergence map has no required signal", () => {
    const noRequiredSignal = {
      schemaVersion: "1.0",
      convergenceVersion: "v1.0.0",
      acceptanceCriteria: ["Some criteria"],
      requiredHighValueWorkflows: ["build-and-test"],
      reconciliationSignals: [{ signal: "test", source: "test", required: false }],
    };
    const result = withTempFile(
      CONVERGENCE_PATH,
      JSON.stringify(noRequiredSignal, null, 2),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("required=true");
  });

  it("fails when manifest does not match schema", () => {
    const badManifest = {
      schemaVersion: "1.0",
      manifestVersion: "v1.0.0",
      components: [
        {
          id: "INVALID_ID_WITH_CAPS",
          version: "v1.0.0",
          owner: "@test",
        },
      ],
    };
    const result = withTempFile(
      ".GITHUB-MODE/runtime/runtime-manifest.json",
      JSON.stringify(badManifest, null, 2),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("schema validation failed");
  });

  it("fails when required high-value workflows are missing from parity matrix mappings", () => {
    const result = withRuntimeContracts(({ parity, convergence }) => {
      const required = convergence.requiredHighValueWorkflows;
      const workflowToRemove = required[0];
      const mappings = parity.mappings.filter((mapping) => mapping.workflow !== workflowToRemove);

      return withTempFile(
        PARITY_PATH,
        JSON.stringify({ ...parity, mappings }, null, 2),
        runValidator,
      );
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("missing required high-value workflow mappings");
  });

  it("passes when all required high-value workflows are present in parity matrix mappings", () => {
    const result = withRuntimeContracts(({ parity, convergence }) => {
      const required = convergence.requiredHighValueWorkflows;
      const existing = new Set(parity.mappings.map((mapping) => mapping.workflow));
      const missing = required.filter((workflow) => !existing.has(workflow));
      const appendedMappings = missing.map((workflow) => ({
        workflow,
        installedRuntime: `${workflow} installed runtime`,
        githubMode: `${workflow} github mode`,
        parity: "adapter",
      }));

      return withTempFile(
        PARITY_PATH,
        JSON.stringify({ ...parity, mappings: [...parity.mappings, ...appendedMappings] }, null, 2),
        runValidator,
      );
    });

    expect(result.exitCode).toBe(0);
  });
});

describe("entity-manifest validation", () => {
  it("fails when entity-manifest.json is missing", () => {
    const result = withRemovedFile(".GITHUB-MODE/runtime/entity-manifest.json", runValidator);
    expect(result.exitCode).not.toBe(0);
  });

  it("fails when entity-manifest.json is missing required key", () => {
    const result = withTempFile(
      ".GITHUB-MODE/runtime/entity-manifest.json",
      JSON.stringify({ schemaVersion: "1.0" }),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("missing required key");
  });

  it("fails when entity-manifest.json does not match schema", () => {
    const badEntity = {
      schemaVersion: "1.0",
      entityId: "INVALID CAPS AND SPACES",
      owner: "@openclaw/runtime",
      trustTier: "trusted",
    };
    const result = withTempFile(
      ".GITHUB-MODE/runtime/entity-manifest.json",
      JSON.stringify(badEntity, null, 2),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("schema validation failed");
  });

  it("fails when entity-manifest.json has invalid trust tier", () => {
    const badTrust = {
      schemaVersion: "1.0",
      entityId: "test-entity",
      owner: "@openclaw/runtime",
      trustTier: "super-trusted",
    };
    const result = withTempFile(
      ".GITHUB-MODE/runtime/entity-manifest.json",
      JSON.stringify(badTrust, null, 2),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("schema validation failed");
  });
});

describe("collaboration-policy validation", () => {
  it("fails when collaboration-policy.json is missing", () => {
    const result = withRemovedFile(".GITHUB-MODE/runtime/collaboration-policy.json", runValidator);
    expect(result.exitCode).not.toBe(0);
  });

  it("fails when collaboration-policy.json is missing required key", () => {
    const result = withTempFile(
      ".GITHUB-MODE/runtime/collaboration-policy.json",
      JSON.stringify({ schemaVersion: "1.0" }),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("missing required key");
  });

  it("fails when collaboration-policy.json does not match schema", () => {
    const badPolicy = {
      schemaVersion: "1.0",
      policyVersion: "v1.0.0",
      defaultAction: "allow",
      allowedRoutes: [],
    };
    const result = withTempFile(
      ".GITHUB-MODE/runtime/collaboration-policy.json",
      JSON.stringify(badPolicy, null, 2),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("schema validation failed");
  });

  it("passes when collaboration-policy.json defaultAction is deny", () => {
    const validDenyPolicy = {
      schemaVersion: "1.0",
      policyVersion: "v1.0.0",
      defaultAction: "deny",
      allowedRoutes: [],
    };
    const result = withTempFile(
      ".GITHUB-MODE/runtime/collaboration-policy.json",
      JSON.stringify(validDenyPolicy, null, 2),
      runValidator,
    );
    expect(result.exitCode).toBe(0);
  });
});

describe("adapter-contracts schema validation", () => {
  it("fails when adapter-contracts.json does not match schema", () => {
    const badContracts = {
      schemaVersion: "1.0",
      contractsVersion: "v1.0.0",
      adapters: [
        {
          name: "INVALID CAPS AND SPACES",
          capability: "test",
          trustLevels: ["trusted"],
          constraints: ["test constraint"],
        },
      ],
    };
    const result = withTempFile(
      ".GITHUB-MODE/runtime/adapter-contracts.json",
      JSON.stringify(badContracts, null, 2),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("schema validation failed");
  });

  it("fails when adapter has invalid trust level", () => {
    const badTrust = {
      schemaVersion: "1.0",
      contractsVersion: "v1.0.0",
      adapters: [
        {
          name: "test-adapter",
          capability: "test capability",
          trustLevels: ["super-trusted"],
          constraints: ["test constraint"],
        },
      ],
    };
    const result = withTempFile(
      ".GITHUB-MODE/runtime/adapter-contracts.json",
      JSON.stringify(badTrust, null, 2),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("schema validation failed");
  });

  it("fails when adapter has empty constraints", () => {
    const noConstraints = {
      schemaVersion: "1.0",
      contractsVersion: "v1.0.0",
      adapters: [
        {
          name: "test-adapter",
          capability: "test capability",
          trustLevels: ["trusted"],
          constraints: [],
        },
      ],
    };
    const result = withTempFile(
      ".GITHUB-MODE/runtime/adapter-contracts.json",
      JSON.stringify(noConstraints, null, 2),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("schema validation failed");
  });

  it("fails when adapters array is empty", () => {
    const emptyAdapters = {
      schemaVersion: "1.0",
      contractsVersion: "v1.0.0",
      adapters: [],
    };
    const result = withTempFile(
      ".GITHUB-MODE/runtime/adapter-contracts.json",
      JSON.stringify(emptyAdapters, null, 2),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("schema validation failed");
  });
});

describe("collaboration-envelope schema validation", () => {
  it("fails when collaboration-envelope.schema.json is missing", () => {
    const result = withRemovedFile(
      ".GITHUB-MODE/runtime/collaboration-envelope.schema.json",
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
  });

  it("fails when collaboration-envelope.schema.json is invalid JSON Schema", () => {
    const badSchema = { type: "invalid-type" };
    const result = withTempFile(
      ".GITHUB-MODE/runtime/collaboration-envelope.schema.json",
      JSON.stringify(badSchema, null, 2),
      runValidator,
    );
    expect(result.exitCode).not.toBe(0);
  });
});

describe("skills quarantine pipeline contracts", () => {
  it("fails when trusted allowlist uses same approver for both roles", () => {
    const invalidAllowlist = {
      schemaVersion: "1.0",
      allowlistVersion: "v1.0.0",
      keyType: "sha256",
      byDigest: {
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {
          skillName: "test-skill",
          status: "approved_trusted",
          approvalRecord: {
            submittedBy: "@submitter",
            securityApprover: "@same-person",
            runtimeApprover: "@same-person",
          },
          evidence: { scanArtifact: "scan", policyArtifact: "policy" },
        },
      },
      revokedDigests: [],
    };

    const result = withTempFile(
      ".GITHUB-MODE/runtime/trusted-skills-allowlist.json",
      JSON.stringify(invalidAllowlist, null, 2),
      runValidator,
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("approvers must be distinct");
  });

  it("fails when trusted command gate does not enforce fail_closed", () => {
    const invalidGate = {
      schemaVersion: "1.0",
      gateVersion: "v1.0.0",
      enforcementMode: "warn_only",
      allowRuntimeFetch: false,
      trustedWorkflows: ["github-mode-trusted-command.yml"],
      requiredMetadata: ["skillDigest"],
    };

    const result = withTempFile(
      ".GITHUB-MODE/runtime/trusted-command-gate.json",
      JSON.stringify(invalidGate, null, 2),
      runValidator,
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("enforcementMode must be fail_closed");
  });

  it("fails when quarantine registry omits required policy classifier outcome", () => {
    const invalidRegistry = {
      schemaVersion: "1.0",
      registryVersion: "v1.0.0",
      classifierOutcomes: ["approved_trusted", "rejected_policy"],
      submissions: [
        {
          submissionId: "sub-1",
          state: "pending_scan",
        },
      ],
    };

    const result = withTempFile(
      ".GITHUB-MODE/runtime/skills-quarantine-registry.json",
      JSON.stringify(invalidRegistry, null, 2),
      runValidator,
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("classifierOutcomes missing approved_limited");
  });
});
