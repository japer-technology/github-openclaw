import { describe, expect, it } from "vitest";
import {
  buildAddReactionArgs,
  buildRemoveReactionArgs,
  deserializeReactionState,
  resolveReactionTarget,
  serializeReactionState,
  type ReactionState,
} from "../scripts/manage-reactions.js";

describe("buildAddReactionArgs", () => {
  it("builds args for adding reaction to a comment", () => {
    const args = buildAddReactionArgs("owner/repo", 42, "comment", 12345, "eyes");
    expect(args).toEqual([
      "api",
      "--method",
      "POST",
      "/repos/owner/repo/issues/comments/12345/reactions",
      "-f",
      "content=eyes",
    ]);
  });

  it("builds args for adding reaction to an issue", () => {
    const args = buildAddReactionArgs("owner/repo", 42, "issue", null, "eyes");
    expect(args).toEqual([
      "api",
      "--method",
      "POST",
      "/repos/owner/repo/issues/42/reactions",
      "-f",
      "content=eyes",
    ]);
  });

  it("falls back to issue endpoint when comment target has null commentId", () => {
    const args = buildAddReactionArgs("owner/repo", 42, "comment", null, "rocket");
    expect(args[3]).toBe("/repos/owner/repo/issues/42/reactions");
  });
});

describe("buildRemoveReactionArgs", () => {
  it("builds args for removing reaction from a comment", () => {
    const args = buildRemoveReactionArgs("owner/repo", 42, "comment", 12345, 999);
    expect(args).toEqual([
      "api",
      "--method",
      "DELETE",
      "/repos/owner/repo/issues/comments/12345/reactions/999",
    ]);
  });

  it("builds args for removing reaction from an issue", () => {
    const args = buildRemoveReactionArgs("owner/repo", 42, "issue", null, 999);
    expect(args).toEqual([
      "api",
      "--method",
      "DELETE",
      "/repos/owner/repo/issues/42/reactions/999",
    ]);
  });
});

describe("resolveReactionTarget", () => {
  it("resolves issue_comment event to comment target", () => {
    const result = resolveReactionTarget("issue_comment", {
      issue: { number: 42 },
      comment: { id: 12345 },
    });
    expect(result).toEqual({
      issueNumber: 42,
      target: "comment",
      commentId: 12345,
    });
  });

  it("resolves issues event to issue target", () => {
    const result = resolveReactionTarget("issues", {
      issue: { number: 42 },
    });
    expect(result).toEqual({
      issueNumber: 42,
      target: "issue",
      commentId: null,
    });
  });

  it("returns null when issue is missing from payload", () => {
    const result = resolveReactionTarget("issue_comment", {});
    expect(result).toBeNull();
  });

  it("returns null when issue.number is not a number", () => {
    const result = resolveReactionTarget("issue_comment", {
      issue: { number: "not-a-number" },
    });
    expect(result).toBeNull();
  });

  it("falls back to issue target when comment is missing from issue_comment event", () => {
    const result = resolveReactionTarget("issue_comment", {
      issue: { number: 42 },
    });
    expect(result).toEqual({
      issueNumber: 42,
      target: "issue",
      commentId: null,
    });
  });
});

describe("serializeReactionState / deserializeReactionState", () => {
  const validState: ReactionState = {
    reactionId: 999,
    reactionTarget: "comment",
    commentId: 12345,
    issueNumber: 42,
    repo: "owner/repo",
  };

  it("round-trips a valid reaction state", () => {
    const json = serializeReactionState(validState);
    const deserialized = deserializeReactionState(json);
    expect(deserialized).toEqual(validState);
  });

  it("handles null reactionId", () => {
    const state: ReactionState = { ...validState, reactionId: null };
    const json = serializeReactionState(state);
    const deserialized = deserializeReactionState(json);
    expect(deserialized?.reactionId).toBeNull();
  });

  it("handles null commentId for issue target", () => {
    const state: ReactionState = {
      reactionId: 999,
      reactionTarget: "issue",
      commentId: null,
      issueNumber: 42,
      repo: "owner/repo",
    };
    const json = serializeReactionState(state);
    const deserialized = deserializeReactionState(json);
    expect(deserialized).toEqual(state);
  });

  it("returns null for invalid JSON", () => {
    const result = deserializeReactionState("not valid json");
    expect(result).toBeNull();
  });

  it("returns null for missing required fields", () => {
    const result = deserializeReactionState(JSON.stringify({ reactionId: 1 }));
    expect(result).toBeNull();
  });

  it("returns null for invalid reactionTarget value", () => {
    const result = deserializeReactionState(
      JSON.stringify({ ...validState, reactionTarget: "unknown" }),
    );
    expect(result).toBeNull();
  });
});
