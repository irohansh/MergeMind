# MergeMind — Architecture

## Table of Contents

1. [Overview](#overview)
2. [System Diagram](#system-diagram)
3. [Pipeline Stages](#pipeline-stages)
4. [Agent Design](#agent-design)
5. [File Structure](#file-structure)
6. [Data Flow](#data-flow)
7. [Type System](#type-system)
8. [callAgent — The SDK Gateway](#callagent--the-sdk-gateway)
9. [Model Routing Strategy](#model-routing-strategy)
10. [Database Layer](#database-layer)
11. [MCP Integration](#mcp-integration)
12. [Slash Commands](#slash-commands)
13. [Environment Variables](#environment-variables)
14. [Error Handling and Resilience](#error-handling-and-resilience)
15. [Extending the System](#extending-the-system)

---

## Overview

MergeMind is a multi-agent GitHub pull request review system built in TypeScript. It takes a raw PR diff and metadata, routes the analysis across five specialised AI agents, and produces a single structured GitHub comment with findings ranked by severity.

The core design principle is **separation of concerns by agent role**: no single agent does everything. The Planner reads and decomposes; the Security, Logic, and Style agents each review one dimension in isolation; the Synthesiser assembles the final output. Each agent receives only what it needs and produces only what its type contract specifies.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Caller / CLI                         │
│   src/index.ts  →  runPRReview(prDiff, prContext)           │
└──────────────────────────────┬──────────────────────────────┘
                               │ prDiff + PRContext
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    src/orchestrator.ts                      │
│                                                             │
│  Step 1 ──► PLANNER (Haiku)                                 │
│             Decomposes diff → security / logic / style      │
│             batches, risk levels, skip list                 │
│                       │                                     │
│             PlannerOutput (typed JSON)                      │
│                       │                                     │
│  Step 2 ──► Promise.all([                                   │
│               Promise.all(security_batches.map → SECURITY)) │
│               Promise.all(logic_batches.map   → LOGIC)      │
│               Promise.all(style_batches.map   → STYLE)      │
│             ])                  ↑ all three run in parallel │
│                       │                                     │
│             [SecurityAgentOutput[], LogicAgentOutput[],     │
│              StyleAgentOutput[]]                            │
│                       │                                     │
│  Step 3 ──► SYNTHESISER (Sonnet)                            │
│             Merges all agent outputs → GitHub Markdown      │
│                       │                                     │
│             string (Markdown PR comment)                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
                    GitHub PR comment (via MCP)

                    ┌──────────────────────┐
                    │  Every agent call:   │
                    │  • logs to stdout    │
                    │  • writes row to     │
                    │    Postgres          │
                    │    agent_logs table  │
                    └──────────────────────┘
```

---

## Pipeline Stages

### Stage 1 — Planner (sequential, must complete first)

The Planner is the only agent that sees the raw diff. It does no reviewing — its sole job is decomposition and classification.

**Input:** `{ diff: string, context: PRContext }`

**Output:** `PlannerOutput`
- Assigns each changed file to one or more review categories (SECURITY / LOGIC / STYLE)
- Groups files into batches of max 8 (to stay under Tier 1 TPM limits)
- Assigns a risk level per batch: CRITICAL / HIGH / MEDIUM / LOW
- Generates specific `focus_areas` per batch — not generic advice, but concrete observations about the actual diff (line numbers, function names, patterns)
- Lists `skip_files` (lock files, migrations, generated files) that no downstream agent should touch

The Planner output is the contract that all downstream agents operate within. If the Planner cannot parse the diff, it returns `{ error: "unparseable_diff", reason: "..." }` and the pipeline short-circuits.

---

### Stage 2 — Specialist Agents (parallel)

All three specialist agents are launched simultaneously via `Promise.all`. Within each agent type, batches are also parallelised via a nested `Promise.all`. This means for a PR with 2 security batches and 3 logic batches, all 5 API calls fire at the same time.

Each specialist agent receives:
- Its assigned batch (`batch_id`, `files` with diffs, `focus_areas`)
- `pr_context` for reference

Each agent validates the Planner's `focus_areas` — it must explicitly confirm or refute each one in a `planner_focus_validation` array. This creates an audit trail and prevents the Planner's hypotheses from becoming unchecked assumptions.

**Security Agent (Sonnet)**
- Applies OWASP Top 10 (2021) thinking to TypeScript/Node.js diffs
- Focuses only on added lines (`+` prefix in diff)
- Produces `SecurityFinding[]` with CWE IDs, OWASP references, exact vulnerable code, and parameterised recommendations
- Severity scale: CRITICAL → HIGH → MEDIUM → LOW → INFO

**Logic Agent (Haiku)**
- Traces control flow mentally for each changed function
- Asks: what if this is null? what if the array is empty? what if the Promise rejects? what if this runs concurrently?
- Produces `LogicFinding[]` with `buggy_code`, `fix`, and a `test_case` describing exactly how to reproduce the bug
- Does not report security issues — those belong to the Security agent

**Style Agent (Haiku)**
- Reviews for maintainability, TypeScript strictness, naming, function design, dead code, and test quality
- Capped at 5 findings per file to prevent review fatigue
- Produces `StyleFinding[]` plus a `praise[]` array — positive observations are required, not optional
- Does not report bugs or security issues

---

### Stage 3 — Synthesiser (sequential, runs last)

The Synthesiser receives the combined output of all three specialist agents plus the Planner summary. It performs zero code analysis — its job is purely editorial.

**Responsibilities:**
- Determines the overall STATUS_LINE from the highest severity finding across all agents
- Deduplicates findings where Security and Logic flagged the same code
- Consolidates repeated patterns across files into single entries with multiple file references
- Enforces length budget: target under 3,500 characters
- Always includes a `### ✅ What's working well` section — reviews that only criticise get ignored

**Output:** A single GitHub-flavoured Markdown string ready to post as a PR comment.

Unlike every other agent, the Synthesiser does not return JSON. `callAgent` detects this via the `isSynthesiser` flag and returns the raw string directly.

---

## Agent Design

Each agent is defined by three things that never mix:

| Concern | Where it lives |
|---|---|
| Behaviour / persona / rules | `src/prompts/<agent>.ts` — exported string constant |
| Output shape | `src/types/agents.ts` — TypeScript interface |
| Model assignment | `MODEL_MAP` in `src/lib/callAgent.ts` |

Agents never call the Anthropic SDK directly. All calls go through `callAgent()`. This is enforced by convention: the SDK client (`anthropic`) is instantiated only in `callAgent.ts`.

---

## File Structure

```
MergeMind/
├── src/
│   ├── index.ts                    # Entry point — loads .env, calls runPRReview()
│   ├── orchestrator.ts             # Pipeline: Planner → parallel specialists → Synthesiser
│   │
│   ├── lib/
│   │   └── callAgent.ts            # Single SDK gateway — model routing, JSON retry, logging
│   │
│   ├── prompts/
│   │   ├── planner.ts              # PLANNER_SYSTEM_PROMPT
│   │   ├── security.ts             # SECURITY_SYSTEM_PROMPT
│   │   ├── logic.ts                # LOGIC_SYSTEM_PROMPT
│   │   ├── style.ts                # STYLE_SYSTEM_PROMPT
│   │   └── synthesiser.ts          # SYNTHESISER_SYSTEM_PROMPT
│   │
│   ├── types/
│   │   └── agents.ts               # All shared TypeScript types — no `any` allowed
│   │
│   ├── db/
│   │   ├── client.ts               # pg Pool singleton + insertAgentLog()
│   │   └── schema.sql              # CREATE TABLE agent_logs + indexes
│   │
│   └── tests/
│       ├── testAgent.ts            # CLI runner: loads fixture → calls agent → prints output
│       └── fixtures/
│           ├── planner-fixture.json
│           ├── security-fixture.json
│           ├── logic-fixture.json
│           ├── style-fixture.json
│           └── synthesiser-fixture.json
│
├── .claude/
│   ├── settings.json               # MCP server declarations (github, filesystem, postgres)
│   └── commands/
│       ├── review-pr.md            # /review-pr <PR number>
│       ├── test-agent.md           # /test-agent <agent name>
│       └── add-agent.md            # /add-agent <new agent name>
│
├── .env                            # Secret keys — never committed
├── package.json
└── tsconfig.json
```

---

## Data Flow

The data flowing through the pipeline is strictly typed at every boundary.

```
prDiff: string
prContext: PRContext
        │
        ▼
callAgent<PlannerOutput>('planner', ...)
        │
        ▼
PlannerOutput {
  pr_summary, overall_risk,
  security_batches: Batch[],
  logic_batches: Batch[],
  style_batches: Batch[],
  skip_files: string[]
}
        │
        ├──► Batch[] ──► callAgent<SecurityAgentOutput>('security', ...) ──► SecurityAgentOutput[]
        │
        ├──► Batch[] ──► callAgent<LogicAgentOutput>('logic', ...)     ──► LogicAgentOutput[]
        │
        └──► Batch[] ──► callAgent<StyleAgentOutput>('style', ...)     ──► StyleAgentOutput[]
                                                                                  │
                                              ┌───────────────────────────────────┘
                                              ▼
                         callAgent<string>('synthesiser', {
                           pr_context, planner_summary,
                           security_results, logic_results, style_results
                         })
                                              │
                                              ▼
                                     string (Markdown)
```

At no point is `any` used. Every `callAgent` call is generic: `callAgent<T>()` returns `Promise<T>`, and `T` is always one of the named interfaces from `src/types/agents.ts`.

---

## Type System

All types live in `src/types/agents.ts`. The key relationships:

```
RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

Batch {
  batch_id: string       — e.g. "sec-1", "logic-2"
  files: string[]        — file paths assigned to this batch
  focus_areas: string[]  — specific concerns from the Planner
  risk_level: RiskLevel
}

PlannerOutput {
  security_batches: Batch[]
  logic_batches: Batch[]
  style_batches: Batch[]
  skip_files: string[]
  overall_risk: RiskLevel
  error?: string         — only present if diff was unparseable
}

SecurityAgentOutput {
  findings: SecurityFinding[]
  planner_focus_validation: FocusValidation[]
  files_with_no_issues: string[]
}

LogicAgentOutput {
  findings: LogicFinding[]
  planner_focus_validation: FocusValidation[]
  files_with_no_issues: string[]
}

StyleAgentOutput {
  findings: StyleFinding[]
  praise: { file: string; note: string }[]
  files_with_no_issues: string[]
}

AgentLog {
  role, model, batch_id
  input_tokens, output_tokens, duration_ms
  timestamp: string (ISO 8601)
}
```

`FocusValidation` is the feedback loop: every focus_area the Planner emits must be explicitly confirmed or refuted by the downstream agent that received it. This prevents unverified Planner hypotheses from silently becoming findings.

---

## callAgent — The SDK Gateway

`src/lib/callAgent.ts` is the single point of contact with the Anthropic SDK. No other file imports from `@anthropic-ai/sdk`.

```
callAgent<T>(role, payload, batchId) → Promise<T>

1. Look up model from MODEL_MAP[role]
2. Look up system prompt from PROMPTS[role]
3. Call anthropic.messages.create()
4. Record AgentLog { role, model, batch_id, tokens, duration }
5. console.log the log + write to Postgres agent_logs
6. If role === 'synthesiser': return raw string
7. Otherwise:
   a. Strip any prose before the first '{' and after the last '}'
   b. JSON.parse()
   c. If parse fails: retry once with a correction turn
   d. If retry fails: throw typed error
8. Return parsed T
```

**JSON sanitisation:** Models occasionally prepend explanation text before the JSON object. `callAgent` defensively strips everything before the first `{` and after the last `}` before parsing. This handles ~95% of malformed responses.

**Retry logic:** On a `JSON.parse` failure, `callAgent` sends a second message in the same conversation: `"Your response was not valid JSON. Return only the JSON object, no other text."` This gives the model context about what went wrong and produces a clean response in the vast majority of cases. If the retry also fails, a typed error is thrown with the raw response truncated to 200 characters for debugging.

---

## Model Routing Strategy

| Agent | Model | Reason |
|---|---|---|
| Planner | `claude-haiku-4-5` | Structured decomposition — fast, low cost, no deep reasoning needed |
| Security | `claude-sonnet-4-6` | OWASP reasoning, CWE mapping, exploit analysis — needs full reasoning power |
| Logic | `claude-haiku-4-5` | Control flow tracing — Haiku handles this well at lower cost |
| Style | `claude-haiku-4-5` | Pattern matching and naming — fast, no deep inference needed |
| Synthesiser | `claude-sonnet-4-6` | Editorial judgement, deduplication, length management — benefits from Sonnet |

Using Haiku for the three volume agents (Planner, Logic, Style) cuts per-review cost by approximately 60% compared to running all agents on Sonnet. Sonnet is reserved for the two roles where deep reasoning directly affects finding quality.

---

## Database Layer

### Schema

```sql
CREATE TABLE agent_logs (
  id            BIGSERIAL PRIMARY KEY,
  role          TEXT        NOT NULL,   -- 'planner' | 'security' | ...
  model         TEXT        NOT NULL,   -- 'claude-haiku-4-5' | 'claude-sonnet-4-6'
  batch_id      TEXT        NOT NULL,   -- 'sec-1', 'logic-2', 'synthesiser', etc.
  input_tokens  INTEGER     NOT NULL,
  output_tokens INTEGER     NOT NULL,
  duration_ms   INTEGER     NOT NULL,
  timestamp     TIMESTAMPTZ NOT NULL
);

-- Query patterns supported by indexes:
-- SELECT ... WHERE role = 'security'          → agent_logs_role_idx
-- SELECT ... ORDER BY timestamp DESC LIMIT N  → agent_logs_timestamp_idx
```

### Client

`src/db/client.ts` exposes a lazy singleton `pg.Pool`. The pool is created on first call to `getPool()` and reused across all subsequent agent calls within a single pipeline run. Connection is established to Neon PostgreSQL over SSL.

`insertAgentLog()` is the only write function. It uses a parameterised query — `$1` through `$7` — with no string interpolation.

---

## MCP Integration

Three MCP servers are declared in `.claude/settings.json` and are available to Claude Code when operating in this project directory.

| Server | Package | Purpose |
|---|---|---|
| `github` | `@modelcontextprotocol/server-github` | Fetch PR diffs, post inline comments, read file history |
| `filesystem` | `@modelcontextprotocol/server-filesystem` | Read/write prompt files and review logs (scoped to `src/prompts` and `src/tests`) |
| `postgres` | `@modelcontextprotocol/server-postgres` | Query `agent_logs` table — inspect defect history per file path |

The filesystem server is intentionally scoped to two directories only. It cannot access `.env`, `node_modules`, or anything outside those paths.

Environment variables (`GITHUB_TOKEN`, `DATABASE_URL`) are passed to MCP servers via the `env` field in `settings.json` using `${VAR}` interpolation — they are never hardcoded.

---

## Slash Commands

Three slash commands are defined in `.claude/commands/`. They are invoked via `/command-name <args>` inside Claude Code.

### `/review-pr <PR number>`
Runs a full end-to-end review on a live GitHub PR:
1. Uses the GitHub MCP to fetch the PR diff and metadata
2. Calls `runPRReview()` from `src/orchestrator.ts`
3. Posts the returned Markdown as a PR review comment via GitHub MCP
4. Prints agent-log entries and estimated token cost

### `/test-agent <agent name>`
Tests a single agent in isolation using its fixture:
1. Loads `src/tests/fixtures/<agent>-fixture.json`
2. Calls `callAgent()` directly with that payload
3. Pretty-prints the JSON output (or Markdown for the synthesiser)
4. Prints token counts, duration, and estimated cost

### `/add-agent <name>`
Scaffolds a new agent into the system:
1. Creates `src/prompts/<name>.ts` with an empty prompt export
2. Adds the response type to `src/types/agents.ts`
3. Adds model routing and prompt import to `src/lib/callAgent.ts`
4. Creates `src/tests/<name>.test.ts` with a placeholder test
5. Shows the orchestrator wiring to add manually

---

## Environment Variables

| Variable | Used by | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | `src/lib/callAgent.ts` | Authenticates all Anthropic SDK calls |
| `GITHUB_TOKEN` | GitHub MCP server | Reads PR diffs, posts review comments |
| `DATABASE_URL` | `src/db/client.ts` | Neon PostgreSQL connection string |
| `UPSTASH_REDIS_URL` | Future use | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_TOKEN` | Future use | Upstash Redis authentication token |

All variables are loaded from `.env` via `import 'dotenv/config'` at the top of `src/index.ts`. The `.env` file is never committed — `.env.example` documents the required keys.

---

## Error Handling and Resilience

### SDK errors
Wrapped in a try/catch inside `callAgent`. Any Anthropic API error (rate limit, timeout, auth failure) is re-thrown as a typed `Error` with the agent role and original message.

### JSON parse failures
Handled with a one-shot retry. A second conversation turn tells the model what went wrong. If the retry also fails, a typed error is thrown with the raw response for debugging.

### Unparseable diffs
The Planner returns `{ error: "unparseable_diff", reason: "..." }` instead of throwing. The orchestrator checks `plan.error` immediately after the Planner call and returns an error message string instead of proceeding to the specialist agents.

### Parallel batch failures
If one batch in the parallel `Promise.all` throws, the entire `Promise.all` rejects and the pipeline stops. This is intentional: a partial review with missing security batches is worse than no review, as it creates false confidence.

### Database failures
`insertAgentLog()` can throw if the Postgres connection is unavailable. Currently this propagates up and fails the pipeline. A future improvement would be to fire-and-forget with a local fallback log file so an observability failure does not block the review from completing.

---

## Extending the System

### Adding a new agent

Follow the steps in `/add-agent` or manually:

1. **`src/prompts/<name>.ts`** — export `const <NAME>_SYSTEM_PROMPT`
2. **`src/types/agents.ts`** — add the finding interface and output interface
3. **`src/lib/callAgent.ts`** — add to `AgentRole` union, `PROMPTS` map, and `MODEL_MAP`
4. **`src/orchestrator.ts`** — add a `Promise.all` call in the correct pipeline stage, or insert a new sequential step
5. **`src/tests/fixtures/<name>-fixture.json`** — create a representative input payload

### Increasing batch size

The max of 8 files per batch is set by the Planner's system prompt, not code. Edit `PLANNER_SYSTEM_PROMPT` in `src/prompts/planner.ts` to change it. Keep the Tier 1 TPM limit (30k tokens/min for Sonnet) in mind — larger batches on security reviews can breach this under load.

### Adding Redis caching

The `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` environment variables are already present. The natural caching layer is between the orchestrator and `callAgent`: cache the `PlannerOutput` keyed by a hash of the PR diff so re-runs of the same PR do not re-invoke the Planner.

### Posting comments to GitHub

The GitHub MCP server is already wired. In `src/orchestrator.ts`, after `runPRReview()` returns the Markdown string, call the MCP `create_pull_request_review` tool with the string as the body. The `/review-pr` slash command already describes this flow.
