import { query, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { HookCallback, PreToolUseHookInput, PostToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import {getCustomerTool,lookupOrderTool, processRefundTool, escalateToHumanTool} from "../../../shared/tools/csr-tools.js";
import { csrSystemPrompt } from "../../../shared/prompts/csr-system-prompt.js";


const csrServer = createSdkMcpServer({
    name:"davidleecsr",
    version:"1.0.0",
    tools:[getCustomerTool,lookupOrderTool, processRefundTool, escalateToHumanTool]
})

// ─── PreToolUse Hook: Refund Threshold Enforcement ─────────────────────────
const preToolUseHook: HookCallback = async (_input) => {
    const input = _input as PreToolUseHookInput;
    if (input.tool_name === 'mcp__davidleecsr__process_refund') {
        const amount = (input.tool_input as Record<string, unknown> | undefined)?.amount;
        if (typeof amount === 'number' && amount > 500) {
            console.log(`  [HOOK:PreToolUse] BLOCKED refund of $${amount} (limit: $500)`);
            return {
                hookSpecificOutput: {
                    hookEventName: 'PreToolUse' as const,
                    permissionDecision: 'deny' as const,
                    permissionDecisionReason: `Refund $${amount} exceeds $500 limit. Escalate instead.`
                }
            };
        }
    }
    return { hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'allow' as const } };
};

// ─── PostToolUse Hook: Log Tool Results ────────────────────────────────────
const postToolUseHook: HookCallback = async (_input) => {
    const input = _input as PostToolUseHookInput;
    console.log(`  [HOOK:PostToolUse] ${input.tool_name} completed`);
    return {};
};

const postToolUseHook2: HookCallback = async (_input) => {
    console.log(`  [HOOK:PostToolUse] ${_input} completed`);
    return {};
};

async function runAgent(userMessage: string): Promise<void> {
    console.log('prompt: ', userMessage, '\n')

    for await (const message of query({
        prompt: userMessage,
        options: {
            systemPrompt: csrSystemPrompt,
            mcpServers: {
                csr: csrServer
            },
            allowedTools: [
                'mcp__davidleecsr__get_customer',
                'mcp__davidleecsr__lookup_order',
                'mcp__davidleecsr__process_refund',
                'mcp__davidleecsr__escalate_to_human'
            ],
            maxTurns: 15,
            hooks: {
                PreToolUse: [
                    { hooks: [preToolUseHook] }
                ],
                PostToolUse: [
                    { hooks: [postToolUseHook] }
                ],
            }
        }
    })) {
        if (message.type === 'result' && message.subtype === 'success') {
            console.log('result: ', message.result, '\n')
        }
    }
}

runAgent("please return the order ORD-5001, and the user details for customerId: C-1001 associated with that order ")