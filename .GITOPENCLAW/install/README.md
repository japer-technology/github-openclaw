# .GITOPENCLAW 🦞 Install

### These files are installed by GITOPENCLAW-INSTALLER.ts

The `install/` directory contains the **installable payload** for `.GITOPENCLAW`.

Everything in this folder is intentionally flat (no nested subfolders) so it can be copied, vendored, or inspected quickly.

## Files in this folder

- `GITOPENCLAW-INSTALLER.ts` — one-time installer script.
- `GITOPENCLAW-WORKFLOW-AGENT.yml` — GitHub Actions workflow template copied to `.github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml`.
- `GITOPENCLAW-TEMPLATE-HATCH.md` — issue template copied to `.github/ISSUE_TEMPLATE/gitopenclaw-hatch.md`.
- `GITOPENCLAW-AGENTS.md` — default agent identity/instructions copied to `.GITOPENCLAW/AGENTS.md`.
- `package.json` — runtime dependencies for the scripts under `.GITOPENCLAW/`.

## Install process (step-by-step)

### 1) Place `.GITOPENCLAW` at your repository root

The expected layout is:

```text
<repo>/
  .GITOPENCLAW/
    install/
      GITOPENCLAW-INSTALLER.ts
      GITOPENCLAW-WORKFLOW-AGENT.yml
      GITOPENCLAW-TEMPLATE-HATCH.md
      GITOPENCLAW-AGENTS.md
      package.json
    lifecycle/
      GITOPENCLAW-AGENT.ts
      GITOPENCLAW-INDICATOR.ts
      GITOPENCLAW-ENABLED.ts
```

### 2) Run the installer

From the repository root:

```bash
bun .GITOPENCLAW/install/GITOPENCLAW-INSTALLER.ts
```

The installer is **non-destructive**:

- If a destination file already exists, it skips it.
- If a destination file is missing, it installs it.

### 3) What `GITOPENCLAW-INSTALLER.ts` installs

The script installs the following resources:

1. `.GITOPENCLAW/install/GITOPENCLAW-WORKFLOW-AGENT.yml` → `.github/workflows/GITOPENCLAW-WORKFLOW-AGENT.yml`
2. `.GITOPENCLAW/install/GITOPENCLAW-TEMPLATE-HATCH.md` → `.github/ISSUE_TEMPLATE/gitopenclaw-hatch.md`
3. `.GITOPENCLAW/install/GITOPENCLAW-AGENTS.md` → `.GITOPENCLAW/AGENTS.md`
4. Ensures `.gitattributes` contains:

```text
memory.log merge=union
```

That merge rule keeps the memory log append-only merge behavior safe when multiple branches update it.

### 4) Install dependencies

```bash
cd .GITOPENCLAW
bun install
```

### 5) Configure secrets and push

1. Add `ANTHROPIC_API_KEY` in: **Repository Settings → Secrets and variables → Actions**.
2. Commit the new/installed files.
3. Push to GitHub.

### 6) Start using the agent

Open a GitHub issue. The workflow picks it up and the agent responds in issue comments.

## Why this structure exists

Keeping installable assets in `install/` provides:

- a single source of truth for what gets installed,
- a predictable payload for distribution,
- easier auditing of installation-time files,
- simpler automation for future installers.
