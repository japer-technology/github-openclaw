import { describe, expect, it } from "vitest";
import {
  extractSignoffBlock,
  parseSignoffs,
  validateApprovalFile,
} from "../scripts/validate-governance-approvals.js";

describe("extractSignoffBlock", () => {
  it("returns null when block is missing", () => {
    expect(extractSignoffBlock("# no signoff")).toBeNull();
  });

  it("extracts the raw JSON payload", () => {
    const markdown = `\n\`\`\`governance-signoff\n[{"role":"runtime","github":"@runtime","approved_at":"2026-02-18"}]\n\`\`\``;
    expect(extractSignoffBlock(markdown)).toContain('"role":"runtime"');
  });
});

describe("parseSignoffs", () => {
  it("parses valid entries", () => {
    const markdown = `\n\`\`\`governance-signoff\n[\n  {"role":"runtime","github":"@runtime","approved_at":"2026-02-18"}\n]\n\`\`\``;
    expect(parseSignoffs(markdown)).toEqual([
      { role: "runtime", github: "@runtime", approved_at: "2026-02-18" },
    ]);
  });

  it("rejects malformed github handles", () => {
    const markdown = `\n\`\`\`governance-signoff\n[{"role":"runtime","github":"runtime","approved_at":"2026-02-18"}]\n\`\`\``;
    expect(() => parseSignoffs(markdown)).toThrow(/valid github handle/);
  });
});

describe("validateApprovalFile", () => {
  const filePath =
    "/workspace/openclaw/.GITHUB-MODE/docs/adr/0001-runtime-boundary-and-ownership.md";

  it("flags self-approval across required roles", () => {
    const markdown = `\n\`\`\`governance-signoff\n[\n  {"role":"runtime","github":"@same","approved_at":"2026-02-18"},\n  {"role":"github-mode","github":"@same","approved_at":"2026-02-18"}\n]\n\`\`\``;

    const issues = validateApprovalFile(filePath, markdown, { allowSelfApproval: false });
    expect(issues.some((issue) => issue.message.includes("Self-approval pattern detected"))).toBe(
      true,
    );
  });

  it("allows duplicate identities when under-development override is enabled", () => {
    const markdown = `\n\`\`\`governance-signoff\n[\n  {"role":"runtime","github":"@same","approved_at":"2026-02-18"},\n  {"role":"github-mode","github":"@same","approved_at":"2026-02-18"}\n]\n\`\`\``;

    expect(validateApprovalFile(filePath, markdown, { allowSelfApproval: true })).toEqual([]);
  });
});
