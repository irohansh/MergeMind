import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { callAgent } from '../lib/callAgent.js';
import type {
  PlannerOutput,
  SecurityAgentOutput,
  LogicAgentOutput,
  StyleAgentOutput,
} from '../types/agents.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

type AgentName = 'planner' | 'security' | 'logic' | 'style' | 'synthesiser';

if (process.argv.includes('--dry-run')) {
  process.env.DRY_RUN = 'true';
}

const nonFlagArgs = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const agent = nonFlagArgs[0] as AgentName | undefined;
const validAgents: AgentName[] = ['planner', 'security', 'logic', 'style', 'synthesiser'];

if (!agent || !validAgents.includes(agent)) {
  console.error(`Usage: npx tsx src/tests/testAgent.ts <agent> [--dry-run]\nAgents: ${validAgents.join(', ')}`);
  process.exit(1);
}

const fixturePath = join(__dirname, 'fixtures', `${agent}-fixture.json`);
const payload = JSON.parse(readFileSync(fixturePath, 'utf8')) as object;

console.log(`\nTesting agent: ${agent}`);
console.log(`Fixture: ${fixturePath}\n`);

const start = Date.now();

type AgentResult = PlannerOutput | SecurityAgentOutput | LogicAgentOutput | StyleAgentOutput | string;

callAgent<AgentResult>(agent, payload, `test-${agent}`)
  .then(result => {
    const duration = Date.now() - start;
    console.log('\n--- Output ---\n');
    if (typeof result === 'string') {
      console.log(result);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    console.log(`\n--- Done in ${duration}ms ---`);
  })
  .catch(err => {
    console.error('Agent error:', (err as Error).message);
    process.exit(1);
  });
