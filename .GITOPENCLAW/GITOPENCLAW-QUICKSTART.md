# GitOpenClaw — Quick Start 🦞

Get a working AI agent in your GitHub repository in 5 minutes.

---

## Prerequisites

- A GitHub repository (public or private)
- [Bun](https://bun.sh) installed locally (for running the installer)
- An LLM API key (Anthropic recommended)

## Setup

### 1. Copy `.GITOPENCLAW` into your repo

If you are starting from this repository, `.GITOPENCLAW/` is already in place.

For a new repository, copy the entire `.GITOPENCLAW/` folder to the repository root.

### 2. Run the installer

```bash
bun .GITOPENCLAW/install/GITOPENCLAW-INSTALLER.ts
```

This copies the workflow, issue templates, and git attributes into the right locations.

### 3. Install dependencies

```bash
cd .GITOPENCLAW && bun install
```

### 4. Add your API key

Go to **Repository Settings → Secrets and variables → Actions → New repository secret**.

Add your LLM provider API key:

| Provider | Secret name | Value |
|---|---|---|
| **Anthropic** | `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |
| **OpenAI** | `OPENAI_API_KEY` | `sk-...` |

### 5. Commit and push

```bash
git add -A
git commit -m "chore: install gitopenclaw"
git push
```

### 6. Open an issue

Create a new GitHub issue. The agent will respond as a comment.

---

## LLM provider configuration

Edit `.GITOPENCLAW/config/settings.json`:

### Anthropic (default)

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-opus-4-6",
  "defaultThinkingLevel": "high"
}
```

### OpenAI

```json
{
  "defaultProvider": "openai",
  "defaultModel": "gpt-4o",
  "defaultThinkingLevel": "high"
}
```

---

## Common tweaks

### Change the model

Edit `config/settings.json` and set `defaultModel` to any model supported by your provider.

### Change the thinking level

Set `defaultThinkingLevel` to `"low"`, `"medium"`, or `"high"` in `config/settings.json`.

### Disable the agent

Delete `.GITOPENCLAW/GITOPENCLAW-ENABLED.md` and push. The fail-closed guard will block all workflows.

### Re-enable the agent

Restore `GITOPENCLAW-ENABLED.md` and push.
