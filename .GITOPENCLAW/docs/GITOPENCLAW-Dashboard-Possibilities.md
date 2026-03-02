# GITOPENCLAW Dashboard Possibilities

### Using `<user>.github.io/<repo>` as a live operations dashboard for your .GITOPENCLAW agent

---

## The Idea

Every `.GITOPENCLAW` agent already produces rich operational data — token usage, session transcripts, workflow runs, cost metrics, configuration state — all committed to git or accessible via the GitHub API. A GitHub Pages dashboard turns this data into a live, visual control surface for your agent.

The [How to Implement the Dashboard](GITOPENCLAW-How-to-implement-the-Dashboard.md) document covers the technical architecture (Vite + Lit, GitHub API adapter, deployment workflow). This document explores **what the dashboard could display** — the full design space of metrics, visualizations, and controls that make `<user>.github.io/<repo>` a meaningful operations center.

---

## 1. Token Usage Tracking

The agent already logs token usage to `.GITOPENCLAW/state/usage.log` as JSONL:

```json
{
  "timestamp": "2026-03-01T13:01:01.540Z",
  "issueNumber": 4,
  "actor": "japertechnology",
  "tokensUsed": 18436,
  "tokensInput": 3,
  "tokensOutput": 19,
  "cacheRead": 0,
  "cacheWrite": 18414,
  "toolCallCount": 0,
  "durationMs": 3500,
  "stopReason": ""
}
```

### What the dashboard could show

| Metric | Visualization | Source |
|---|---|---|
| **Tokens in (input)** per run | Bar chart, time series | `tokensInput` from `usage.log` |
| **Tokens out (output)** per run | Bar chart, time series | `tokensOutput` from `usage.log` |
| **Total tokens used** per run | Stacked bar (input + output + cache) | `tokensUsed` from `usage.log` |
| **Cache hit ratio** | Percentage gauge, trend line | `cacheRead / (cacheRead + cacheWrite)` |
| **Cumulative token usage** | Running total line chart | Sum of `tokensUsed` across all entries |
| **Tokens per issue** | Grouped bar chart | Group `usage.log` entries by `issueNumber` |
| **Tokens per actor** | Pie chart or table | Group by `actor` |
| **Daily/weekly token budget burn** | Progress bar against configured `maxTokensPerRun` | Aggregated `tokensUsed` vs `settings.json` limits |

### Why it matters

Token usage is the primary cost driver. A dashboard that shows tokens in/out at a glance lets operators:
- Spot runaway conversations before they burn through budgets
- Compare cost across issues (which conversations are expensive?)
- Track cache efficiency (are prompt caches being reused effectively?)
- Set alerts when cumulative usage approaches organization limits

---

## 2. Cost Estimation

Token counts become dollar amounts when multiplied by provider pricing.

### What the dashboard could show

| Metric | Visualization | Source |
|---|---|---|
| **Estimated cost per run** | Dollar amount badge | `tokensInput * inputRate + tokensOutput * outputRate` |
| **Cumulative cost** | Running total with trend line | Sum across all `usage.log` entries |
| **Cost per issue** | Table sorted by cost | Grouped by `issueNumber` |
| **Cost per day/week/month** | Time-bucketed bar chart | Aggregated by timestamp |
| **Projected monthly cost** | Extrapolation from recent usage | Linear projection from last 7 days |
| **Budget remaining** | Progress bar | Projected vs configured budget |

### Implementation note

Provider pricing (e.g., Anthropic Claude input/output rates) can be stored in a lightweight JSON config or hardcoded with the dashboard build. The dashboard computes cost client-side from token counts. No server needed.

---

## 3. Process and Workflow Monitoring

GitHub Actions workflows are the agent's compute layer. The dashboard can surface workflow health via the GitHub Actions API.

### What the dashboard could show

