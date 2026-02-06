/**
 * MABP Coordinator Types
 */

export type ComponentStatus =
  | 'pending'    // Available to claim
  | 'claimed'    // Claimed, waiting for progress
  | 'building'   // In progress
  | 'ready'      // PR created, waiting for audit
  | 'auditing'   // Being audited
  | 'merged'     // Complete
  | 'failed';    // Failed audit 3x

export interface Component {
  name: string;
  status: ComponentStatus;
  assignee?: string;        // Agent ID
  dependencies: string[];   // Component names this depends on
  prUrl?: string;
  claimedAt?: number;
  lastProgress?: number;
  retryCount: number;
}

export interface BuildState {
  specUrl: string;
  components: Map<string, Component>;
  startedAt: number;
}

export type MessageType =
  | 'TASKS'
  | 'CLAIM'
  | 'ACK'
  | 'REJECT'
  | 'PROGRESS'
  | 'BLOCKED'
  | 'READY'
  | 'AUDIT'
  | 'MERGED'
  | 'TIMEOUT'
  | 'RETRY'
  | 'ABORT';

export interface ParsedMessage {
  type: MessageType;
  component?: string;
  agent?: string;
  value?: string;  // percentage, pr-url, reason, etc.
}
