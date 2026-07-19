Scaffold a new agent called $ARGUMENTS:
1. Create src/prompts/$ARGUMENTS.ts with an empty system prompt export named
   $ARGUMENTS_SYSTEM_PROMPT (uppercase, underscores)
2. Add the response type interface to src/types/agents.ts following the pattern
   of the existing SecurityAgentOutput interface
3. Add the model routing entry and prompt import to src/lib/callAgent.ts
4. Create src/tests/$ARGUMENTS.test.ts with one placeholder test
5. Show me what to add to src/orchestrator.ts to wire it into the pipeline
