import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DOCS_ROOT = path.join(process.cwd(), ".GITHUB-MODE", "docs");
const OVERVIEW_DOC = path.join(DOCS_ROOT, "overview.md");
const PLANNING_DIR = path.join(DOCS_ROOT, "planning");

const SRC_PATH_PATTERN = /`?src\/(?:\*\*|[^\s`)]*)/i;
const REUSE_CLAIM_PATTERN =
  /(reuse|reuses|reused|shared runtime|shared runtime spine|core modules|reuse for core)/i;
const NEGATION_PATTERN =
  /(must not|do not|don't|never|prohibited|not allowed|without direct import|no direct import)/i;

export type DocViolation = {
  file: string;
  line: number;
  content: string;
};

export function listTargetDocs(): string[] {
  const planningDocs = readdirSync(PLANNING_DIR)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(PLANNING_DIR, entry));

  return [OVERVIEW_DOC, ...planningDocs];
}

export function findDocViolations(source: string, filePath: string): DocViolation[] {
  const violations: DocViolation[] = [];
  const lines = source.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (!SRC_PATH_PATTERN.test(line)) {
      continue;
    }
    if (!REUSE_CLAIM_PATTERN.test(line)) {
      continue;
    }
    if (NEGATION_PATTERN.test(line)) {
      continue;
    }

    violations.push({
      file: path.relative(process.cwd(), filePath),
      line: index + 1,
      content: line.trim(),
    });
  }

  return violations;
}

function run(): number {
  const violations = listTargetDocs().flatMap((filePath) => {
    const source = readFileSync(filePath, "utf8");
    return findDocViolations(source, filePath);
  });

  if (violations.length === 0) {
    console.log("Runtime boundary docs consistency check passed.");
    return 0;
  }

  console.error("Found direct src/** reuse claims that conflict with ADR 0001:");
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.content}`);
  }
  console.error(
    "Use interface-level language (extracted shared libraries and adapter boundaries) instead of direct src/** reuse claims.",
  );

  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = run();
}
