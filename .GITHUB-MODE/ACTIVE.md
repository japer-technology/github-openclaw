# 🦞 GitHub Mode: Active

### Delete or rename this file to disable GitHub Mode.

<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/japer-technology/gh-openclaw/main/.GITHUB-MODE/assets/logo.png" alt="OpenClaw with GitHub Mode" width="500">
  </picture>
</p>

GitHub Mode is **explicitly enabled** while this file exists at:

- `.GITHUB-MODE/ACTIVE.md`

## File existence behavior

All `github-mode-*` workflows run `.GITHUB-MODE/scripts/check-github-mode-active.ts` as the first blocking guard step. If this file is missing, the guard exits non-zero and prints:

> GitHub Mode disabled by missing ACTIVE.md

That fail-closed guard blocks all subsequent GITHUB-MODE workflow logic.
