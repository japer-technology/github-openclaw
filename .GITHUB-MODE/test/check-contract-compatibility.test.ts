import { describe, expect, it } from "vitest";
import {
  analyzeCompatibility,
  hasMajorVersionBump,
  hasNewMigrationNote,
} from "../scripts/check-contract-compatibility.js";

describe("hasMajorVersionBump", () => {
  it("accepts a major version bump on breaking changes", () => {
    const result = hasMajorVersionBump(
      { policyVersion: "v1.2.3", schemaVersion: "1.0", required: ["a"] },
      { policyVersion: "v2.0.0", schemaVersion: "1.0", required: ["a"] },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects when major version is unchanged", () => {
    const result = hasMajorVersionBump(
      { policyVersion: "v1.2.3", schemaVersion: "1.0" },
      { policyVersion: "v1.3.0", schemaVersion: "1.0" },
    );
    expect(result.ok).toBe(false);
  });
});

describe("hasNewMigrationNote", () => {
  it("detects newly-added migration notes", () => {
    const base = `### Migration notes\n\n- _(none yet)_\n`;
    const head = `### Migration notes\n\n- 2026-02-18: Renamed required key foo -> bar.\n`;
    expect(hasNewMigrationNote(base, head)).toBe(true);
  });

  it("requires an actually new entry", () => {
    const base = `### Migration notes\n\n- 2026-02-17: Existing note.\n`;
    const head = `### Migration notes\n\n- 2026-02-17: Existing note.\n`;
    expect(hasNewMigrationNote(base, head)).toBe(false);
  });
});

describe("analyzeCompatibility", () => {
  it("passes when breaking change has major bump and migration note", () => {
    const result = analyzeCompatibility(
      [".GITHUB-MODE/runtime/command-policy.json"],
      {
        ".GITHUB-MODE/runtime/command-policy.json": {
          schemaVersion: "1.0",
          policyVersion: "v1.0.0",
          required: ["allowedActions", "constraints"],
        },
      },
      {
        ".GITHUB-MODE/runtime/command-policy.json": {
          schemaVersion: "1.0",
          policyVersion: "v2.0.0",
          required: ["allowedActions"],
        },
      },
      `### Migration notes\n\n- _(none yet)_\n`,
      `### Migration notes\n\n- 2026-02-18: Removed constraints key and documented migration.\n`,
    );

    expect(result.breakingChanges.length).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });

  it("fails when breaking change does not bump major version", () => {
    const result = analyzeCompatibility(
      [".GITHUB-MODE/runtime/command-policy.json"],
      {
        ".GITHUB-MODE/runtime/command-policy.json": {
          schemaVersion: "1.0",
          policyVersion: "v1.0.0",
          required: ["allowedActions", "constraints"],
        },
      },
      {
        ".GITHUB-MODE/runtime/command-policy.json": {
          schemaVersion: "1.0",
          policyVersion: "v1.1.0",
          required: ["allowedActions"],
        },
      },
      `### Migration notes\n\n- _(none yet)_\n`,
      `### Migration notes\n\n- 2026-02-18: Removed constraints key and documented migration.\n`,
    );

    expect(result.errors.some((error) => error.includes("no major bump"))).toBe(true);
  });

  it("fails when migration notes are missing", () => {
    const result = analyzeCompatibility(
      [".GITHUB-MODE/runtime/command-policy.json"],
      {
        ".GITHUB-MODE/runtime/command-policy.json": {
          schemaVersion: "1.0",
          policyVersion: "v1.0.0",
          required: ["allowedActions", "constraints"],
        },
      },
      {
        ".GITHUB-MODE/runtime/command-policy.json": {
          schemaVersion: "1.0",
          policyVersion: "v2.0.0",
          required: ["allowedActions"],
        },
      },
      `### Migration notes\n\n- 2026-02-17: Existing note.\n`,
      `### Migration notes\n\n- 2026-02-17: Existing note.\n`,
    );

    expect(result.errors.some((error) => error.includes("Migration notes"))).toBe(true);
  });
});
