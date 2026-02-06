/**
 * MABP Message Parser
 * Parses protocol messages from chat
 */

import { ParsedMessage, MessageType } from './types.js';

const MESSAGE_PATTERNS: [MessageType, RegExp][] = [
  ['CLAIM', /^(?:\*\*)?CLAIM\s+(\S+)(?:\*\*)?/i],
  ['PROGRESS', /^(?:\*\*)?PROGRESS\s+(\S+)\s+(\d+)%?(?:\*\*)?/i],
  ['READY', /^(?:\*\*)?READY\s+(\S+)(?:\s+(\S+))?(?:\*\*)?/i],
  ['BLOCKED', /^(?:\*\*)?BLOCKED\s+(\S+)\s+(\S+)(?:\*\*)?/i],
  ['ABORT', /^(?:\*\*)?ABORT\s+(\S+)(?:\s+(.+))?(?:\*\*)?/i],
  ['AUDIT', /^(?:\*\*)?AUDIT\s+(\S+)\s+(PASS|FAIL)(?:\s+(.+))?(?:\*\*)?/i],
];

/**
 * Parse a chat message for MABP protocol commands
 */
export function parseMessage(content: string, fromAgent: string): ParsedMessage | null {
  const trimmed = content.trim();

  for (const [type, pattern] of MESSAGE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        type,
        component: match[1]?.toLowerCase(),
        agent: fromAgent,
        value: match[2] || match[3],
      };
    }
  }

  return null;
}

/**
 * Format an outgoing protocol message
 */
export function formatMessage(type: MessageType, ...args: string[]): string {
  switch (type) {
    case 'TASKS':
      return `TASKS ${args[0]}\nAvailable components: ${args.slice(1).join(', ')}`;
    case 'ACK':
      return `ACK ${args[0]} ${args[1]}`;
    case 'REJECT':
      return `REJECT ${args[0]} "${args[1]}"`;
    case 'MERGED':
      return `MERGED ${args[0]}`;
    case 'TIMEOUT':
      return `TIMEOUT ${args[0]}`;
    default:
      return `${type} ${args.join(' ')}`;
  }
}
