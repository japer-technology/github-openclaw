import { describe, expect, it } from "vitest";
import {
  buildParityReport,
  enforceSpecToImplementationTracking,
  getAddedSpecArtifacts,
  getScoreCounts,
  hasScoreboardUpdate,
  isSpecArtifact,
  parseCliOptions,
  parseDiffEntries,
  renderParityReportMarkdown,
  renderSummaryMarkdown,
  validateScoreboard,
  type DiffEntry,
  type Scoreboard,
} from "../scripts/check-implementation-scoreboard.js";

describe("isSpecArtifact", () => {
  it("accepts planning markdown specs", () => {
    expect(isSpecArtifact(".GITHUB-MODE/docs/planning/phase-5.md")).toBe(true);
    expect(isSpecArtifact(".GITHUB-MODE/docs/planning/mvvp.md")).toBe(true);
  });

  it("rejects non-spec files", () => {
    expect(isSpecArtifact(".GITHUB-MODE/docs/planning/README.md")).toBe(false);
    expect(isSpecArtifact(".GITHUB-MODE/docs/overview.md")).toBe(false);
    expect(isSpecArtifact(".GITHUB-MODE/runtime/implementation-scoreboard.json")).toBe(false);
  });
});

describe("diff parsing and spec tracking", () => {
  it("parses plain name-status output", () => {
    const entries = parseDiffEntries("A\t.GITHUB-MODE/docs/planning/phase-4.md\nM\tREADME.md");
    expect(entries).toEqual([
      { status: "A", path: ".GITHUB-MODE/docs/planning/phase-4.md" },
      { status: "M", path: "README.md" },
    ]);
  });

  it("finds added spec artifacts", () => {
    const entries: DiffEntry[] = [
      { status: "A", path: ".GITHUB-MODE/docs/planning/phase-4.md" },
      { status: "A", path: ".GITHUB-MODE/docs/planning/README.md" },
      { status: "M", path: ".GITHUB-MODE/runtime/implementation-scoreboard.json" },
    ];

    expect(getAddedSpecArtifacts(entries)).toEqual([".GITHUB-MODE/docs/planning/phase-4.md"]);
  });

  it("tracks scoreboard updates", () => {
    expect(
      hasScoreboardUpdate([
        { status: "M", path: ".GITHUB-MODE/runtime/implementation-scoreboard.json" },
      ]),
    ).toBe(true);

    expect(
      hasScoreboardUpdate([
        { status: "D", path: ".GITHUB-MODE/runtime/implementation-scoreboard.json" },
      ]),
    ).toBe(false);
  });

  it("fails when new spec artifacts are not paired with scoreboard changes", () => {
    expect(() =>
      enforceSpecToImplementationTracking([
        { status: "A", path: ".GITHUB-MODE/docs/planning/phase-6.md" },
      ]),
    ).toThrowError(/without updating implementation scoreboard/i);
  });

  it("passes when new spec artifacts include scoreboard changes", () => {
    expect(() =>
      enforceSpecToImplementationTracking([
        { status: "A", path: ".GITHUB-MODE/docs/planning/phase-6.md" },
        { status: "M", path: ".GITHUB-MODE/runtime/implementation-scoreboard.json" },
      ]),
    ).not.toThrow();
  });
});

describe("scoreboard validation and summary", () => {
  const validScoreboard: Scoreboard = {
    version: 1,
    capabilities: [
      { id: "a", description: "A", state: "operational" },
      { id: "b", description: "B", state: "scaffold" },
      { id: "c", description: "C", state: "spec-only" },
    ],
  };

  it("validates scoreboard entries", () => {
    expect(() => validateScoreboard(validScoreboard)).not.toThrow();
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      validateScoreboard({
        ...validScoreboard,
        capabilities: [
          { id: "same", description: "x", state: "operational" },
          { id: "same", description: "y", state: "scaffold" },
        ],
      }),
    ).toThrowError(/Duplicate capability id/i);
  });

  it("counts states and renders markdown summary", () => {
    const counts = getScoreCounts(validScoreboard);
    expect(counts).toEqual({
      operational: 1,
      scaffold: 1,
      "spec-only": 1,
    });

    const summary = renderSummaryMarkdown(validScoreboard);
    expect(summary).toContain("Operational: **1**");
    expect(summary).toContain("Implementation ratio (operational/total): **1/3**");
  });

  it("builds deterministic parity report data", () => {
    const report = buildParityReport({
      version: 2,
      capabilities: [
        { id: "z", description: "Last", state: "scaffold" },
        { id: "a", description: "First", state: "operational" },
      ],
    });

    expect(report.generatedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(report.capabilities.map((capability) => capability.id)).toEqual(["a", "z"]);
  });

  it("renders parity report markdown", () => {
    const report = renderParityReportMarkdown(validScoreboard);
    expect(report).toContain("# GitHub Mode Parity Report");
    expect(report).toContain("| a | operational | A |");
  });
});

describe("cli options", () => {
  it("parses report file and format arguments", () => {
    expect(
      parseCliOptions(["--report-file", "tmp/parity-report.json", "--report-format", "json"]),
    ).toEqual({
      summary: false,
      reportFile: "tmp/parity-report.json",
      reportFormat: "json",
    });
  });

  it("rejects invalid report format", () => {
    expect(() => parseCliOptions(["--report-format", "yaml"])).toThrowError(/--report-format/);
  });
});
