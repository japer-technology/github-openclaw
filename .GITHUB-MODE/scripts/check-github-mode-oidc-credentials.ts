import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "yaml";

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

type Finding = {
  path: string;
  message: string;
};

const WORKFLOW_PREFIX = "github-mode-";
const WORKFLOW_SUFFIX = ".yml";
const WORKFLOWS_DIR = path.join(process.cwd(), ".github", "workflows");

const STATIC_CLOUD_ENV_KEYS = [
  /AWS_ACCESS_KEY_ID/i,
  /AWS_SECRET_ACCESS_KEY/i,
  /AWS_SESSION_TOKEN/i,
  /AZURE_CLIENT_SECRET/i,
  /AZURE_STORAGE_KEY/i,
  /GOOGLE_APPLICATION_CREDENTIALS/i,
  /GCP_SERVICE_ACCOUNT_KEY/i,
  /GCP_CREDENTIALS/i,
  /GCLOUD_SERVICE_KEY/i,
  /CLOUD_ACCESS_KEY/i,
  /CLOUD_SECRET_KEY/i,
];

const STATIC_CLOUD_SECRET_NAMES = [
  /AWS_ACCESS_KEY_ID/i,
  /AWS_SECRET_ACCESS_KEY/i,
  /AWS_SESSION_TOKEN/i,
  /AWS_(?:DEV|STAGING|PROD)_ACCESS_KEY/i,
  /AZURE_CLIENT_SECRET/i,
  /AZURE_STORAGE_KEY/i,
  /GOOGLE_APPLICATION_CREDENTIALS/i,
  /GCP_SERVICE_ACCOUNT_KEY/i,
  /GCP_CREDENTIALS/i,
  /GCLOUD_SERVICE_KEY/i,
  /CLOUD_ACCESS_KEY/i,
  /CLOUD_SECRET_KEY/i,
  /SERVICE_ACCOUNT_KEY/i,
  /SERVICE_ACCOUNT_JSON/i,
];

function isObject(value: JsonLike): value is { [key: string]: JsonLike } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listGithubModeWorkflows(): string[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((entry) => entry.startsWith(WORKFLOW_PREFIX) && entry.endsWith(WORKFLOW_SUFFIX))
    .toSorted();
}

function parseWorkflow(relativePath: string): JsonLike {
  const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
  const parsed = parse(source);
  if (!isObject(parsed as JsonLike)) {
    throw new Error(`${relativePath}: workflow is not a valid YAML object`);
  }
  return parsed as JsonLike;
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function extractSecretReference(value: string): string | null {
  const match = value.match(/\$\{\{\s*secrets\.([A-Za-z0-9_-]+)\s*\}\}/);
  return match ? match[1] : null;
}

function collectFindings(node: JsonLike, nodePath: string, findings: Finding[]): void {
  if (Array.isArray(node)) {
    for (const [index, value] of node.entries()) {
      collectFindings(value, `${nodePath}[${index}]`, findings);
    }
    return;
  }

  if (!isObject(node)) {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    const currentPath = nodePath ? `${nodePath}.${key}` : key;

    if (key === "env" && isObject(value)) {
      for (const [envKey, envValue] of Object.entries(value)) {
        if (!matchesAny(envKey, STATIC_CLOUD_ENV_KEYS)) {
          continue;
        }

        const envPath = `${currentPath}.${envKey}`;
        if (typeof envValue === "string") {
          const secret = extractSecretReference(envValue);
          if (secret) {
            findings.push({
              path: envPath,
              message: `maps static cloud credential env var to secrets.${secret}`,
            });
            continue;
          }
        }

        findings.push({
          path: envPath,
          message:
            "defines a static cloud credential env var; use OIDC federation and short-lived credentials",
        });
      }
    }

    if (typeof value === "string") {
      const secret = extractSecretReference(value);
      if (secret && matchesAny(secret, STATIC_CLOUD_SECRET_NAMES)) {
        findings.push({
          path: currentPath,
          message: `references static cloud credential secret secrets.${secret}; use OIDC federation`,
        });
      }
    }

    collectFindings(value, currentPath, findings);
  }
}

function main(): void {
  const workflowFiles = listGithubModeWorkflows();
  const allFindings: string[] = [];

  for (const filename of workflowFiles) {
    const relativePath = path.join(".github", "workflows", filename);
    const workflow = parseWorkflow(relativePath);
    const findings: Finding[] = [];
    collectFindings(workflow, "", findings);

    for (const finding of findings) {
      allFindings.push(`${relativePath}: ${finding.path} ${finding.message}`);
    }
  }

  if (allFindings.length > 0) {
    console.error("OIDC credential policy check failed:\n");
    for (const finding of allFindings) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }

  console.log(`OIDC credential policy check passed for ${workflowFiles.length} workflow(s).`);
}

main();