| Metric | Visualization | Source |
|---|---|---|
| **Recent workflow runs** | Table with status badges (✅/❌/⏳) | GitHub Actions API `list_workflow_runs` |
| **Run duration** per invocation | Bar chart, histogram | `durationMs` from `usage.log` + Actions API timing |
| **Success/failure rate** | Percentage gauge, trend sparkline | Actions API run conclusions |
| **Average response latency** | Single stat + trend | `durationMs` from `usage.log` |
| **Active runs** | Live status indicator | Actions API `status: in_progress` |
| **Workflow queue depth** | Count badge | Actions API `status: queued` |
| **Run trigger breakdown** | Pie chart (issue opened vs comment) | Actions API `event` field |
| **Failure log excerpts** | Expandable error panel | Actions API job logs |

### Why it matters

The agent's availability is the workflow's availability. If workflows are failing, queueing, or timing out, the agent is effectively down. A dashboard that shows workflow health at a glance replaces manually checking the Actions tab.

---

## 4. Session and Conversation Analytics

Session transcripts in `.GITOPENCLAW/state/sessions/` and issue mappings in `state/issues/` contain rich conversation data.

### What the dashboard could show

| Metric | Visualization | Source |
|---|---|---|
| **Active sessions** | Count badge + list | `state/sessions/*.jsonl` file listing |
| **Session timeline** | Horizontal timeline chart | Session start/end timestamps |
| **Messages per session** | Bar chart | Line count in each `.jsonl` file |
| **Issue → session mapping** | Table with links | `state/issues/*.json` |
| **Conversation preview** | Expandable card per session | First/last messages from JSONL |
| **Session age** | "Last active" relative timestamps | `updatedAt` from issue mappings |
| **Tool calls per session** | Count + breakdown by tool type | `toolCallCount` from `usage.log` |
| **Longest conversations** | Ranked list | Sessions sorted by message count |

---

## 5. Agent Status and Health

A single-glance view of whether the agent is operational, configured, and responsive.

### What the dashboard could show

| Metric | Visualization | Source |
|---|---|---|
| **Agent enabled/disabled** | Large green/red indicator | Existence of `GITOPENCLAW-ENABLED.md` |
| **Current provider** | Badge (e.g., "Anthropic") | `settings.json → defaultProvider` |
| **Current model** | Badge (e.g., "claude-opus-4-6") | `settings.json → defaultModel` |
| **Thinking level** | Badge (low/medium/high) | `settings.json → defaultThinkingLevel` |
| **Last activity** | Relative timestamp ("2 hours ago") | Most recent `usage.log` entry |
| **Uptime streak** | Count of consecutive successful runs | Actions API |
| **Token limit** | Progress bar (used vs max) | `settings.json → limits.maxTokensPerRun` vs actual |
| **Trusted users** | List with avatars | `settings.json → trustPolicy.trustedUsers` |

---

## 6. Memory and Knowledge

The agent's memory system is a key differentiator. The dashboard can visualize how knowledge accumulates.

### What the dashboard could show

| Metric | Visualization | Source |
|---|---|---|
| **Memory entries** | Count + growth trend | `state/memory.log` line count |
| **Memory timeline** | Chronological list with dates | Parsed `memory.log` entries |
| **Recent memories** | Card list of last N entries | Tail of `memory.log` |
| **Memory size** | Byte count badge | File size of `memory.log` |
| **Knowledge graph** (advanced) | Node-link diagram of topics | NLP-extracted topics from memory entries |

---

## 7. Configuration Editor

Beyond read-only metrics, the dashboard can be a configuration management interface.

### What the dashboard could show

| Feature | Interaction | Source |
|---|---|---|
| **Settings form** | Editable fields for provider/model/thinking | `config/settings.json` |
| **Trust policy editor** | Add/remove trusted users | `config/settings.json → trustPolicy` |
| **Limit sliders** | Adjust token/tool limits | `config/settings.json → limits` |
| **Config diff preview** | Show changes before committing | Computed diff against current file |
| **Config history** | Timeline of past config changes | Git history of `config/settings.json` |
| **Save as PR** | Create a PR with config changes | GitHub API: create branch + commit + PR |

---

## 8. Identity and Personality

The agent's personality and instructions are Markdown files that the dashboard can render and edit.

