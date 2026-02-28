# 🦞 GitHub Mode: Security Lint Fixtures

<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/japer-technology/gh-openclaw/main/.GITHUB-MODE/assets/logo.png" alt="OpenClaw with GitHub Mode" width="500">
  </picture>
</p>

These YAML files are input scenarios for `.GITHUB-MODE/test/github-mode-security-lint.test.ts`.

## Scenario groups

- Safe untrusted-fork patterns.
- Unsafe secret exposure in untrusted contexts.
- Privileged execution without required guards.
- Action pinning/policy-actionability failures.

## Fixture maintenance

- Keep each fixture focused on one primary failure/success signal.
- Use clear file names that describe expected behavior.
- If lint rules evolve, update fixtures and test assertions together.
