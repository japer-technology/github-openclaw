# How to Implement the Dashboard via GitHub Pages

### Presenting the OpenClaw Control UI as a GitHub Pages site that reads and configures `.GITOPENCLAW`

---

## The Idea

The OpenClaw project already ships a full web dashboard — the **Control UI** — built with Vite and Lit web components (`ui/`). It provides chat, configuration, channel management, settings, and real-time gateway connectivity.

The question: **can this dashboard be automatically built and served via GitHub Pages so that any fork of the repository gets a web-based configuration interface for `.GITOPENCLAW`?**

The answer is yes. This document describes how to implement it.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  GitHub Repository (your fork)                               │
│                                                              │
│  .GITOPENCLAW/                                               │
│  ├── config/settings.json    ← dashboard reads/writes this   │
│  ├── lifecycle/              ← agent scripts (read-only)     │
│  ├── state/                  ← session data (read-only)      │
│  └── docs/                   ← you are here                  │
│                                                              │
│  ui/                         ← OpenClaw Control UI source    │
│  ├── src/                    ← Lit components, Vite app      │
│  ├── index.html                                              │
│  └── vite.config.ts          ← supports base path config     │
│                                                              │
│  .github/workflows/                                          │
│  └── gitopenclaw-dashboard.yml  ← builds + deploys to Pages  │
└──────────────────────────────────────────────────────────────┘
         │
         │  GitHub Actions builds the UI
         │  Deploys to GitHub Pages
         ▼
┌──────────────────────────────────────┐
│  https://<user>.github.io/<repo>/    │
│                                      │
│  Static dashboard                    │
│  • View .GITOPENCLAW config          │
│  • Edit settings (creates PR/commit) │
│  • View agent status and sessions    │
│  • Read-only state inspection        │
└──────────────────────────────────────┘
```

---

## Prerequisites

- A fork of the `openclaw/openclaw` repository (or any repo containing `.GITOPENCLAW/`)
- GitHub Pages enabled on the repository (Settings → Pages)
- Node.js 22+ available in CI (already the case for OpenClaw workflows)

---

## Implementation Steps

### Step 1: Create a Dashboard Adapter Layer

The existing Control UI (`ui/`) connects to a live OpenClaw gateway via WebSocket. For a GitHub Pages deployment, the dashboard needs an adapter that reads `.GITOPENCLAW` configuration from the GitHub API instead of a live gateway.

Create a new entry point or adapter module that:

1. **Reads configuration from the repository** via the GitHub REST API (`/repos/{owner}/{repo}/contents/.GITOPENCLAW/config/settings.json`)
2. **Reads agent state** (session mappings, memory) via the same API
3. **Writes configuration changes** by creating commits or pull requests via the GitHub API

**Suggested file**: `ui/src/gitopenclaw-adapter.ts`

```typescript
// Adapter that replaces live gateway calls with GitHub API calls
// for reading/writing .GITOPENCLAW configuration

interface GitOpenClawConfig {
  defaultProvider: string;
  defaultModel: string;
  defaultThinkingLevel: string;
}

export async function loadConfig(
  owner: string,
  repo: string,
  token: string,
): Promise<{ config: GitOpenClawConfig; sha: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/.GITOPENCLAW/config/settings.json`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error("settings.json not found — is .GITOPENCLAW configured?");
    if (res.status === 403) throw new Error("Permission denied — check your token scopes");
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // GitHub API returns base64 content with possible whitespace — strip before decoding
  const content = atob(data.content.replace(/\s/g, ""));
  return { config: JSON.parse(content), sha: data.sha };
}

export async function saveConfig(
  owner: string,
  repo: string,
  token: string,
  config: GitOpenClawConfig,
  sha: string,
): Promise<void> {
  await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/.GITOPENCLAW/config/settings.json`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: "chore: update .GITOPENCLAW config via dashboard",
        content: btoa(JSON.stringify(config, null, 2) + "\n"),
        sha,
      }),
    },
  );
}
```

### Step 2: Create a Standalone Dashboard Page

Build a lightweight dashboard page that uses the adapter from Step 1. This can either be:

**Option A — Extend the existing Control UI** with a `.GITOPENCLAW` mode that activates when no live gateway is available. The Vite config already supports base path configuration via `OPENCLAW_CONTROL_UI_BASE_PATH`.

**Option B — Create a minimal standalone dashboard** specifically for `.GITOPENCLAW` configuration. This is simpler and avoids carrying the full Control UI weight.

For Option B, create `ui/src/gitopenclaw-dashboard.ts`:

```typescript
import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("gitopenclaw-dashboard")
export class GitOpenClawDashboard extends LitElement {
  // Dashboard component that:
  // 1. Authenticates via GitHub OAuth device flow or personal access token
  // 2. Reads .GITOPENCLAW/config/settings.json from the repo
  // 3. Displays current configuration (provider, model, thinking level)
  // 4. Allows editing and commits changes back via GitHub API
  // 5. Shows recent agent sessions from .GITOPENCLAW/state/
  // 6. Displays agent enabled/disabled status
}
```

And a corresponding entry point `ui/gitopenclaw.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GITOPENCLAW Dashboard</title>
  </head>
  <body>
    <gitopenclaw-dashboard></gitopenclaw-dashboard>
    <script type="module" src="/src/gitopenclaw-dashboard.ts"></script>
  </body>
