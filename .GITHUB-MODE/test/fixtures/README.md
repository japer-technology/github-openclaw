# 🦞 GitHub Mode test fixtures

### Reusable fixture files for GitHub Mode test cases.

<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/japer-technology/gh-openclaw/main/.GITHUB-MODE/assets/logo.png" alt="OpenClaw with GitHub Mode" width="500">
  </picture>
</p>

## Purpose

Fixtures model realistic workflow and policy inputs so tests can validate expected pass/fail behavior without inline YAML noise.

## Structure

- `security-lint/`: workflow YAML fixtures used by GitHub Mode security lint tests.

## Guidelines

- Keep fixture names scenario-driven (for example, `untrusted-fork-safe.yml`).
- Keep fixtures minimal while preserving the behavior under test.
- When adding a fixture, add or update the test that consumes it in the same PR.
