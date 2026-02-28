import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ProvenanceValidationResult,
  validateProvenanceMetadata,
} from "../scripts/validate-provenance-metadata.js";

function createFixtureRoot(files: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "provenance-metadata-"));
  const runtimeDir = path.join(root, ".GITHUB-MODE", "runtime");
  mkdirSync(runtimeDir, { recursive: true });

  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(path.join(runtimeDir, filename), JSON.stringify(content, null, 2), "utf8");
  }

  return root;
}

const VALID_PROVENANCE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://openclaw.ai/schemas/runtime/github-mode/provenance-metadata.schema.json",
  title: "GitHub Mode Provenance Metadata",
  type: "object",
  additionalProperties: false,
  required: ["source_command", "commit_sha", "run_id", "policy_version"],
  properties: {
    source_command: { type: "string", minLength: 1 },
    commit_sha: { type: "string", pattern: "^[a-f0-9]{40}$" },
    run_id: { type: "string", pattern: "^[0-9]+$" },
    policy_version: { type: "string", pattern: "^v[0-9]+\\.[0-9]+\\.[0-9]+$" },
  },
};

const VALID_COMMAND_POLICY = {
  schemaVersion: "1.0",
  policyVersion: "v1.0.0",
  enforcementMode: "enforce",
  allowedActions: ["plan", "validate", "open-pr"],
  allowedCommands: ["explain", "refactor", "test", "diagram"],
  constraints: [
    "No direct protected-branch mutation outside pull-request flow.",
    "Privileged adapters require trusted trigger context.",
    "Secrets are unavailable to untrusted fork pull-request jobs.",
  ],
};

function allValidFiles(): Record<string, unknown> {
  return {
    "provenance-metadata.schema.json": JSON.parse(JSON.stringify(VALID_PROVENANCE_SCHEMA)),
    "command-policy.json": JSON.parse(JSON.stringify(VALID_COMMAND_POLICY)),
  };
}

const VALID_PROVENANCE = {
  source_command: "explain",
  commit_sha: "a".repeat(40),
  run_id: "123456789",
  policy_version: "v1.0.0",
};