</html>
```

### Step 3: Add a Vite Build Configuration for the Dashboard

Add a build target in the Vite config or a separate config file for the dashboard:

**Suggested file**: `ui/vite.gitopenclaw.config.ts`

```typescript
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Base path for GitHub Pages: /<repo-name>/
  // This is set at build time from the repository name
  base: process.env.GITHUB_PAGES_BASE || "./",
  root: here,
  build: {
    outDir: path.resolve(here, "../.GITOPENCLAW/build/dashboard"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(here, "gitopenclaw.html"),
    },
  },
});
```

### Step 4: Create the GitHub Actions Workflow

Create a workflow that builds and deploys the dashboard to GitHub Pages whenever `.GITOPENCLAW/config/` or `ui/` changes.

**File**: `.github/workflows/gitopenclaw-dashboard.yml`

```yaml
name: GITOPENCLAW Dashboard

on:
  push:
    branches: [main]
    paths:
      - ".GITOPENCLAW/config/**"
      - "ui/**"
      - ".github/workflows/gitopenclaw-dashboard.yml"
  workflow_dispatch: # Allow manual trigger

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build dashboard
        env:
          GITHUB_PAGES_BASE: /${{ github.event.repository.name }}/
        run: |
          cd ui
          npx vite build --config vite.gitopenclaw.config.ts

      - name: Inject config snapshot
        run: |
          # Embed the current .GITOPENCLAW config into the built dashboard
          # so it can display settings without an API call on first load
          cp .GITOPENCLAW/config/settings.json \
             .GITOPENCLAW/build/dashboard/config-snapshot.json

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .GITOPENCLAW/build/dashboard

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### Step 5: Authentication for Configuration Writes

The dashboard is a static site — it cannot hold server-side secrets. For writing configuration changes back to the repository, use one of these approaches:

#### Option A: GitHub OAuth Device Flow (Recommended)

The dashboard prompts the user to authenticate via GitHub's device authorization flow. This is the same pattern the OpenClaw Control UI already uses for device pairing (`ui/src/ui/device-auth.ts`).

1. Register a GitHub OAuth App (Settings → Developer settings → OAuth Apps)
2. Use the device flow to get a user token in the browser
3. Use the token for GitHub API calls to read/write `.GITOPENCLAW/config/`

This is the most secure option — no tokens are stored in the repository, and the user explicitly authorizes each session.

#### Option B: Personal Access Token via URL Parameter

For simpler setups, the dashboard can accept a GitHub personal access token via a URL fragment (not query parameter — fragments are not sent to the server):

```
https://<user>.github.io/<repo>/#token=ghp_xxxx
```

The token is read from `window.location.hash`, used for API calls, and never persisted. This is less secure but requires no OAuth App setup.

#### Option C: Read-Only Mode (No Authentication)

For public repositories, the dashboard can read `.GITOPENCLAW/config/settings.json` without authentication (the GitHub Contents API allows unauthenticated reads for public repos). Configuration changes would be made by forking the dashboard's suggested changes as a PR — the dashboard generates the commit payload and opens a PR via the GitHub API when a token is provided, or shows the user what to change manually.

---

