/**
 * MABP Coordinator
 * Manages build state and handles protocol messages
 */

import { BuildState, Component, ComponentStatus, ParsedMessage } from './types.js';
import { formatMessage, parseMessage } from './parser.js';

export interface CoordinatorConfig {
  progressTimeoutMs: number;  // Time before TIMEOUT (default: 10 min)
  claimExpiryMs: number;      // Claim expires without progress (default: 2 min)
  maxRetries: number;         // Max audit failures before reassign
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  progressTimeoutMs: 10 * 60 * 1000,
  claimExpiryMs: 2 * 60 * 1000,
  maxRetries: 3,
};

export class Coordinator {
  private state: BuildState;
  private config: CoordinatorConfig;
  private sendMessage: (msg: string) => void;

  constructor(
    specUrl: string,
    components: Array<{ name: string; dependencies: string[] }>,
    sendMessage: (msg: string) => void,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sendMessage = sendMessage;

    this.state = {
      specUrl,
      components: new Map(),
      startedAt: Date.now(),
    };

    // Initialize components
    for (const comp of components) {
      this.state.components.set(comp.name.toLowerCase(), {
        name: comp.name,
        status: 'pending',
        dependencies: comp.dependencies.map(d => d.toLowerCase()),
        retryCount: 0,
      });
    }
  }

  /**
   * Broadcast available tasks
   */
  broadcastTasks(): void {
    const available = this.getAvailableComponents();
    const msg = formatMessage('TASKS', this.state.specUrl, ...available.map(c => c.name));
    this.sendMessage(msg);
  }

  /**
   * Get components that can be claimed (pending, deps met)
   */
  getAvailableComponents(): Component[] {
    const result: Component[] = [];
    for (const comp of this.state.components.values()) {
      if (comp.status === 'pending' && this.dependenciesMet(comp)) {
        result.push(comp);
      }
    }
    return result;
  }

  /**
   * Check if all dependencies are merged
   */
  private dependenciesMet(comp: Component): boolean {
    for (const depName of comp.dependencies) {
      const dep = this.state.components.get(depName);
      if (!dep || dep.status !== 'merged') {
        return false;
      }
    }
    return true;
  }

  /**
   * Handle incoming message
   */
  handleMessage(content: string, fromAgent: string): void {
    const parsed = parseMessage(content, fromAgent);
    if (!parsed) return;

    switch (parsed.type) {
      case 'CLAIM':
        this.handleClaim(parsed);
        break;
      case 'PROGRESS':
        this.handleProgress(parsed);
        break;
      case 'READY':
        this.handleReady(parsed);
        break;
      case 'BLOCKED':
        this.handleBlocked(parsed);
        break;
      case 'ABORT':
        this.handleAbort(parsed);
        break;
      case 'AUDIT':
        this.handleAudit(parsed);
        break;
    }
  }

  private handleClaim(msg: ParsedMessage): void {
    const comp = this.state.components.get(msg.component!);

    if (!comp) {
      this.sendMessage(formatMessage('REJECT', msg.component!, 'component not found'));
      return;
    }

    if (comp.status !== 'pending') {
      this.sendMessage(formatMessage('REJECT', msg.component!, `already ${comp.status} by ${comp.assignee || 'another agent'}`));
      return;
    }

    if (!this.dependenciesMet(comp)) {
      const unmet = comp.dependencies.filter(d => {
        const dep = this.state.components.get(d);
        return !dep || dep.status !== 'merged';
      });
      this.sendMessage(formatMessage('REJECT', msg.component!, `dependencies not met: ${unmet.join(', ')}`));
      return;
    }

    // Assign component
    comp.status = 'claimed';
    comp.assignee = msg.agent;
    comp.claimedAt = Date.now();

    this.sendMessage(formatMessage('ACK', msg.component!, msg.agent!));
  }

  private handleProgress(msg: ParsedMessage): void {
    const comp = this.state.components.get(msg.component!);
    if (!comp || comp.assignee !== msg.agent) return;

    comp.status = 'building';
    comp.lastProgress = Date.now();
  }

  private handleReady(msg: ParsedMessage): void {
    const comp = this.state.components.get(msg.component!);
    if (!comp || comp.assignee !== msg.agent) return;

    comp.status = 'ready';
    comp.prUrl = msg.value;
    // Auditor should pick this up
  }

  private handleBlocked(msg: ParsedMessage): void {
    // Builder is waiting on a dependency - just log for now
    console.log(`[Coordinator] ${msg.agent} blocked on ${msg.value} for ${msg.component}`);
  }

  private handleAbort(msg: ParsedMessage): void {
    const comp = this.state.components.get(msg.component!);
    if (!comp || comp.assignee !== msg.agent) return;

    // Release the component
    comp.status = 'pending';
    comp.assignee = undefined;
    comp.claimedAt = undefined;

    // Notify others
    this.broadcastTasks();
  }

  private handleAudit(msg: ParsedMessage): void {
    const comp = this.state.components.get(msg.component!);
    if (!comp) return;

    if (msg.value === 'PASS') {
      comp.status = 'merged';
      this.sendMessage(formatMessage('MERGED', msg.component!));

      // Check if any blocked components are now available
      this.broadcastTasks();

      // Check if build is complete
      if (this.isComplete()) {
        this.sendMessage(`BUILD COMPLETE ${this.state.specUrl}`);
      }
    } else {
      // FAIL
      comp.retryCount++;
      if (comp.retryCount >= this.config.maxRetries) {
        comp.status = 'pending';
        comp.assignee = undefined;
        this.sendMessage(formatMessage('RETRY', msg.component!));
      } else {
        comp.status = 'building'; // Back to building for retry
      }
    }
  }

  /**
   * Check if all components are merged
   */
  isComplete(): boolean {
    for (const comp of this.state.components.values()) {
      if (comp.status !== 'merged') return false;
    }
    return true;
  }

  /**
   * Check for timeouts (call periodically)
   */
  checkTimeouts(): void {
    const now = Date.now();

    for (const comp of this.state.components.values()) {
      // Check claim expiry
      if (comp.status === 'claimed' && comp.claimedAt) {
        if (now - comp.claimedAt > this.config.claimExpiryMs) {
          comp.status = 'pending';
          comp.assignee = undefined;
          comp.claimedAt = undefined;
          this.sendMessage(formatMessage('TIMEOUT', comp.name));
        }
      }

      // Check progress timeout
      if (comp.status === 'building' && comp.lastProgress) {
        if (now - comp.lastProgress > this.config.progressTimeoutMs) {
          comp.status = 'pending';
          comp.assignee = undefined;
          comp.lastProgress = undefined;
          this.sendMessage(formatMessage('TIMEOUT', comp.name));
        }
      }
    }
  }

  /**
   * Get current state for debugging
   */
  getState(): BuildState {
    return this.state;
  }
}
