import process from "node:process";

/**
 * Manage-reactions: add and remove GitHub reactions on issues/comments.
 *
 * Directly inspired by gitclaw's lifecycle pattern (§4 preinstall + §5.12 cleanup):
 * - preinstall.ts adds an 👀 reaction to signal "working"
 * - main.ts removes the reaction in a finally block
 *
 * GitHub Mode adapts this as a reusable module that workflows call via
 * shell steps, using the `gh` CLI for API calls. Errors are non-fatal
 * (try/catch) so cleanup failures don't crash the pipeline — matching
 * gitclaw's resilience pattern (§8).
 */

export type ReactionTarget = "issue" | "comment";

export type ReactionState = {
  reactionId: number | null;
  reactionTarget: ReactionTarget;
  commentId: number | null;
  issueNumber: number;
  repo: string;
};

export type ReactionAction = "add" | "remove";

/**
 * Build the `gh api` command arguments for adding a reaction.
 *
 * Follows gitclaw's pattern of placing the reaction on the specific comment
 * for comment events, or on the issue itself for issue open events.
 */
export function buildAddReactionArgs(
  repo: string,
  issueNumber: number,
  target: ReactionTarget,
  commentId: number | null,
  reaction: string,
): string[] {
  if (target === "comment" && commentId !== null) {
    return [
      "api",
      "--method",
      "POST",
      `/repos/${repo}/issues/comments/${commentId}/reactions`,
      "-f",
      `content=${reaction}`,
    ];
  }

  return [
    "api",
    "--method",
    "POST",
    `/repos/${repo}/issues/${issueNumber}/reactions`,
    "-f",
    `content=${reaction}`,
  ];
}

/**
 * Build the `gh api` command arguments for removing a reaction.
 */
export function buildRemoveReactionArgs(
  repo: string,
  issueNumber: number,
  target: ReactionTarget,
  commentId: number | null,
  reactionId: number,
): string[] {
  if (target === "comment" && commentId !== null) {
    return [
      "api",
      "--method",
      "DELETE",
      `/repos/${repo}/issues/comments/${commentId}/reactions/${reactionId}`,
    ];
  }

  return [
    "api",
    "--method",
    "DELETE",
    `/repos/${repo}/issues/${issueNumber}/reactions/${reactionId}`,
  ];
}

/**
 * Resolve the reaction target from a GitHub event payload.
 *
 * Mirrors gitclaw's preinstall.ts logic (§4): determine issue number and
 * whether the event is comment-driven from the event payload.
 */
export function resolveReactionTarget(
  eventName: string,
  eventPayload: Record<string, unknown>,
): { issueNumber: number; target: ReactionTarget; commentId: number | null } | null {
  const issue = eventPayload.issue as Record<string, unknown> | undefined;
  if (!issue || typeof issue.number !== "number") {
    return null;
  }

  const issueNumber = issue.number;

  if (eventName === "issue_comment") {
    const comment = eventPayload.comment as Record<string, unknown> | undefined;
    if (comment && typeof comment.id === "number") {
      return { issueNumber, target: "comment", commentId: comment.id };
    }
  }

  return { issueNumber, target: "issue", commentId: null };
}

/**
 * Serialize reaction state to a temp file path for cross-step handoff.
 *
 * Follows gitclaw's pattern of writing `/tmp/reaction-state.json` (§4)
 * for consumption by the main orchestrator's finally block.
 */
export function serializeReactionState(state: ReactionState): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Deserialize reaction state from a JSON string.
 */
export function deserializeReactionState(json: string): ReactionState | null {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (
      typeof parsed.issueNumber !== "number" ||
      typeof parsed.repo !== "string" ||
      (parsed.reactionTarget !== "issue" && parsed.reactionTarget !== "comment")
    ) {
      return null;
    }

    return {
      reactionId: typeof parsed.reactionId === "number" ? parsed.reactionId : null,
      reactionTarget: parsed.reactionTarget as ReactionTarget,
      commentId: typeof parsed.commentId === "number" ? parsed.commentId : null,
      issueNumber: parsed.issueNumber,
      repo: parsed.repo,
    };
  } catch {
    return null;
  }
}

// CLI entrypoint — prints usage guidance
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("manage-reactions.ts")
) {
  console.log("manage-reactions: reaction lifecycle helpers for GitHub Mode issue agent");
  console.log("This module is imported by workflow steps; not invoked directly.");
  console.log("");
  console.log("Exports: buildAddReactionArgs, buildRemoveReactionArgs,");
  console.log("         resolveReactionTarget, serializeReactionState, deserializeReactionState");
}
