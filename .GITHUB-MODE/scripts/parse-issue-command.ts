import process from "node:process";

/**
 * Parse-issue-command: extract a GitHub Mode command from an issue comment body.
 *
 * Inspired by gitclaw's prompt selection logic (§5.6 of the design doc):
 * - For `issue_comment` events: the prompt is the comment body.
 * - For `issues` opened events: the prompt is `"<title>\n\n<body>"`.
 *
 * GitHub Mode adapts this with a structured command prefix (`/openclaw <command>`)
 * so that only intentional commands trigger agent execution, preserving the
 * authorization-first principle from gitclaw while fitting GitHub Mode's
 * trust-aware architecture.
 */

const COMMAND_PREFIX = "/openclaw";
const ALLOWED_COMMANDS = ["explain", "refactor", "test", "diagram"] as const;
type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

export type ParsedIssueCommand = {
  valid: boolean;
  command?: AllowedCommand;
  target?: string;
  rawBody: string;
  reason: string;
};

/**
 * Parse a command from a GitHub issue comment body.
 *
 * Expected format: `/openclaw <command> [target]`
 *
 * Returns a structured result indicating whether a valid command was found.
 */
export function parseIssueCommand(commentBody: string): ParsedIssueCommand {
  const trimmed = commentBody.trim();

  if (!trimmed) {
    return { valid: false, rawBody: trimmed, reason: "empty comment body" };
  }

  if (!trimmed.startsWith(COMMAND_PREFIX)) {
    return {
      valid: false,
      rawBody: trimmed,
      reason: `comment does not start with ${COMMAND_PREFIX}`,
    };
  }

  const afterPrefix = trimmed.slice(COMMAND_PREFIX.length).trim();
  if (!afterPrefix) {
    return { valid: false, rawBody: trimmed, reason: "no command specified after prefix" };
  }

  // Split into command and optional target (rest of line)
  const firstLineEnd = afterPrefix.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? afterPrefix : afterPrefix.slice(0, firstLineEnd);
  const parts = firstLine.trim().split(/\s+/);
  const candidateCommand = parts[0]?.toLowerCase();

  if (!candidateCommand || !ALLOWED_COMMANDS.includes(candidateCommand as AllowedCommand)) {
    return {
      valid: false,
      rawBody: trimmed,
      reason: `unknown command "${candidateCommand ?? ""}", allowed: ${ALLOWED_COMMANDS.join(", ")}`,
    };
  }

  const target = parts.slice(1).join(" ") || undefined;

  return {
    valid: true,
    command: candidateCommand as AllowedCommand,
    target,
    rawBody: trimmed,
    reason: "valid command parsed",
  };
}

/**
 * Build the agent prompt from a parsed issue command and issue context.
 *
 * Follows gitclaw's pattern (§5.6): for issue_comment events the prompt
 * is the comment content; for issue open events the prompt is title + body.
 * GitHub Mode adds structured command context.
 */
export function buildAgentPrompt(parsed: ParsedIssueCommand, issueTitle?: string): string {
  if (!parsed.valid || !parsed.command) {
    return "";
  }

  const parts: string[] = [parsed.command];
  if (parsed.target) {
    parts.push(parsed.target);
  }
  if (issueTitle) {
    parts.push(`\n\nIssue context: ${issueTitle}`);
  }

  return parts.join(" ");
}

// CLI entrypoint
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("parse-issue-command.ts")
) {
  const body = process.env.COMMENT_BODY ?? "";
  const result = parseIssueCommand(body);
  console.log(JSON.stringify(result, null, 2));

  if (!result.valid) {
    process.exit(1);
  }
}
