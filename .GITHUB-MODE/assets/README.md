# 🦞 GitHub Mode: Assets

### Static assets used by GitHub Mode documentation and validation tooling.

<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/japer-technology/gh-openclaw/main/.GITHUB-MODE/assets/logo.png" alt="OpenClaw with GitHub Mode" width="500">
  </picture>
</p>

## Contents

- `logo.png`: branding image used in `.GITHUB-MODE/README.md`.
- `github-mode-required-packages.json`: package allow/requirement list consumed by package validation checks.

## Editing guidance

- Keep assets deterministic and reviewable.
- Prefer text-based assets (like JSON manifests) for policy-driven checks.
- If you replace binary assets, include a short note in the PR about why the replacement is needed.
