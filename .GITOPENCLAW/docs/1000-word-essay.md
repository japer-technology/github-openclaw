# .GITOPENCLAW: The Cadence of Intelligence Between Minutes and Seconds

## The Repository as Runtime

There is something quietly radical about a `.git` directory becoming the execution context for an AI agent. Not a container registry, not a cloud function, not a Kubernetes pod — a repository. When OpenClaw runs inside GitHub Actions, the repository itself becomes the infrastructure. The code, the configuration, the agent's memory files, its soul, its identity — all versioned, all forkable, all portable. This is what .GITOPENCLAW represents: not a file, not a spec, but a paradigm where the repository is the machine.

The traditional model of deploying an AI agent involves provisioning a server, configuring a daemon, managing uptime, handling restarts, and paying for idle compute. The .GITOPENCLAW model inverts this entirely. The agent exists as a repository. It wakes when triggered — by a cron schedule, a webhook, an issue comment, a dispatch event — runs inside GitHub's ephemeral compute, does its work, commits its state changes back to the repository, and vanishes. The infrastructure is the version control system itself.

This changes what "running" means. The agent doesn't run. It *reconstitutes*. Every execution is a fresh boot from a known state, with the repository as the source of truth. SOUL.md is the personality. HEARTBEAT.md is the task list. AGENTS.md is the operating manual. The `.openclaw/sessions/` directory is the memory. Git is the persistence layer. GitHub Actions is the CPU.

## The Minute Cadence

GitHub Actions bills in minutes. More importantly, it *thinks* in minutes. The minimum cron granularity is one minute. Workflow dispatch has queue latency. Runner provisioning takes seconds to tens of seconds before your job even begins. The practical floor for any GitHub Actions-based agent loop is somewhere between one and five minutes.

This creates a fascinating constraint. An agent operating on a minute cadence cannot be conversational in the traditional sense. It cannot respond in real-time. It cannot maintain a WebSocket connection. It cannot stream tokens to a chat interface as they're generated. Instead, it operates more like email than instant messaging — more like a colleague who checks their inbox every few minutes than one sitting next to you.

But this constraint is also a feature. A minute-cadence agent is inherently batched. It accumulates events — new issues filed, PR reviews posted, messages received, sensor data collected — and processes them in coherent bursts. There is no interrupt-driven context switching. There is no partial attention. When the agent wakes, it has the full picture of everything that happened since it last ran, and it can reason about all of it at once.

For many workloads, this is not just acceptable but superior. Monitoring a repository for security advisories does not require sub-second latency. Triaging incoming issues benefits from seeing the full batch rather than reacting to each one in isolation. Generating a daily summary, updating documentation, running health checks against infrastructure — these are tasks measured in minutes and hours, not milliseconds. The minute cadence matches the actual tempo of the work.

The economics are compelling. GitHub provides 2,000 free Actions minutes per month for private repositories, and unlimited minutes for public ones. A cron job running every five minutes for a month consumes roughly 8,640 invocations. If each run takes 30 seconds of compute, that's 4,320 minutes — achievable within the free tier of a team plan, or trivially cheap on a paid one. You are renting an AI agent for the cost of a repository.

## The Second Cadence

Now fork the repository. Clone it to your laptop, a Raspberry Pi, a VPS, a home server. Run `openclaw gateway` locally. Suddenly, the same agent — the same SOUL.md, the same AGENTS.md, the same configuration — operates at the cadence of seconds. Sub-seconds, even. The gateway maintains persistent WebSocket connections. Messages arrive and are processed immediately. The agent streams responses in real-time. Tool calls execute locally with filesystem access, no artifact uploads, no runner provisioning.

The transition from minutes to seconds is not a migration. It's a `git clone`. The repository that was infrastructure on GitHub becomes configuration locally. The agent's identity, personality, memory, and operating instructions travel with it because they *are* the repository. Nothing is lost in translation because there is no translation.

This duality — the same agent definition running at two fundamentally different cadences — is the core insight of .GITOPENCLAW. It means you can prototype on GitHub Actions (zero infrastructure, zero cost) and graduate to a local gateway when latency matters. It means you can run the interactive, real-time agent on your home server for daily use, while a GitHub Actions cron job handles the overnight batch work using the same agent identity. It means a team can fork your agent repository, run it on their own infrastructure at their own cadence, and contribute improvements back upstream.

## The Space Between

The most interesting territory is the space between minutes and seconds. A locally-run gateway with a GitHub Actions fallback. The agent responds in real-time when the gateway is online, but if the machine sleeps or the network drops, pending work queues as GitHub issues or dispatch events, and the Actions-based version picks up the slack. The minute-cadence runner becomes the agent's subconscious — handling background tasks, long-running analysis, and catch-up work while the second-cadence gateway handles the foreground conversation.

This is not theoretical architecture. The pieces already exist. OpenClaw's session system persists to files that live naturally in a repository. The heartbeat mechanism polls for work on a configurable interval. The cron system can trigger both system events and isolated agent turns. The agent's workspace files — HEARTBEAT.md, BOOTSTRAP.md, TOOLS.md — are the control plane, and they're just Markdown files in a Git repository.

## What .GITOPENCLAW Means

.GITOPENCLAW is the recognition that a Git repository is a sufficient substrate for an AI agent's entire lifecycle: its identity, its memory, its configuration, its execution environment, and its persistence. GitHub Actions provides the compute. Git provides the state management. The repository provides the portability. And the cadence — minutes on GitHub, seconds when local — is not a limitation to overcome but a spectrum to exploit. The agent runs where it makes sense, at the speed that the context demands, from a single source of truth that fits in a `git clone`.

The future of personal AI infrastructure might not be a cloud service you subscribe to. It might be a repository you fork.
