# MergeMind Risk Register

| Risk ID | Category | Description | Severity | Likelihood | Mitigation Strategy |
|---|---|---|---|---|---|
| **RSK-01** | AI / Quality | Model Hallucination: Reporting non-existent vulnerabilities or wrong line numbers | HIGH | HIGH | Source Evidence Verification Engine: Cross-checks reported vulnerable lines against actual diff and original file content before publication. |
| **RSK-02** | Security | Prompt Injection via PR diff or description (e.g. instructing model to approve or ignore flaws) | CRITICAL | HIGH | Rigid untrusted boundary delimiters (`<<<UNTRUSTED_PR_DIFF>>>`), explicit system role priority, and strict refusal to execute instructions inside PR content. |
| **RSK-03** | Operations | GitHub API / Gemini API Rate Limiting (429 / 529) | MEDIUM | MEDIUM | Exponential backoff with full jitter, per-batch concurrency limits (max 3), and durable job queue with retry counts. |
| **RSK-04** | Cost | Unbounded token consumption on massive PRs or recursive agentic loops | HIGH | MEDIUM | Hard budget manager ($0.25 default per review), max diff chunk limits (max 8 files/batch), max 2 agentic investigation loops. |
| **RSK-05** | Security | Webhook Spoofing / Tampering | CRITICAL | LOW | Strict HMAC-SHA256 signature verification over raw request body using constant-time comparison (`crypto.timingSafeEqual`). |
| **RSK-06** | Data Integrity | Stale Review Race: User pushes a new commit while older review is executing | MEDIUM | MEDIUM | Compare head commit SHA prior to posting review comments. Discard comments if SHA does not match current PR head. |
| **RSK-07** | Governance | Accidental PR Auto-Approval / Auto-Merge | CRITICAL | LOW | Strict architectural guardrail: MergeMind only posts comments, never calls the PR approve or merge GitHub API endpoints. |
