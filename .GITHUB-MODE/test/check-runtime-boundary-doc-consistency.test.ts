import { describe, expect, it } from "vitest";
import {
  findDocViolations,
  listTargetDocs,
} from "../scripts/check-runtime-boundary-doc-consistency.js";

describe("listTargetDocs", () => {
  it("includes overview and planning markdown docs", () => {
    const docs = listTargetDocs();
    expect(docs.some((entry) => entry.endsWith(".GITHUB-MODE/docs/overview.md"))).toBe(true);
    expect(docs.some((entry) => entry.includes(".GITHUB-MODE/docs/planning/"))).toBe(true);
  });
});

describe("findDocViolations", () => {
  it("flags direct src reuse claims", () => {
    const source = "GitHub mode reuses core modules from src/agents/tools/*.";
    const violations = findDocViolations(source, "/tmp/overview.md");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.line).toBe(1);
  });

  it("allows src references when describing prohibitions", () => {
    const source = "GitHub mode workflows must not import src/** internals.";
    expect(findDocViolations(source, "/tmp/overview.md")).toEqual([]);
  });

  it("allows reuse language when no src internals are referenced", () => {
    const source = "Reuse extracted shared libraries through adapter boundaries.";
    expect(findDocViolations(source, "/tmp/overview.md")).toEqual([]);
  });
});
