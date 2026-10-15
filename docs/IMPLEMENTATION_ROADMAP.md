# MergeMind Implementation Roadmap

## Overview
This roadmap outlines the systematic build from ground up to production readiness.

---

### Milestone 1: Foundation & Project Structure (Current)
- [x] Analyze codebase and plan architectural upgrade
- [x] Upgrade dependencies: Zod runtime validation, Vitest test suite, Google GenAI SDK, Octokit
- [x] Create persistent tracking files (`MERGEMIND_EXECUTION_STATE.md`, `ARCHITECTURE.md`, `RISK_REGISTER.md`, `WORK_LOG.md`)
- [ ] Establish clean modular directory layout under `src/` and `tests/`

### Milestone 2: Configuration & AI Provider Gateway
- [ ] Create `src/config/env.ts` using Zod schema for type-safe environment loading
- [ ] Define `AIProvider` contract (`src/providers/aiProvider.ts`)
- [ ] Implement `GoogleGeminiProvider` (`src/providers/geminiProvider.ts`) supporting `gemini-2.5-flash` and `gemini-2.5-pro` with rate limit exponential backoff
- [ ] Implement `MockAIProvider` (`src/providers/mockProvider.ts`) for zero-cost, deterministic local and CI testing

### Milestone 3: Diff Processing & Agent Contracts
- [ ] Implement `UnifiedDiffParser` (`src/github/diffParser.ts`) to extract additions, deletions, line coordinates, and hunk positions
- [ ] Define strict Zod output schemas for Planner, Security, Logic, Style, and Synthesiser agents (`src/agents/schemas.ts`)
- [ ] Implement specialist agents with prompt injection defenses and strict schema enforcement

### Milestone 4: Bounded Agentic Orchestrator & Evidence Engine
- [ ] Build `EvidenceVerificationEngine` (`src/security/evidenceVerification.ts`) to validate reported code lines against real source code
- [ ] Build Agentic Tools (`src/orchestrator/tools.ts`): snippet reader, line range validator, syntax checker
- [ ] Implement Orchestrator State Machine (`src/orchestrator/stateMachine.ts`) with bounded investigation loops
- [ ] Implement `BudgetManager` (`src/orchestrator/budgetManager.ts`) for cost and token caps

### Milestone 5: PostgreSQL Database & Persistence
- [ ] Implement database client with TLS verification (`src/db/connection.ts`)
- [ ] Create full database schema (`src/db/schema.sql`) and programmatic migrations (`src/db/migrations.ts`)
- [ ] Implement repositories for reviews, findings, agent logs, and job queue

### Milestone 6: GitHub Integration, Webhooks & Job Queue
- [ ] Implement HMAC-SHA256 signature verification and webhook parser (`src/github/webhookHandler.ts`)
- [ ] Build durable job queue and worker recovery mechanism (`src/queue/jobQueue.ts`, `src/queue/worker.ts`)
- [ ] Implement GitHub comment publisher with inline comment position mapping and duplicate prevention (`src/github/commentPublisher.ts`)

### Milestone 7: Comprehensive Testing Suite
- [ ] Unit tests for diff parser, evidence verifier, prompt injection guard, and config
- [ ] Integration tests for orchestrator state machine, agent tool usage, and budget enforcement
- [ ] Security tests for webhook HMAC verification, malicious diffs, and prompt injection attempts
- [ ] End-to-end tests for full PR pipeline execution

### Milestone 8: Observability, Health Server & CI
- [ ] Build structured JSON logger with correlation IDs (`src/observability/logger.ts`)
- [ ] Build lightweight HTTP server for `/health`, `/metrics`, and `/webhook` (`src/observability/healthServer.ts`)
- [ ] Setup GitHub Actions CI workflow (`.github/workflows/ci.yml`)