### What the dashboard could show

| Feature | Visualization | Source |
|---|---|---|
| **Agent identity** | Rendered Markdown view | `AGENTS.md` |
| **User profile** | Rendered Markdown view | `state/user.md` |
| **Personality editor** | Markdown editor with live preview | `AGENTS.md` via GitHub Contents API |
| **Skills list** | Card grid of available skills | `.pi/skills/` directory listing |

---

## 9. Cross-Issue Intelligence

When the agent operates across multiple issues, the dashboard can surface patterns.

### What the dashboard could show

| Metric | Visualization | Source |
|---|---|---|
| **Issues handled** | Count + list with status | `state/issues/` directory |
| **Issue activity heatmap** | Calendar heatmap (GitHub-style) | Timestamps from `usage.log` |
| **Most active issues** | Ranked table by interaction count | Grouped `usage.log` by `issueNumber` |
| **Issue resolution rate** | Open vs closed ratio | GitHub Issues API |
| **Topic clustering** (advanced) | Scatter plot of issue topics | NLP on issue titles/bodies |

---

## 10. Real-Time and Live Features

For repositories with frequent agent activity, the dashboard can provide near-real-time updates.

### What the dashboard could show

| Feature | Implementation | Source |
|---|---|---|
| **Live workflow status** | Polling GitHub Actions API every 30s | Actions API |
| **Auto-refresh metrics** | Periodic re-fetch of `usage.log` | GitHub Contents API with polling |
| **Activity feed** | Reverse-chronological event stream | Combined `usage.log` + Actions API |
| **Browser notifications** | Web Notifications API on new activity | Polling delta detection |

### Implementation note

GitHub Pages is a static site — there is no WebSocket or server-sent events. Live features are implemented via client-side polling of the GitHub API. The authenticated rate limit (5,000 requests/hour) is more than sufficient for 30-second polling intervals.

---

## 11. Multi-Agent and Organization Views

For organizations running `.GITOPENCLAW` across multiple repositories, the dashboard can aggregate.

### What the dashboard could show

| Feature | Visualization | Source |
|---|---|---|
| **Fleet overview** | Table of all repos with agent status | GitHub API: list org repos, check for `.GITOPENCLAW/` |
| **Organization-wide token usage** | Aggregated charts across repos | Combined `usage.log` from multiple repos |
| **Cross-repo cost summary** | Total spend per repo | Aggregated cost calculations |
| **Agent health matrix** | Grid with green/yellow/red per repo | Workflow status across repos |
| **Comparative analytics** | Side-by-side repo metrics | Multi-repo data fetch |

---

## 12. Export and Reporting

Dashboards are useful for glancing; exports are useful for accounting and compliance.

### What the dashboard could offer

| Feature | Format | Use Case |
|---|---|---|
| **Usage report** | CSV/JSON download | Monthly accounting, budget reviews |
| **Session transcripts** | Markdown/PDF export | Audit trail, compliance documentation |
| **Cost report** | CSV with per-run cost breakdown | Finance team, budget allocation |
| **Configuration snapshot** | JSON download | Backup, migration, disaster recovery |
| **Activity summary** | Markdown email digest | Stakeholder updates |

---

## Dashboard Layout Concept

A possible layout for the GitHub Pages dashboard:

