import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lintWorkflowSource } from "../scripts/github-mode-security-lint.js";

const ROOT = process.cwd();
const FIXTURE_DIR = path.join(ROOT, ".GITHUB-MODE", "test", "fixtures", "security-lint");

function runFixture(fixtureName: string): string[] {
  const source = readFileSync(path.join(FIXTURE_DIR, fixtureName), "utf8");
  return lintWorkflowSource(`fixtures/${fixtureName}`, source);
}

describe("github-mode-security-lint", () => {
  it("allows pull_request workflows when untrusted fork PR path receives no secrets", () => {
    const errors = runFixture("untrusted-fork-safe.yml");
    expect(errors).toEqual([]);
  });

  it("flags secret access when untrusted fork PR path is not guarded", () => {
    const errors = runFixture("untrusted-fork-exposed-secrets.yml");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("references secrets in pull_request context without a fork guard");
  });

  it("flags privileged jobs that are not blocked for untrusted contexts", () => {
    const errors = runFixture("untrusted-fork-privileged-unguarded.yml");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("is privileged in pull_request context");
  });

  it("returns actionable policy failure messages", () => {
    const errors = runFixture("policy-failures-actionable.yml");
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("uses non-SHA ref"),
        expect.stringContaining("top-level permissions.* is write-all"),
      ]),
    );
    for (const error of errors) {
      expect(error).toContain("fixtures/policy-failures-actionable.yml");
    }
  });

  it("flags actions/ namespace actions using mutable refs", () => {
    const errors = runFixture("actions-namespace-unpinned.yml");
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const pinningErrors = errors.filter((e) => e.includes("uses non-SHA ref"));
    expect(pinningErrors).toHaveLength(2);
    expect(pinningErrors[0]).toContain("actions/checkout@v4");
    expect(pinningErrors[1]).toContain("actions/upload-artifact@v4");
  });

  it("flags workflows with no explicit permissions declaration", () => {
    const errors = runFixture("missing-explicit-permissions.yml");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]).toContain("missing explicit permissions");
  });

  it("allows local action refs and docker refs without SHA pinning", () => {
    const errors = runFixture("local-action-refs-safe.yml");
    expect(errors).toEqual([]);
  });

  it("allows write permissions in pull_request context when fork guard is present", () => {
    const errors = runFixture("write-perms-with-fork-guard.yml");
    expect(errors).toEqual([]);
  });
});