describe("validate-provenance-metadata", () => {
  describe("validateProvenanceMetadata", () => {
    it("passes for valid provenance metadata", () => {
      const root = createFixtureRoot(allValidFiles());
      const result = validateProvenanceMetadata(root, { ...VALID_PROVENANCE });
      expect(result.result).toBe("PASS");
      expect(result.provenance).not.toBeNull();
      expect(result.provenance?.source_command).toBe("explain");
      expect(result.provenance?.commit_sha).toBe("a".repeat(40));
      expect(result.provenance?.run_id).toBe("123456789");
      expect(result.provenance?.policy_version).toBe("v1.0.0");
    });

    it("passes for all allowed commands", () => {
      const root = createFixtureRoot(allValidFiles());
      for (const command of ["explain", "refactor", "test", "diagram"]) {
        const result = validateProvenanceMetadata(root, {
          ...VALID_PROVENANCE,
          source_command: command,
        });
        expect(result.result).toBe("PASS");
        expect(result.provenance?.source_command).toBe(command);
      }
    });

    it("fails when source_command is missing", () => {
      const root = createFixtureRoot(allValidFiles());
      const provenance = { ...VALID_PROVENANCE };
      delete (provenance as Record<string, unknown>).source_command;
      const result = validateProvenanceMetadata(root, provenance);
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("source_command");
      expect(result.provenance).toBeNull();
    });

    it("fails when commit_sha is missing", () => {
      const root = createFixtureRoot(allValidFiles());
      const provenance = { ...VALID_PROVENANCE };
      delete (provenance as Record<string, unknown>).commit_sha;
      const result = validateProvenanceMetadata(root, provenance);
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("commit_sha");
      expect(result.provenance).toBeNull();
    });

    it("fails when run_id is missing", () => {
      const root = createFixtureRoot(allValidFiles());
      const provenance = { ...VALID_PROVENANCE };
      delete (provenance as Record<string, unknown>).run_id;
      const result = validateProvenanceMetadata(root, provenance);
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("run_id");
      expect(result.provenance).toBeNull();
    });

    it("fails when policy_version is missing", () => {
      const root = createFixtureRoot(allValidFiles());
      const provenance = { ...VALID_PROVENANCE };
      delete (provenance as Record<string, unknown>).policy_version;
      const result = validateProvenanceMetadata(root, provenance);
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("policy_version");
      expect(result.provenance).toBeNull();
    });

    it("fails when source_command is empty", () => {
      const root = createFixtureRoot(allValidFiles());
      const result = validateProvenanceMetadata(root, {
        ...VALID_PROVENANCE,
        source_command: "",
      });
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("source_command");
      expect(result.reason).toContain("empty");
    });

    it("fails when commit_sha has wrong format", () => {
      const root = createFixtureRoot(allValidFiles());
      const result = validateProvenanceMetadata(root, {
        ...VALID_PROVENANCE,
        commit_sha: "not-a-sha",
      });
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("schema validation failed");
    });

    it("fails when commit_sha is too short", () => {
      const root = createFixtureRoot(allValidFiles());
      const result = validateProvenanceMetadata(root, {
        ...VALID_PROVENANCE,
        commit_sha: "abcdef1",
      });
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("schema validation failed");
    });

    it("fails when run_id is not numeric", () => {
      const root = createFixtureRoot(allValidFiles());
      const result = validateProvenanceMetadata(root, {
        ...VALID_PROVENANCE,
        run_id: "not-numeric",
      });
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("schema validation failed");
    });

    it("fails when policy_version has wrong format", () => {
      const root = createFixtureRoot(allValidFiles());
      const result = validateProvenanceMetadata(root, {
        ...VALID_PROVENANCE,
        policy_version: "1.0.0",
      });
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("schema validation failed");
    });

    it("fails when policy_version does not match command-policy.json", () => {
      const root = createFixtureRoot(allValidFiles());
      const result = validateProvenanceMetadata(root, {
        ...VALID_PROVENANCE,
        policy_version: "v2.0.0",
      });
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("does not match");
      expect(result.reason).toContain("v2.0.0");
      expect(result.reason).toContain("v1.0.0");
    });

    it("fails when provenance schema file is missing", () => {
      const files = allValidFiles();
      delete files["provenance-metadata.schema.json"];
      const root = createFixtureRoot(files);
      const result = validateProvenanceMetadata(root, { ...VALID_PROVENANCE });
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("failed to read provenance schema");
    });

    it("fails when command-policy.json is missing", () => {
      const files = allValidFiles();
      delete files["command-policy.json"];
      const root = createFixtureRoot(files);
      const result = validateProvenanceMetadata(root, { ...VALID_PROVENANCE });
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("failed to read command-policy.json");
    });

    it("fails when a provenance field is not a string", () => {
      const root = createFixtureRoot(allValidFiles());
      const result = validateProvenanceMetadata(root, {
        ...VALID_PROVENANCE,
        run_id: 123456789,
      });
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("run_id");
    });

    it("every result has all required fields", () => {
      const root = createFixtureRoot(allValidFiles());
      const results: ProvenanceValidationResult[] = [
        validateProvenanceMetadata(root, { ...VALID_PROVENANCE }),
        validateProvenanceMetadata(root, {}),
        validateProvenanceMetadata(root, { ...VALID_PROVENANCE, commit_sha: "bad" }),
      ];
      for (const r of results) {
        expect(r).toHaveProperty("gate");
        expect(r).toHaveProperty("result");
        expect(r).toHaveProperty("reason");
        expect(r).toHaveProperty("evidence");
        expect(r).toHaveProperty("provenance");
        expect(r).toHaveProperty("timestamp");
        expect(r.gate).toBe("provenance-metadata");
      }
    });

    it("evidence references schema and policy files on success", () => {
      const root = createFixtureRoot(allValidFiles());
      const result = validateProvenanceMetadata(root, { ...VALID_PROVENANCE });
      expect(result.result).toBe("PASS");
      expect(result.evidence).toContain("provenance-metadata.schema.json");
      expect(result.evidence).toContain("command-policy.json");
    });

    it("fails when provenance has additional unknown fields", () => {
      const root = createFixtureRoot(allValidFiles());
      const result = validateProvenanceMetadata(root, {
        ...VALID_PROVENANCE,
        extra_field: "unexpected",
      });
      expect(result.result).toBe("FAIL");
      expect(result.reason).toContain("schema validation failed");
    });
  });
});
