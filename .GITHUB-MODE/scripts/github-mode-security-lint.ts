import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "yaml";

type JsonObject = Record<string, unknown>;

type WorkflowDocument = {
  on?: unknown;
  permissions?: unknown;
  jobs?: Record<string, JobDocument>;
};

type JobDocument = {
  if?: unknown;
  permissions?: unknown;
  env?: unknown;
  steps?: StepDocument[];
};

type StepDocument = {
  if?: unknown;
  run?: unknown;
  uses?: unknown;
  env?: unknown;
  with?: unknown;
};

const WORKFLOW_PREFIX = "github-mode-";
const WORKFLOW_SUFFIX = ".yml";
const WORKFLOWS_DIR = path.join(process.cwd(), ".github", "workflows");
const SHA_PIN_PATTERN = /^[a-f0-9]{40}$/i;
const SECRET_REF_PATTERN = /\$\{\{\s*secrets\.([A-Za-z0-9_-]+)\s*\}\}/g;

function listGithubModeWorkflows(): string[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((entry) => entry.startsWith(WORKFLOW_PREFIX) && entry.endsWith(WORKFLOW_SUFFIX))
    .toSorted();
}

function readWorkflow(relativePath: string): WorkflowDocument {
  const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
  const parsed = parse(source);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${relativePath}: workflow is not a valid YAML object`);
  }
  return parsed as WorkflowDocument;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyForSearch(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stringifyForSearch(entry)).join(" ");
  }
  if (isPlainObject(value)) {
    return Object.values(value)
      .map((entry) => stringifyForSearch(entry))
      .join(" ");
  }
  return "";
}

function hasPullRequestTrigger(on: unknown): boolean {
  if (typeof on === "string") {
    return on === "pull_request";
  }
  if (Array.isArray(on)) {
    return on.includes("pull_request");
  }
  if (isPlainObject(on)) {
    return Object.hasOwn(on, "pull_request");
  }
  return false;
}

function getPermissionEntries(permissions: unknown): Array<[string, string]> {
  if (permissions === "read-all" || permissions === "write-all") {
    return [["*", String(permissions)]];
  }
  if (!isPlainObject(permissions)) {
    return [];
  }
  return Object.entries(permissions)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => [key, value as string]);
}

function isWritePermission(permissions: unknown): boolean {
  return getPermissionEntries(permissions).some(
    ([, value]) => value === "write" || value === "write-all",
  );
}

function hasExplicitPermissions(workflow: WorkflowDocument): boolean {
  if (workflow.permissions !== undefined) {
    return true;
  }
  const jobs = workflow.jobs ?? {};
  const entries = Object.values(jobs);
  return entries.length > 0 && entries.every((job) => job.permissions !== undefined);
}

function hasForkGuard(condition: unknown): boolean {
  if (typeof condition !== "string") {
    return false;
  }
  const normalized = condition.replace(/\s+/g, " ");
  const checksFork = normalized.includes("github.event.pull_request.head.repo.fork");
  const blocksFork =
    normalized.includes("!github.event.pull_request.head.repo.fork") ||
    normalized.includes("github.event.pull_request.head.repo.fork == false") ||
    normalized.includes("github.event.pull_request.head.repo.fork != true") ||
    normalized.includes("github.event_name != 'pull_request'") ||
    normalized.includes('github.event_name != "pull_request"');
  return checksFork && blocksFork;
}

function usesSecretReference(value: unknown): boolean {
  const content = stringifyForSearch(value);
  if (!content) {
    return false;
  }

  const matches = content.matchAll(SECRET_REF_PATTERN);
  for (const match of matches) {
    const secretName = match[1];
    if (secretName !== "GITHUB_TOKEN") {
      return true;
    }
  }

  return false;
}

function isThirdPartyActionRef(uses: string): boolean {
  if (uses.startsWith("./") || uses.startsWith("docker://")) {
    return false;
  }
  return true;
}

function validateActionPinning(relativePath: string, workflow: WorkflowDocument): string[] {
  const errors: string[] = [];
  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      if (typeof step.uses !== "string" || !isThirdPartyActionRef(step.uses)) {
        continue;
      }
      const atIndex = step.uses.lastIndexOf("@");
      if (atIndex <= 0) {
        errors.push(
          `${relativePath}: jobs.${jobName}.steps[${stepIndex}] action \`${step.uses}\` must pin to a full commit SHA (40 hex chars)`,
        );
        continue;
      }
      const ref = step.uses.slice(atIndex + 1);
      if (!SHA_PIN_PATTERN.test(ref)) {
        errors.push(
          `${relativePath}: jobs.${jobName}.steps[${stepIndex}] action \`${step.uses}\` uses non-SHA ref \`${ref}\`; pin to an immutable commit SHA`,
        );
      }
    }
  }
  return errors;
}

