import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "yaml";

type WorkflowDocument = {
  permissions?: unknown;
  jobs?: Record<string, { permissions?: unknown; steps?: Array<{ uses?: string }> }>;
};

const WORKFLOW_PREFIX = "github-mode-";
const WORKFLOW_SUFFIX = ".yml";
const WORKFLOWS_DIR = path.join(process.cwd(), ".github", "workflows");

function listGithubModeWorkflows(): string[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((entry) => entry.startsWith(WORKFLOW_PREFIX) && entry.endsWith(WORKFLOW_SUFFIX))
    .toSorted();
}

function readWorkflow(relativePath: string): WorkflowDocument {
  const fullPath = path.join(process.cwd(), relativePath);
  const source = readFileSync(fullPath, "utf8");
  const parsed = parse(source);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${relativePath}: workflow is not a valid YAML object`);
  }
  return parsed as WorkflowDocument;
}

function hasExplicitPermissions(workflow: WorkflowDocument): boolean {
  if (workflow.permissions !== undefined) {
    return true;
  }

  const jobs = workflow.jobs ?? {};
  const jobEntries = Object.values(jobs);
  if (jobEntries.length === 0) {
    return false;
  }

  return jobEntries.every((job) => job.permissions !== undefined);
}

function isMutableRef(ref: string): boolean {
  return /^v\d+(?:\.\d+)*$/i.test(ref) || /^(main|master)$/i.test(ref);
}

function validateThirdPartyRefs(relativePath: string, workflow: WorkflowDocument): string[] {
  const errors: string[] = [];
  const jobs = workflow.jobs ?? {};

  for (const [jobName, job] of Object.entries(jobs)) {
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      const uses = step.uses;
      if (!uses || uses.startsWith("./") || uses.startsWith("docker://")) {
        continue;
      }

      const atIndex = uses.lastIndexOf("@");
      if (atIndex < 0) {
        continue;
      }

      const ref = uses.slice(atIndex + 1);

      if (isMutableRef(ref)) {
        errors.push(
          `${relativePath}: jobs.${jobName}.steps[${stepIndex}] uses mutable third-party ref \`${uses}\``,
        );
      }
    }
  }

  return errors;
}

function main(): void {
  const workflowFiles = listGithubModeWorkflows();
  const errors: string[] = [];

  for (const filename of workflowFiles) {
    const relativePath = path.join(".github", "workflows", filename);
    const workflow = readWorkflow(relativePath);

    if (!hasExplicitPermissions(workflow)) {
      errors.push(`${relativePath}: missing explicit permissions (top-level or per-job)`);
    }

    errors.push(...validateThirdPartyRefs(relativePath, workflow));
  }

  if (errors.length > 0) {
    console.error("GitHub mode workflow lint failed:\n");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`GitHub mode workflow lint passed for ${workflowFiles.length} workflow(s).`);
}

main();
