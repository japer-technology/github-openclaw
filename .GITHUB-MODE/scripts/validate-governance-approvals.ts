import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type Signoff = {
  role: string;
  github: string;
  approved_at: string;
};

type ValidationIssue = {
  file: string;
  message: string;
};

const REPO_ROOT = process.cwd();
const UNDER_DEVELOPMENT_PATH = path.join(REPO_ROOT, ".GITHUB-MODE", "UNDER-DEVELOPMENT.md");

const REQUIRED_ROLES: Record<string, string[]> = {
  ".GITHUB-MODE/docs/adr/0001-runtime-boundary-and-ownership.md": ["runtime", "github-mode"],
  ".GITHUB-MODE/docs/adr/0002-installed-runtime-non-regression-guardrails.md": [
    "runtime",
    "release",
  ],
  ".GITHUB-MODE/docs/security/0001-github-trigger-trust-matrix.md": [
    "security",
    "github-mode",
    "runtime",
  ],
  ".GITHUB-MODE/docs/security/0002-skills-quarantine-pipeline.md": ["security", "runtime"],
  ".GITHUB-MODE/docs/security/0003-secrets-inventory-and-rotation.md": ["security", "runtime"],
  ".GITHUB-MODE/docs/security/0004-oidc-trust-relationships-and-fallback.md": [
    "security",
    "release",
  ],
};

const REQUIRED_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_HANDLE_PATTERN = /^@[A-Za-z0-9-]+$/;

export function extractSignoffBlock(markdown: string): string | null {
  const match = markdown.match(/```governance-signoff\n([\s\S]*?)\n```/m);
  return match?.[1]?.trim() ?? null;
}

export function parseSignoffs(markdown: string): Signoff[] {
  const block = extractSignoffBlock(markdown);
  if (!block) {
    throw new Error("Missing ```governance-signoff``` JSON block.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    throw new Error("Governance signoff block must contain valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Governance signoff block must be a JSON array.");
  }

  const signoffs: Signoff[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Each governance signoff entry must be an object.");
    }

    const role = Reflect.get(entry, "role");
    const github = Reflect.get(entry, "github");
    const approvedAt = Reflect.get(entry, "approved_at");

    if (typeof role !== "string" || role.length === 0) {
      throw new Error("Each governance signoff entry needs a non-empty string role.");
    }
    if (typeof github !== "string" || !REQUIRED_HANDLE_PATTERN.test(github)) {
      throw new Error(`Role ${role} must use a valid github handle like @example.`);
    }
    if (typeof approvedAt !== "string" || !REQUIRED_DATE_PATTERN.test(approvedAt)) {
      throw new Error(`Role ${role} must set approved_at as YYYY-MM-DD.`);
    }

    signoffs.push({ role, github, approved_at: approvedAt });
  }

  return signoffs;
}

export function validateApprovalFile(
  filePath: string,
  markdown: string,
  options: { allowSelfApproval: boolean },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const relativePath = path.relative(REPO_ROOT, filePath);
  const lookupKey =
    REQUIRED_ROLES[relativePath] !== undefined
      ? relativePath
      : (Object.keys(REQUIRED_ROLES).find((key) => filePath.endsWith(key)) ?? relativePath);
  const requiredRoles = REQUIRED_ROLES[lookupKey] ?? [];

  let signoffs: Signoff[];
  try {
    signoffs = parseSignoffs(markdown);
  } catch (error) {
    issues.push({
      file: relativePath,
      message: error instanceof Error ? error.message : "Unknown governance parsing error.",
    });
    return issues;
  }

  for (const role of requiredRoles) {
    const matches = signoffs.filter((entry) => entry.role === role);
    if (matches.length === 0) {
      issues.push({
        file: relativePath,
        message: `Missing required role signoff: ${role}.`,
      });
      continue;
    }

    if (matches.length > 1) {
      issues.push({
        file: relativePath,
        message: `Role ${role} appears multiple times; include it exactly once.`,
      });
    }
  }

  if (!options.allowSelfApproval && requiredRoles.length > 0) {
    const identities = new Set<string>();
    for (const role of requiredRoles) {
      const matching = signoffs.find((entry) => entry.role === role);
      if (!matching) {
        continue;
      }
      identities.add(matching.github.toLowerCase());
    }

    if (identities.size !== requiredRoles.length) {
      issues.push({
        file: relativePath,
        message:
          "Self-approval pattern detected across required roles; each required role must map to a distinct github handle.",
      });
    }
  }

  return issues;
}

export function runValidation(): number {
  const allowSelfApproval = existsSync(UNDER_DEVELOPMENT_PATH);
  const issues: ValidationIssue[] = [];

  for (const relativePath of Object.keys(REQUIRED_ROLES)) {
    const fullPath = path.join(REPO_ROOT, relativePath);
    const markdown = readFileSync(fullPath, "utf8");
    issues.push(...validateApprovalFile(fullPath, markdown, { allowSelfApproval }));
  }

  if (issues.length === 0) {
    if (allowSelfApproval) {
      console.log(
        "Governance approvals validation passed (UNDER-DEVELOPMENT override enabled for distinct-identity checks).",
      );
    } else {
      console.log("Governance approvals validation passed.");
    }
    return 0;
  }

  console.error("Governance approvals validation failed:");
  for (const issue of issues) {
    console.error(`- ${issue.file}: ${issue.message}`);
  }

  if (allowSelfApproval) {
    console.error(
      "Note: UNDER-DEVELOPMENT override is active; failures above are unrelated to distinct-identity enforcement.",
    );
  }

  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runValidation();
}