## Dashboard Features

### Tier 1: Configuration Viewer and Editor

| Feature | Source | Implementation |
|---|---|---|
| **View current settings** | `.GITOPENCLAW/config/settings.json` | Read via GitHub Contents API, display as form |
| **Edit provider/model/thinking** | Same file | Form fields → commit via GitHub Contents API |
| **Agent enabled/disabled status** | `.GITOPENCLAW/GITOPENCLAW-ENABLED.md` | Check file existence via Contents API |
| **Toggle agent on/off** | Same file | Create/delete file via Contents API |

### Tier 2: State Inspector

| Feature | Source | Implementation |
|---|---|---|
| **List recent sessions** | `.GITOPENCLAW/state/sessions/` | List directory contents via API |
| **View session transcript** | `state/sessions/<id>.jsonl` | Fetch and render JSONL lines |
| **Issue-session mappings** | `state/issues/<n>.json` | List and display mappings |
| **Memory log** | `state/memory.log` | Fetch and display as timeline |

### Tier 3: Agent Identity

| Feature | Source | Implementation |
|---|---|---|
| **View agent identity** | `.GITOPENCLAW/AGENTS.md` | Render Markdown |
| **Edit agent personality** | Same file | Markdown editor → commit |
| **User profile** | `state/user.md` | Render Markdown |

### Tier 4: Workflow Status

| Feature | Source | Implementation |
|---|---|---|
| **Recent workflow runs** | GitHub Actions API | List runs for `GITOPENCLAW-WORKFLOW-AGENT` |
| **Run status and logs** | Same API | Show pass/fail, link to logs |
| **Trigger manual run** | GitHub API `workflow_dispatch` | Button to trigger |

---

## Configuration Without a Live Gateway

The key architectural insight: the dashboard does not need a running OpenClaw gateway. All `.GITOPENCLAW` configuration and state lives in git as plain files. The GitHub API provides read and write access to these files.

This means the dashboard is:

- **Fully static** — no backend server, no WebSocket connection
- **Deployable via GitHub Pages** — zero infrastructure
- **Repository-scoped** — each fork gets its own dashboard URL
- **Version-controlled** — every configuration change is a git commit

The existing Control UI's gateway-dependent features (live chat, real-time tool streaming, channel management) would not be available in this mode. Instead, the dashboard focuses on what can be done via the repository API:

- Read and edit configuration files
- Inspect committed state (sessions, memory, mappings)
- View workflow run history and status
- Toggle the agent on/off

---

## GitHub Pages Setup

### Enable GitHub Pages on Your Fork

1. Go to **Settings → Pages** in your fork
2. Under **Source**, select **GitHub Actions**
3. The `gitopenclaw-dashboard.yml` workflow handles the rest

### Custom Domain (Optional)

If you want a custom domain instead of `<user>.github.io/<repo>`:

1. Add a `CNAME` file to the build output directory
2. Configure the custom domain in Settings → Pages
3. Update the `GITHUB_PAGES_BASE` to `/`

### Access Control

- **Public repos**: The dashboard is publicly accessible. Read-only mode works without authentication. Writes require a GitHub token.
- **Private repos**: GitHub Pages for private repos requires GitHub Enterprise or a GitHub Pro plan. Alternatively, the dashboard can be built locally and served from any static host.

---

## Security Considerations

### No Secrets in the Dashboard

The dashboard is a static site served from GitHub Pages. It must never contain:
- API keys (LLM provider keys, GitHub tokens)
- Credentials of any kind
- Sensitive configuration values

All secrets remain in GitHub Actions secrets. The dashboard only reads/writes plain configuration files (provider name, model name, thinking level).

### Token Handling

If the dashboard accepts a GitHub token for write operations:
- Store the token only in memory (`sessionStorage` at most — never `localStorage`)
- Clear the token on page unload
- Use the minimum required scope (`repo` for private repos, `public_repo` for public)
- Never include the token in URLs, logs, or committed files

### CORS and API Access

The GitHub REST API supports CORS for browser requests. The dashboard can call the API directly from JavaScript without a proxy server. Rate limits apply (60 requests/hour unauthenticated, 5,000/hour with a token).

### Content Security Policy

