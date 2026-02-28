import { describe, expect, it } from "vitest";
import {
  type DiffEntry,
  findViolations,
  isGithubModeOwned,
  parseDiffEntries,
} from "../scripts/check-upstream-additions-only.js";

describe("isGithubModeOwned", () => {
  it("accepts .GITHUB-MODE paths", () => {
    expect(isGithubModeOwned(".GITHUB-MODE/docs/README.md")).toBe(true);
    expect(isGithubModeOwned(".GITHUB-MODE/docs/adr/0001-foo.md")).toBe(true);
    expect(isGithubModeOwned(".GITHUB-MODE/runtime/runtime-manifest.json")).toBe(true);
    expect(isGithubModeOwned(".GITHUB-MODE/runtime/parity-matrix.json")).toBe(true);
    expect(isGithubModeOwned(".GITHUB-MODE/scripts/validate-github-runtime-contracts.ts")).toBe(
      true,
    );
    expect(isGithubModeOwned(".GITHUB-MODE/scripts/check-upstream-additions-only.ts")).toBe(true);
    expect(isGithubModeOwned(".GITHUB-MODE/test/check-upstream-additions-only.test.ts")).toBe(true);
    expect(isGithubModeOwned(".GITHUB-MODE/test/validate-github-runtime-contracts.test.ts")).toBe(
      true,
    );
  });

  it("accepts github-mode workflow files", () => {
    expect(isGithubModeOwned(".github/workflows/github-mode-contracts.yml")).toBe(true);
    expect(isGithubModeOwned(".github/workflows/github-mode-build.yml")).toBe(true);
  });

  it("rejects upstream files", () => {
    expect(isGithubModeOwned("package.json")).toBe(false);
    expect(isGithubModeOwned("src/index.ts")).toBe(false);
    expect(isGithubModeOwned(".github/workflows/ci.yml")).toBe(false);
    expect(isGithubModeOwned("scripts/other-script.ts")).toBe(false);
    expect(isGithubModeOwned("docs/configuration.md")).toBe(false);
  });

  it("rejects paths that partially match owned patterns", () => {
    expect(isGithubModeOwned("docs/github-mode-extra.md")).toBe(false);
    expect(isGithubModeOwned("runtime/github-other/foo.json")).toBe(false);
  });
});

describe("findViolations", () => {
  it("allows all additions regardless of path", () => {
    const entries: DiffEntry[] = [
      { status: "A", path: "package.json" },
      { status: "A", path: "src/new-file.ts" },
      { status: "A", path: ".GITHUB-MODE/docs/new.md" },
    ];
    expect(findViolations(entries)).toEqual([]);
  });

  it("allows modifications to github-mode-owned paths", () => {
    const entries: DiffEntry[] = [
      { status: "M", path: ".GITHUB-MODE/docs/README.md" },
      { status: "M", path: ".GITHUB-MODE/runtime/parity-matrix.json" },
      { status: "M", path: ".GITHUB-MODE/scripts/validate-github-runtime-contracts.ts" },
    ];
    expect(findViolations(entries)).toEqual([]);
  });

  it("flags modifications to upstream files", () => {
    const entries: DiffEntry[] = [
      { status: "M", path: "package.json" },
      { status: "A", path: ".GITHUB-MODE/docs/new.md" },
    ];
    expect(findViolations(entries)).toEqual(["M\tpackage.json"]);
  });

  it("flags deletions of upstream files", () => {
    const entries: DiffEntry[] = [{ status: "D", path: "src/old-file.ts" }];
    expect(findViolations(entries)).toEqual(["D\tsrc/old-file.ts"]);
  });

  it("reports multiple violations", () => {
    const entries: DiffEntry[] = [
      { status: "M", path: "package.json" },
      { status: "M", path: ".github/workflows/ci.yml" },
      { status: "D", path: "src/removed.ts" },
      { status: "A", path: ".GITHUB-MODE/runtime/new-contract.json" },
    ];
    const violations = findViolations(entries);
    expect(violations).toHaveLength(3);
    expect(violations).toContain("M\tpackage.json");
    expect(violations).toContain("M\t.github/workflows/ci.yml");
    expect(violations).toContain("D\tsrc/removed.ts");
  });
});

describe("parseDiffEntries", () => {
  it("parses standard add/modify/delete entries", () => {
    const output = "A\tnew-file.ts\nM\texisting.ts\nD\tremoved.ts";
    const entries = parseDiffEntries(output);
    expect(entries).toEqual([
      { status: "A", path: "new-file.ts" },
      { status: "M", path: "existing.ts" },
      { status: "D", path: "removed.ts" },
    ]);
  });

  it("parses rename entries into two separate entries", () => {
    const output = "R100\told-path.ts\tnew-path.ts";
    const entries = parseDiffEntries(output);
    expect(entries).toEqual([
      { status: "R100", path: "old-path.ts" },
      { status: "R100", path: "new-path.ts" },
    ]);
  });

  it("parses copy entries into two separate entries", () => {
    const output = "C100\tsource.ts\tcopy.ts";
    const entries = parseDiffEntries(output);
    expect(entries).toEqual([
      { status: "C100", path: "source.ts" },
      { status: "C100", path: "copy.ts" },
    ]);
  });

  it("handles partial rename similarity scores", () => {
    const output = "R075\told-file.ts\tnew-file.ts";
    const entries = parseDiffEntries(output);
    expect(entries).toHaveLength(2);
    expect(entries[0].path).toBe("old-file.ts");
    expect(entries[1].path).toBe("new-file.ts");
  });

  it("skips malformed lines", () => {
    const output = "bad-line\nA\tgood-file.ts";
    const entries = parseDiffEntries(output);
    expect(entries).toEqual([{ status: "A", path: "good-file.ts" }]);
  });

  it("returns empty array for empty input", () => {
    expect(parseDiffEntries("")).toEqual([]);
  });
});

describe("findViolations with renames", () => {
  it("flags rename of upstream file to upstream location", () => {
    const entries: DiffEntry[] = [
      { status: "R100", path: "src/old.ts" },
      { status: "R100", path: "src/new.ts" },
    ];
    const violations = findViolations(entries);
    expect(violations).toHaveLength(2);
  });

  it("allows rename within github-mode-owned paths", () => {
    const entries: DiffEntry[] = [
      { status: "R100", path: ".GITHUB-MODE/docs/old.md" },
      { status: "R100", path: ".GITHUB-MODE/docs/new.md" },
    ];
    expect(findViolations(entries)).toEqual([]);
  });

  it("flags rename from upstream to owned path", () => {
    const entries: DiffEntry[] = [
      { status: "R100", path: "src/moved.ts" },
      { status: "R100", path: ".GITHUB-MODE/docs/moved.md" },
    ];
    const violations = findViolations(entries);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("src/moved.ts");
  });
});
