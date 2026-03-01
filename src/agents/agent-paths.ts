import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { DEFAULT_AGENT_ID } from "../routing/session-key.js";
import { resolveUserPath } from "../utils.js";

export function resolveOpenClawAgentDir(): string {
  const override =
    process.env.OPENCLAW_AGENT_DIR?.trim() || process.env.PI_CODING_AGENT_DIR?.trim();
  if (override) {
    return resolveUserPath(override);
  }
  const defaultAgentDir = path.join(resolveStateDir(), "agents", DEFAULT_AGENT_ID, "agent");
  return resolveUserPath(defaultAgentDir);
}

export function ensureOpenClawAgentEnv(): string {
  const dir = resolveOpenClawAgentDir();
  // Only cache the resolved dir in env when OPENCLAW_STATE_DIR is already set,
  // or when no explicit state-dir override exists (safe default).  This prevents
  // caching a wrong path if called before the orchestrator sets OPENCLAW_STATE_DIR.
  if (
    !process.env.OPENCLAW_AGENT_DIR &&
    (process.env.OPENCLAW_STATE_DIR || !process.env.OPENCLAW_AGENT_DIR)
  ) {
    process.env.OPENCLAW_AGENT_DIR = dir;
  }
  if (!process.env.PI_CODING_AGENT_DIR) {
    process.env.PI_CODING_AGENT_DIR = dir;
  }
  return dir;
}
