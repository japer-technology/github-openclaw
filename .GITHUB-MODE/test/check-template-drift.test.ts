import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkTemplateDrift,
  validateTemplateBaselineContract,
} from "../scripts/check-template-drift.js";

function createFixtureRoot(
  baseline: Record<string, unknown>,
  extraFiles?: Record<string, string>,
): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "template-drift-"));
  const runtimeDir = path.join(root, ".GITHUB-MODE", "runtime");
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(
    path.join(runtimeDir, "template-baseline.json"),
    JSON.stringify(baseline, null, 2),
    "utf8",
  );

  if (extraFiles) {
    for (const [filePath, content] of Object.entries(extraFiles)) {
      const fullPath = path.join(root, filePath);
      mkdirSync(path.dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, "utf8");
    }
  }

  return root;
}

const VALID_BASELINE = {
  schemaVersion: "1.0",
  baselineVersion: "v1.0.0",
  requiredFiles: [".GITHUB-MODE/ACTIVE.md"],
  requiredWorkflows: ["github-mode-check.yml"],
};

describe("check-template-drift", () => {
  it("passes when all required files and workflows exist", () => {
    const root = createFixtureRoot(VALID_BASELINE, {
      ".GITHUB-MODE/ACTIVE.md": "active",
      ".github/workflows/github-mode-check.yml": "name: check",
    });

    const result = checkTemplateDrift(root);
    expect(result.drifted).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it("detects missing required file", () => {
    const root = createFixtureRoot(VALID_BASELINE, {
      ".github/workflows/github-mode-check.yml": "name: check",
    });

    const result = checkTemplateDrift(root);
    expect(result.drifted).toBe(true);
    expect(result.findings.some((f) => f.category === "missing-file")).toBe(true);
  });

  it("detects missing required workflow", () => {
    const root = createFixtureRoot(VALID_BASELINE, {
      ".GITHUB-MODE/ACTIVE.md": "active",
    });

    const result = checkTemplateDrift(root);
    expect(result.drifted).toBe(true);
    expect(result.findings.some((f) => f.category === "missing-workflow")).toBe(true);
  });

  it("includes migration guidance in findings", () => {
    const root = createFixtureRoot(VALID_BASELINE);

    const result = checkTemplateDrift(root);
    expect(result.drifted).toBe(true);
    for (const finding of result.findings) {
      expect(finding.guidance).toBeTruthy();
    }
  });

  it("handles empty required lists gracefully", () => {
    const root = createFixtureRoot({
      ...VALID_BASELINE,
      requiredFiles: [],
      requiredWorkflows: [],
    });

    const result = checkTemplateDrift(root);
    expect(result.drifted).toBe(false);
  });

  it("detects missing required label in labeler.yml", () => {
    const root = createFixtureRoot(
      { ...VALID_BASELINE, requiredLabels: ["github-mode"] },
      {
        ".GITHUB-MODE/ACTIVE.md": "active",
        ".github/workflows/github-mode-check.yml": "name: check",
      },
    );

    const result = checkTemplateDrift(root);
    expect(result.drifted).toBe(true);
    expect(result.findings.some((f) => f.category === "missing-label")).toBe(true);
  });

  it("passes when required label exists in labeler.yml", () => {
    const root = createFixtureRoot(
      { ...VALID_BASELINE, requiredLabels: ["github-mode"] },
      {
        ".GITHUB-MODE/ACTIVE.md": "active",
        ".github/workflows/github-mode-check.yml": "name: check",
        ".github/labeler.yml":
          '"github-mode":\n  - changed-files:\n      - any-glob-to-any-file:\n          - ".GITHUB-MODE/**"\n',
      },
    );

    const result = checkTemplateDrift(root);
    expect(result.drifted).toBe(false);
    expect(result.findings).toHaveLength(0);
  });
});

describe("validateTemplateBaselineContract", () => {
  it("passes with valid baseline", () => {
    const root = createFixtureRoot(VALID_BASELINE);
    expect(() => validateTemplateBaselineContract(root)).not.toThrow();
  });

  it("fails when schemaVersion is missing", () => {
    const { schemaVersion: _, ...noSchema } = VALID_BASELINE;
    const root = createFixtureRoot(noSchema);
    expect(() => validateTemplateBaselineContract(root)).toThrow("schemaVersion");
  });

  it("fails when requiredFiles is empty", () => {
    const root = createFixtureRoot({ ...VALID_BASELINE, requiredFiles: [] });
    expect(() => validateTemplateBaselineContract(root)).toThrow("non-empty array");
  });
});