function validatePermissionScopes(relativePath: string, workflow: WorkflowDocument): string[] {
  const errors: string[] = [];
  if (!hasExplicitPermissions(workflow)) {
    errors.push(
      `${relativePath}: missing explicit permissions (set top-level permissions or per-job permissions)`,
    );
  }

  for (const [name, value] of getPermissionEntries(workflow.permissions)) {
    if (value === "write-all") {
      errors.push(
        `${relativePath}: top-level permissions.${name} is write-all; scope it to minimal read/write entries`,
      );
    }
  }

  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    for (const [name, value] of getPermissionEntries(job.permissions)) {
      if (value === "write-all") {
        errors.push(
          `${relativePath}: jobs.${jobName}.permissions.${name} is write-all; scope it to minimal permissions`,
        );
      }
    }
  }

  return errors;
}

function validateUntrustedContextGuards(
  relativePath: string,
  workflow: WorkflowDocument,
): string[] {
  if (!hasPullRequestTrigger(workflow.on)) {
    return [];
  }

  const errors: string[] = [];
  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    const jobIsGuarded = hasForkGuard(job.if);
    const jobUsesSecrets = usesSecretReference(job.env);
    const jobIsPrivileged = jobUsesSecrets || isWritePermission(job.permissions);

    if (jobIsPrivileged && !jobIsGuarded) {
      errors.push(
        `${relativePath}: jobs.${jobName} is privileged in pull_request context (write permissions or secrets) and must include an if guard that blocks fork PRs`,
      );
    }

    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      const stepUsesSecrets =
        usesSecretReference(step.env) ||
        usesSecretReference(step.with) ||
        usesSecretReference(step.run);
      if (!stepUsesSecrets) {
        continue;
      }

      const stepIsGuarded = jobIsGuarded || hasForkGuard(step.if);
      if (!stepIsGuarded) {
        errors.push(
          `${relativePath}: jobs.${jobName}.steps[${stepIndex}] references secrets in pull_request context without a fork guard; add \`if: github.event_name != 'pull_request' || !github.event.pull_request.head.repo.fork\``,
        );
      }
    }
  }

  return errors;
}

export function lintWorkflow(relativePath: string, workflow: WorkflowDocument): string[] {
  return [
    ...validateActionPinning(relativePath, workflow),
    ...validatePermissionScopes(relativePath, workflow),
    ...validateUntrustedContextGuards(relativePath, workflow),
  ];
}

export function lintWorkflowSource(relativePath: string, source: string): string[] {
  const parsed = parse(source);
  if (!parsed || typeof parsed !== "object") {
    return [`${relativePath}: workflow is not a valid YAML object`];
  }
  return lintWorkflow(relativePath, parsed as WorkflowDocument);
}

function main(): void {
  const errors: string[] = [];
  const workflowFiles = listGithubModeWorkflows();

  for (const filename of workflowFiles) {
    const relativePath = path.join(".github", "workflows", filename);
    const workflow = readWorkflow(relativePath);
    errors.push(...lintWorkflow(relativePath, workflow));
  }

  if (errors.length > 0) {
    console.error("GitHub mode security lint failed:\n");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`GitHub mode security lint passed for ${workflowFiles.length} workflow(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
