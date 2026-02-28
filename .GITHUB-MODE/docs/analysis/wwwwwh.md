**Title:** The OpenClaw Foundation Stewardship: The 5 Ws (and 1 H)

Based on the proposal to transition OpenClaw to a GitHub-native foundation, here is the breakdown of the initiative:

### **WHAT**

**The Project:** OpenClaw (formerly Clawdbot/Moltbot) is a local-first, model-agnostic AI agent that proactively executes tasks across WhatsApp, Telegram, and local file systems. It distinguishes itself from chatbots by being a "doer" rather than a "talker."
**The Proposal:** "GitHub Mode" is a re-architecture that moves the agent's governance and execution logic from insecure local environments into the GitHub repository itself. Instead of just hosting code, GitHub becomes the **Runtime Plane**, using Actions for compute, OIDC for identity, and Environment Gates for permission management. The headline value is multi-entity, multi-agent collaboration: teams can pass work across time zones, run reviewer-agent plus implementer-agent loops, and schedule async maintenance jobs as part of normal repository flow.

### **WHERE**

**The Home:** The project's center of gravity is moving from scattered local machines and the "ClawHub" marketplace to a centralized **Foundation Stewardship on GitHub**.
**The Runtime:**

- **Current State:** 100,000+ insecure local instances (Docker containers, Raspberry Pis, Mac Minis) often exposing "God Mode" access to the public web.
- **Future State:** A hybrid model where high-stakes reasoning runs in the **GitHub Cloud** (secured by Microsoft/GitHub infrastructure), while execution happens on authenticated local nodes only when strictly necessary.

### **WHEN**

**The Catalyst:** The transition was triggered on **February 15, 2026**, when founder Peter Steinberger announced his departure to join OpenAI.
**The Timeline:**

- **Inception:** First commit November 25, 2025.
- **Viral Peak:** Reached 100,000 stars in ~2 days (Jan 29-30, 2026), the fastest in history.
- **Implementation:** The "GitHub Mode" roadmap is divided into 7 Phases (M1–M7), moving from "Parity Checks" (M1) to full "Governance Handoff" (M7). The immediate goal is to stabilize the ecosystem before the "Agentic Era" fully matures in late 2026.

### **WHY**

**1. Collaboration at team scale (multi-entity + multi-agent):** GitHub mode enables real relay-style work instead of single-session heroics: APAC-to-EU-to-US handoffs in the same issue/PR, reviewer-agent + implementer-agent loops with explicit checkpoints, and async maintenance jobs that run while humans are offline.
**2. Neutrality (The OpenAI Problem):** With Steinberger joining OpenAI, OpenClaw risks becoming a "vendor-locked" wrapper for GPT models. A neutral foundation ensures it remains model-agnostic, supporting Anthropic, Google, and local LLMs equally.
**3. Security (The "God Mode" Crisis):** The current ecosystem is a security nightmare. Thousands of users are running exposed agents with full file-system access (CVE-2026-25253). GitHub’s "Secure-by-Construction" environment (Secret scanning, Dependabot, OIDC) is the only scalable way to patch these vulnerabilities without requiring every user to be a SysAdmin.
**4. Survival:** To evolve from a hobbyist toy to a business utility, OpenClaw needs the "boring" governance (audits, attestation, access controls) that make these shared workflows reliable.

### **HOW MUCH**

**Social Capital:**

- **196,000+ GitHub Stars:** More interest than React, Linux, or Kubernetes generated in years, gathered in just 3 months.
- **600+ Contributors:** A massive volunteer workforce that needs direction to avoid chaos.

**Financial Implications:**

- **Software Cost:** Free and Open Source (MIT License).
- **Hardware Cost:** Running a secure local instance currently requires dedicated hardware like a Raspberry Pi 5 (~€140) or Mac Mini (~€1,200), or a cloud VPS.
- **Ecosystem Value:** The "ClawHub" skill market is flooded with activity, but also malware; the cost of _inaction_ is the potential collapse of this value due to a massive security breach.

**Effort:**

- **The Roadmap:** A rigorous **7-Milestone Plan** is required to refactor the codebase from a "local hack" to a "repository runtime," requiring significant engineering hours to build adapters for GitHub Actions, OIDC authentication, and Attestation logging.
