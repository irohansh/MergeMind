Test a single agent in isolation. $ARGUMENTS is the agent name (planner, security,
logic, style, or synthesiser).
1. Load the sample payload from src/tests/fixtures/$ARGUMENTS-fixture.json
2. Call callAgent() from src/lib/callAgent.ts with that payload
3. Pretty-print the JSON output (or Markdown for synthesiser)
4. Print input tokens, output tokens, duration, and estimated cost at the end
