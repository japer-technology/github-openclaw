import { describe, expect, it } from "vitest";
import { buildAgentPrompt, parseIssueCommand } from "../scripts/parse-issue-command.js";

describe("parseIssueCommand", () => {
  it("parses a valid /openclaw explain command", () => {
    const result = parseIssueCommand("/openclaw explain src/agents/tools.ts");
    expect(result.valid).toBe(true);
    expect(result.command).toBe("explain");
    expect(result.target).toBe("src/agents/tools.ts");
    expect(result.reason).toBe("valid command parsed");
  });

  it("parses a valid /openclaw refactor command without target", () => {
    const result = parseIssueCommand("/openclaw refactor");
    expect(result.valid).toBe(true);
    expect(result.command).toBe("refactor");
    expect(result.target).toBeUndefined();
  });

  it("parses a valid /openclaw test command", () => {
    const result = parseIssueCommand("/openclaw test src/routing/");
    expect(result.valid).toBe(true);
    expect(result.command).toBe("test");
    expect(result.target).toBe("src/routing/");
  });

  it("parses a valid /openclaw diagram command", () => {
    const result = parseIssueCommand("/openclaw diagram");
    expect(result.valid).toBe(true);
    expect(result.command).toBe("diagram");
  });

  it("is case-insensitive for command names", () => {
    const result = parseIssueCommand("/openclaw EXPLAIN src/foo.ts");
    expect(result.valid).toBe(true);
    expect(result.command).toBe("explain");
  });

  it("rejects empty comment body", () => {
    const result = parseIssueCommand("");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("empty comment body");
  });

  it("rejects comment without /openclaw prefix", () => {
    const result = parseIssueCommand("This is a regular comment");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("does not start with /openclaw");
  });

  it("rejects /openclaw with no command", () => {
    const result = parseIssueCommand("/openclaw");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("no command specified after prefix");
  });

  it("rejects /openclaw with only whitespace after prefix", () => {
    const result = parseIssueCommand("/openclaw   ");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("no command specified after prefix");
  });

  it("rejects unknown command", () => {
    const result = parseIssueCommand("/openclaw deploy production");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('unknown command "deploy"');
    expect(result.reason).toContain("allowed:");
  });

  it("handles multiline comment by parsing only first line after prefix", () => {
    const result = parseIssueCommand(
      "/openclaw explain src/foo.ts\n\nSome additional context here",
    );
    expect(result.valid).toBe(true);
    expect(result.command).toBe("explain");
    expect(result.target).toBe("src/foo.ts");
  });

  it("preserves rawBody in result", () => {
    const body = "/openclaw explain";
    const result = parseIssueCommand(body);
    expect(result.rawBody).toBe(body);
  });

  it("handles target with multiple path segments", () => {
    const result = parseIssueCommand("/openclaw explain src/agents/tools src/routing/index.ts");
    expect(result.valid).toBe(true);
    expect(result.command).toBe("explain");
    expect(result.target).toBe("src/agents/tools src/routing/index.ts");
  });

  it("trims leading/trailing whitespace from comment body", () => {
    const result = parseIssueCommand("  /openclaw test src/foo.ts  ");
    expect(result.valid).toBe(true);
    expect(result.command).toBe("test");
  });
});

describe("buildAgentPrompt", () => {
  it("builds prompt with command only", () => {
    const parsed = parseIssueCommand("/openclaw explain");
    const prompt = buildAgentPrompt(parsed);
    expect(prompt).toBe("explain");
  });

  it("builds prompt with command and target", () => {
    const parsed = parseIssueCommand("/openclaw explain src/foo.ts");
    const prompt = buildAgentPrompt(parsed);
    expect(prompt).toBe("explain src/foo.ts");
  });

  it("includes issue title when provided", () => {
    const parsed = parseIssueCommand("/openclaw explain src/foo.ts");
    const prompt = buildAgentPrompt(parsed, "Improve agent routing");
    expect(prompt).toContain("explain src/foo.ts");
    expect(prompt).toContain("Issue context: Improve agent routing");
  });

  it("returns empty string for invalid command", () => {
    const parsed = parseIssueCommand("not a command");
    const prompt = buildAgentPrompt(parsed);
    expect(prompt).toBe("");
  });
});