```
┌─────────────────────────────────────────────────────────────────┐
│  GITOPENCLAW Dashboard          [Settings] [Export] [Refresh]   │
├───────────────┬─────────────────────────────────────────────────┤
│               │                                                 │
│  Agent Status │  Token Usage (last 30 days)                     │
│  ● Enabled    │  ┌─────────────────────────────────────┐        │
│  Provider:    │  │ ▁▂▃▅▇▅▃▂▁▂▃▅▇██▅▃▁▁▂▃▅▇▅▃▂▁▂▃   │        │
│   Anthropic   │  │ Input ■  Output ■  Cache ■           │        │
│  Model:       │  └─────────────────────────────────────┘        │
│   claude-     │                                                 │
│   opus-4-6    │  Estimated Cost                                 │
│  Thinking:    │  ┌─────────────┐  ┌─────────────┐              │
│   high        │  │ Today: $0.42│  │ Month: $8.71│              │
│               │  └─────────────┘  └─────────────┘              │
│  Last active: │                                                 │
│   2 hours ago │  Recent Workflow Runs                           │
│               │  ┌─────────────────────────────────────┐        │
│───────────────│  │ ✅ Issue #4  — 10.9s — 35,618 tokens│        │
│               │  │ ✅ Issue #4  — 10.6s — 35,618 tokens│        │
│  Quick Stats  │  │ ✅ Issue #4  —  3.5s — 18,593 tokens│        │
│  Sessions: 2  │  │ ✅ Issue #1  — 12.1s — 22,400 tokens│        │
│  Issues: 2    │  └─────────────────────────────────────┘        │
│  Memory: 4 KB │                                                 │
│  Runs: 5      │  Sessions                                       │
│               │  ┌─────────────────────────────────────┐        │
│───────────────│  │ issue-4.jsonl  — 5 messages — active │        │
│               │  │ issue-1.jsonl  — 3 messages — idle   │        │
│  [Edit Config]│  └─────────────────────────────────────┘        │
│  [View Memory]│                                                 │
│  [Toggle Agent│                                                 │
└───────────────┴─────────────────────────────────────────────────┘
```

---

## Data Sources Summary

All dashboard data comes from two sources — no backend server required:

| Source | Access Method | Authentication |
|---|---|---|
| **`.GITOPENCLAW/state/usage.log`** | GitHub Contents API | Optional (public repos) or token (private) |
| **`.GITOPENCLAW/state/sessions/`** | GitHub Contents API | Same |
| **`.GITOPENCLAW/state/issues/`** | GitHub Contents API | Same |
| **`.GITOPENCLAW/state/memory.log`** | GitHub Contents API | Same |
| **`.GITOPENCLAW/config/settings.json`** | GitHub Contents API | Same |
| **`.GITOPENCLAW/GITOPENCLAW-ENABLED.md`** | GitHub Contents API (existence check) | Same |
| **`.GITOPENCLAW/AGENTS.md`** | GitHub Contents API | Same |
| **GitHub Actions workflow runs** | GitHub Actions API | Token recommended |
| **GitHub Issues** | GitHub Issues API | Optional (public repos) |
| **Git history** | GitHub Commits API | Optional (public repos) |

---

## Implementation Priority

| Phase | Features | Effort | Value |
|---|---|---|---|
| **Phase 1** | Agent status, token usage charts, recent runs, cost estimates | Small | High — immediate visibility |
| **Phase 2** | Session browser, conversation previews, memory viewer | Medium | Medium — debugging and monitoring |
| **Phase 3** | Configuration editor, identity editor, save-as-PR | Medium | High — management without git clone |
| **Phase 4** | Cross-issue analytics, activity heatmap, topic clustering | Large | Medium — pattern discovery |
| **Phase 5** | Multi-repo fleet view, org-wide aggregation, export/reports | Large | High for organizations |

---

## The Vision

The github.io dashboard transforms `.GITOPENCLAW` from a "push and pray" agent into a fully observable, manageable system. Every token spent, every process run, every conversation held — visible at a glance, from a URL that deploys automatically with every push.

The agent lives in the repo. The dashboard lives at the repo's github.io URL. The audit trail lives in git. Everything stays in the GitHub ecosystem. Zero additional infrastructure.

```
Repository                        Dashboard
  .GITOPENCLAW/                     <user>.github.io/<repo>/
  ├── state/usage.log        →     Token charts, cost estimates
  ├── state/sessions/        →     Conversation browser
  ├── state/issues/          →     Issue-session mappings
  ├── state/memory.log       →     Memory timeline
  ├── config/settings.json   →     Configuration editor
  ├── AGENTS.md              →     Identity viewer
  └── GITOPENCLAW-ENABLED.md →     Status indicator
```

The data is already there. The dashboard just makes it visible.

---

_Last updated: 2026-03-02_
