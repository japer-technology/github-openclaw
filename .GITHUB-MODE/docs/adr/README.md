# 🦞 GitHub Mode: ADR Package

### This directory contains architecture decisions that lock runtime boundaries for GitHub mode rollout.

<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/japer-technology/gh-openclaw/main/.GITHUB-MODE/assets/logo.png" alt="OpenClaw with GitHub Mode" width="500">
  </picture>
</p>

## ADR index

- [ADR 0001 Runtime boundary and ownership](0001-runtime-boundary-and-ownership.md)
- [ADR 0002 Installed runtime non regression guardrails](0002-installed-runtime-non-regression-guardrails.md)

## Review and approval

Each ADR includes:

- Maintainer review checklist
- Machine-readable approval signoff block (`governance-signoff`)
- Backout trigger details where applicable

Phase 1 and later GitHub mode implementation phases are enabled only after all ADR signoffs are captured in-repo in the approval blocks.

Signoff block format:

```governance-signoff
[
  {
    "role": "runtime",
    "github": "@openclaw-runtime-lead",
    "approved_at": "2026-02-18"
  }
]
```

- Phase 1 gate status: ✅ Satisfied (all Task 0 ADR approvals captured on 2026-02-16).
