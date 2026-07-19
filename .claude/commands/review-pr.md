Run a full PR review on the PR number given in $ARGUMENTS.
1. Use the GitHub MCP to fetch the PR diff and metadata from the repo
2. Call runPRReview() from src/orchestrator.ts with the diff and context
3. Post the returned Markdown string as a PR review comment via GitHub MCP
4. Print the agent-log entries and total token cost when done
