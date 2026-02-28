# 🦞 GitHub Mode: Security

### If you believe you've found a security issue in OpenClaw with GitHub Mode, please report it **privately**.

<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/japer-technology/gh-openclaw/main/.GITHUB-MODE/assets/logo.png" alt="OpenClaw with GitHub Mode" width="500">
  </picture>
</p>

## Where to Report

Report vulnerabilities to the repository where the issue lives.

For avoidance of doubt:

- **OpenClaw contacts and security ownership for OpenClaw products remain with the OpenClaw team** (openclaw/\* repositories).
- **`japer-technology/gh-openclaw` is only for OpenClaw with GitHub Mode components** and should not be used for unrelated OpenClaw core/mobile/gateway disclosures.

Primary OpenClaw security reporting repositories:

- **Core CLI and gateway** — https://github.com/openclaw/openclaw
- **macOS desktop app** — https://github.com/openclaw/openclaw (`apps/macos`)
- **iOS app** — https://github.com/openclaw/openclaw (`apps/ios`)
- **Android app** — https://github.com/openclaw/openclaw (`apps/android`)
- **ClawHub** — https://github.com/openclaw/clawhub
- **Trust and threat model** — https://github.com/openclaw/trust

OpenClaw with GitHub Mode implementation components (only):

- **GitHub Mode components** — https://github.com/japer-technology/gh-openclaw

If you're unsure where to report, email **eric.mourant@japer.technology** and we will route it.

## Required in Security Reports

Please include:

1. **Title**
2. **Severity Assessment**
3. **Impact**
4. **Affected Component**
5. **Technical Reproduction**
6. **Demonstrated Impact**
7. **Environment**
8. **Remediation Advice**

Reports without reproduction steps, demonstrated impact, and remediation advice may be deprioritized.

## Scope and Expectations

### Out of Scope

- Public Internet Exposure
- Using OpenClaw in ways the docs recommend against
- Prompt injection attacks

### Bug Bounty

OpenClaw does not currently run a paid bug bounty program.

## Operational Security Notes

- Keep the Gateway web interface local-only when possible (`gateway.bind="loopback"`).
- Do not expose Gateway directly to the public internet.
- For remote access, prefer SSH tunneling or Tailscale with strong Gateway auth.
- Treat canvas surfaces (`/__openclaw__/canvas/`, `/__openclaw__/a2ui/`) as sensitive/untrusted.

Security hardening guidance: https://docs.openclaw.ai/gateway/security

## Runtime Security Baseline

### Node.js

Use **Node.js 22.12.0 or later**.

```bash
node --version
```

### Docker

Recommended hardening when running in Docker:

- Run as non-root (official image defaults to user `node`)
- Use `--read-only` when possible
- Drop capabilities with `--cap-drop=ALL`

```bash
docker run --read-only --cap-drop=ALL \
  -v openclaw-data:/app/data \
  openclaw/openclaw:latest
```

## Security Scanning

This project uses `detect-secrets` in CI/CD.

```bash
pip install detect-secrets==1.5.0
detect-secrets scan --baseline .secrets.baseline
```
