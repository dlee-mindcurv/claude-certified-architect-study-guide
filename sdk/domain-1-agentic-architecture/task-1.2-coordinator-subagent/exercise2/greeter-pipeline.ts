/**
 * Greeter Pipeline — Coordinator Entry File
 *
 * Sequential agent pipeline using @anthropic-ai/claude-agent-sdk:
 *   1. jamaican-greeter transforms user input into a Jamaican Patois greeting
 *   2. pirate-greeter transforms the Jamaican greeting into Pirate English
 *   3. Coordinator appends a short poem about pizza
 *
 * Demonstrates: coordinator-subagent pattern with strict sequential execution.
 *
 * Usage:
 *   npx tsx sdk/domain-1-agentic-architecture/task-1.2-coordinator-subagent/exercise2/greeter-pipeline.ts
 *   npx tsx sdk/domain-1-agentic-architecture/task-1.2-coordinator-subagent/exercise2/greeter-pipeline.ts "Hey there!"
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { jamaicaGreeterDefinition } from './jamaican-greeter.js';
import { pirateGreeterDefinition } from './pirate-greeter.js';
import {pirateMoviesDefinition} from "./pirate-movies.js";

const coordinatorSystemPrompt = `You are a greeting pipeline coordinator. Your job is to run a web search agent in parallel, and chain two greeting agents in strict sequential order, then finish with a pizza poem.

## Execution Steps (Step 2,3,4 must be sequential — do NOT run in parallel)

1. **Step1 - (Run in parallel) Pirate Movie**:  Invoke the 'pirate-movies' subagent;  

2. **Step 2 — Jamaican Greeter**: Invoke the 'jamaican-greeter' subagent with the user's original message. Wait for its complete response.

3. **Step 3 — Pirate Greeter**: Invoke the 'pirate-greeter' subagent, passing the FULL response from Step 1 as the prompt. Wait for its complete response.

4. **Step 4 — Pizza Poem**: After receiving the pirate greeting, write a short original poem about pizza (4-6 lines).

## Output Format
Display the pirate-movies's json response from Step 1, in the console as formatted table.
Display the pirate-greeter's response from Step 2, then the pizza poem.

## Rules
- You MUST invoke both greeting subagents — do NOT generate greetings yourself.
- 'pirate-greeter' Agent MUST wait for 'jamaican-greeter' Agent to complete before starting.
- The pirate-greeter must receive the jamaican-greeter's actual output, not a summary.
- The pizza poem is the only part you write yourself.`;

async function runPipeline(userMessage: string): Promise<string> {
  console.log('\n' + '='.repeat(60));
  console.log('Greeter Pipeline — Agent SDK');
  console.log('='.repeat(60));
  console.log(`\nInput: ${userMessage}\n`);

  let finalText = '';

  for await (const message of query({
    prompt: userMessage,
    options: {
      systemPrompt: coordinatorSystemPrompt,
      agents: {
        'jamaican-greeter': jamaicaGreeterDefinition,
        'pirate-greeter': pirateGreeterDefinition,
        'pirate-movies-definition': pirateMoviesDefinition
      },
      allowedTools: [],
      maxTurns: 10,
    },
  })) {
    if (message.type === 'result' && message.subtype === 'success') {
      finalText += message.result;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('FINAL OUTPUT');
  console.log('='.repeat(60));
  console.log(finalText);
  return finalText;
}

const userPrompt = process.argv[2] ?? 'Hello Tracy, how are you doing today?';

runPipeline(userPrompt).catch(console.error);
