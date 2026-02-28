import process from "node:process";

type ReviewerType = "User" | "Team";

type ExpectedBranchPolicy = {
  name: string;
  type: "branch" | "tag";
};

type ExpectedEnvironment = {
  minReviewers: number;
  requiredReviewerTypes: ReviewerType[];
  requirePreventSelfReview: boolean;
  deploymentPolicy: {
    protectedBranches: boolean;
    customBranchPolicies: boolean;
  };
  branchPolicies: ExpectedBranchPolicy[];
};

type EnvironmentApiResponse = {
  environment?: {
    name?: string;
    protection_rules?: Array<{
      type?: string;
      prevent_self_review?: boolean;
      reviewers?: Array<{ type?: string }>;
    }>;
    deployment_branch_policy?: {
      protected_branches?: boolean;
      custom_branch_policies?: boolean;
    };
  };
};

type DeploymentBranchPoliciesApiResponse = {
  branch_policies?: Array<{
    name?: string;
    type?: "branch" | "tag";
  }>;
};

const expectedEnvironments: Record<string, ExpectedEnvironment> = {
  "github-mode-dev": {
    minReviewers: 1,
    requiredReviewerTypes: ["User"],
    requirePreventSelfReview: true,
    deploymentPolicy: {
      protectedBranches: false,
      customBranchPolicies: true,
    },
    branchPolicies: [
      { name: "github-mode/dev", type: "branch" },
      { name: "github-mode-dev-*", type: "tag" },
    ],
  },
  "github-mode-staging": {
    minReviewers: 1,
    requiredReviewerTypes: ["User"],
    requirePreventSelfReview: true,
    deploymentPolicy: {
      protectedBranches: false,
      customBranchPolicies: true,
    },
    branchPolicies: [
      { name: "github-mode/staging", type: "branch" },
      { name: "github-mode-staging-*", type: "tag" },
    ],
  },
  "github-mode-prod": {
    minReviewers: 2,
    requiredReviewerTypes: ["User", "Team"],
    requirePreventSelfReview: true,
    deploymentPolicy: {
      protectedBranches: false,
      customBranchPolicies: true,
    },
    branchPolicies: [
      { name: "main", type: "branch" },
      { name: "v*", type: "tag" },
    ],
  },
};

function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error(`GITHUB_REPOSITORY must be 'owner/repo'. Received: ${repo}`);
  }

  return { owner, name };
}

function getToken(): string {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error("Missing GitHub API token. Set GITHUB_TOKEN or GH_TOKEN.");
  }

  return token;
}

async function githubApi<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "openclaw-github-mode-environment-verifier",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed for ${path}: ${response.status} ${body}`);
  }

  return (await response.json()) as T;
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function asKey(policy: ExpectedBranchPolicy): string {
  return `${policy.type}:${policy.name}`;
}

async function verifyEnvironment(
  owner: string,
  repo: string,
  envName: string,
  token: string,
): Promise<void> {
  const expected = expectedEnvironments[envName];

  const envResponse = await githubApi<EnvironmentApiResponse>(
    `/repos/${owner}/${repo}/environments/${encodeURIComponent(envName)}`,
    token,
  );

  const environment = envResponse.environment;
  assert(environment, `Environment ${envName} was not found.`);

  const deploymentPolicy = environment.deployment_branch_policy;
  assert(deploymentPolicy, `${envName}: missing deployment_branch_policy.`);

  assert(
    deploymentPolicy.protected_branches === expected.deploymentPolicy.protectedBranches,
    `${envName}: deployment_branch_policy.protected_branches expected ${expected.deploymentPolicy.protectedBranches}, got ${deploymentPolicy.protected_branches}.`,
  );

  assert(
    deploymentPolicy.custom_branch_policies === expected.deploymentPolicy.customBranchPolicies,
    `${envName}: deployment_branch_policy.custom_branch_policies expected ${expected.deploymentPolicy.customBranchPolicies}, got ${deploymentPolicy.custom_branch_policies}.`,
  );

  const reviewerRule = environment.protection_rules?.find(
    (rule) => rule.type === "required_reviewers",
  );
  assert(reviewerRule, `${envName}: missing required_reviewers protection rule.`);

  const reviewers = reviewerRule.reviewers ?? [];
  assert(
    reviewers.length >= expected.minReviewers,
    `${envName}: expected at least ${expected.minReviewers} reviewers, got ${reviewers.length}.`,
  );

  assert(
    reviewerRule.prevent_self_review === expected.requirePreventSelfReview,
    `${envName}: required_reviewers.prevent_self_review expected ${expected.requirePreventSelfReview}, got ${reviewerRule.prevent_self_review}.`,
  );

  for (const requiredType of expected.requiredReviewerTypes) {
    assert(
      reviewers.some((reviewer) => reviewer.type === requiredType),
      `${envName}: expected at least one reviewer of type ${requiredType}.`,
    );
  }

  const policyResponse = await githubApi<DeploymentBranchPoliciesApiResponse>(
    `/repos/${owner}/${repo}/environments/${encodeURIComponent(envName)}/deployment-branch-policies`,
    token,
  );

  const actual = new Set(
    (policyResponse.branch_policies ?? [])
      .filter((policy): policy is ExpectedBranchPolicy => !!policy.name && !!policy.type)
      .map(asKey),
  );

  const expectedSet = new Set(expected.branchPolicies.map(asKey));

  for (const requiredPolicy of expected.branchPolicies) {
    assert(
      actual.has(asKey(requiredPolicy)),
      `${envName}: missing branch policy ${JSON.stringify(requiredPolicy)}.`,
    );
  }

  for (const key of actual) {
    assert(expectedSet.has(key), `${envName}: unexpected branch policy '${key}' detected.`);
  }

  console.log(`✓ ${envName} matches expected protection and deployment policy configuration.`);
}

async function main(): Promise<void> {
  const repo = parseRepo(process.env.GITHUB_REPOSITORY ?? "openclaw/openclaw");
  const token = getToken();

  for (const envName of Object.keys(expectedEnvironments)) {
    await verifyEnvironment(repo.owner, repo.name, envName, token);
  }

  console.log("All required GitHub Mode environments are correctly configured.");
}

await main();