The built dashboard should include a strict CSP header (configured in the HTML or via GitHub Pages `_headers` file):

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; connect-src https://api.github.com https://github.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'">
```

---

## Implementation Phases

### Phase 1: Read-Only Dashboard

**Effort**: Small
**Value**: Immediate visibility into `.GITOPENCLAW` configuration

1. Build a minimal Lit component that reads `config/settings.json` from the GitHub API
2. Display current provider, model, and thinking level
3. Show agent enabled/disabled status
4. List recent workflow runs
5. Deploy via GitHub Pages workflow

### Phase 2: Configuration Editor

**Effort**: Medium
**Value**: Edit `.GITOPENCLAW` settings without cloning the repo

1. Add GitHub OAuth device flow for authentication
2. Form fields for provider, model, thinking level
3. Commit changes via GitHub Contents API
4. Show diff preview before committing

### Phase 3: State Inspector

**Effort**: Medium
**Value**: Debug and monitor agent conversations

1. List sessions from `state/sessions/`
2. Render JSONL transcripts as chat-style UI
3. Show issue-session mappings
4. Display memory log timeline

### Phase 4: Full Dashboard

**Effort**: Large
**Value**: Complete web-based management of `.GITOPENCLAW`

1. AGENTS.md editor with Markdown preview
2. Workflow dispatch (trigger agent manually)
3. Session search and filtering
4. Agent identity customization
5. Reuse components from the full Control UI where possible

---

## Reusing Existing OpenClaw UI Components

The full Control UI (`ui/src/ui/`) contains reusable components that the dashboard can import directly:

| Component | File | Dashboard Use |
|---|---|---|
| **Configuration form** | `config-form.browser.test.ts` | Edit `settings.json` fields |
| **Markdown renderer** | `markdown.ts` | Render `AGENTS.md`, `memory.log` |
| **Theme system** | `theme.ts`, `theme-transition.ts` | Dark/light mode |
| **Chat display** | `chat/` | Render session transcripts |
| **Settings storage** | `storage.ts` | Local preferences |
| **Icons** | `icons.ts` | UI iconography |

Because the dashboard is built from the same repository, these components are already available — no additional dependencies needed.

---

## Alternative: Embedding the Dashboard in the README

For the simplest possible implementation, the dashboard can be a set of **GitHub Actions badges and links** embedded directly in `.GITOPENCLAW/README.md`:

```markdown
## Agent Status

[![Agent Status](https://github.com/<user>/<repo>/actions/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml/badge.svg)](https://github.com/<user>/<repo>/actions/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml)

**Provider**: `anthropic` | **Model**: `claude-opus-4-6` | **Thinking**: `high`

[Edit Configuration](https://github.com/<user>/<repo>/edit/main/.GITOPENCLAW/config/settings.json) |
[View Sessions](https://github.com/<user>/<repo>/tree/main/.GITOPENCLAW/state/sessions) |
[Agent Identity](https://github.com/<user>/<repo>/blob/main/.GITOPENCLAW/AGENTS.md)
```

This requires zero additional infrastructure and works immediately. The full dashboard (Phases 1-4) builds on this foundation.

---

## Summary

| Approach | Effort | Features | Infrastructure |
|---|---|---|---|
| **README badges + edit links** | Minimal | View status, edit config via GitHub UI | None |
| **Phase 1: Read-only dashboard** | Small | View config, status, workflow runs | GitHub Pages |
| **Phase 2: Config editor** | Medium | Edit settings via web form | GitHub Pages + OAuth App |
| **Phase 3: State inspector** | Medium | Browse sessions, memory, mappings | GitHub Pages + OAuth App |
| **Phase 4: Full dashboard** | Large | Complete management UI | GitHub Pages + OAuth App |

The GitHub Pages mechanism is well-suited for this because:

1. **Every fork gets its own URL** — `<user>.github.io/<repo>/`
2. **Deployment is automatic** — the workflow builds and deploys on push
3. **No server to manage** — static files only
4. **Configuration lives in git** — every change is a commit
5. **The UI source is already in the repo** — Vite + Lit components are ready to reuse

The dashboard is a natural extension of the fork-as-installation model. The fork gives you the agent. GitHub Pages gives you the dashboard. Git gives you the audit trail. Everything stays in the repository.

---

_Last updated: 2026-02-21_
