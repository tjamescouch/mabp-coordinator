#!/usr/bin/env node
/**
 * MABP Coordinator CLI
 *
 * Usage:
 *   mabp-coord --spec <path-or-url> [--channel #build]
 *
 * The coordinator reads component definitions from an owl spec directory
 * and manages the build process via AgentChat messages.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { Coordinator } from './coordinator.js';

interface ComponentDef {
  name: string;
  dependencies: string[];
}

/**
 * Parse an owl spec directory to extract components and dependencies
 */
function parseOwlSpec(specPath: string): ComponentDef[] {
  const componentsDir = join(specPath, 'components');

  if (!existsSync(componentsDir)) {
    console.error(`Components directory not found: ${componentsDir}`);
    process.exit(1);
  }

  const components: ComponentDef[] = [];
  const files = readdirSync(componentsDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const name = basename(file, '.md');
    const content = readFileSync(join(componentsDir, file), 'utf-8');

    // Parse dependencies from "depends on:" section
    const dependencies: string[] = [];
    const depsMatch = content.match(/depends on:\s*\n([\s\S]*?)(?:\n##|\n\n|$)/i);

    if (depsMatch) {
      const depsSection = depsMatch[1];
      // Look for component references (words that match other component names)
      const depLines = depsSection.split('\n').filter(l => l.trim().startsWith('-'));
      for (const line of depLines) {
        // Extract component name from lines like "- greeter: greet function"
        const match = line.match(/-\s*(\w+):/);
        if (match && match[1].toLowerCase() !== 'none') {
          dependencies.push(match[1].toLowerCase());
        }
      }
    }

    components.push({ name, dependencies });
  }

  return components;
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let specPath = '';
  let channel = '#general';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--spec' && args[i + 1]) {
      specPath = args[++i];
    } else if (args[i] === '--channel' && args[i + 1]) {
      channel = args[++i];
    }
  }

  if (!specPath) {
    console.log('MABP Coordinator');
    console.log('');
    console.log('Usage: mabp-coord --spec <path> [--channel #build]');
    console.log('');
    console.log('Options:');
    console.log('  --spec     Path to owl spec directory');
    console.log('  --channel  AgentChat channel (default: #general)');
    console.log('');
    console.log('Example:');
    console.log('  mabp-coord --spec ./owl/examples/hello-owl');
    process.exit(0);
  }

  // Parse spec
  console.log(`Parsing spec: ${specPath}`);
  const components = parseOwlSpec(specPath);

  if (components.length === 0) {
    console.error('No components found in spec');
    process.exit(1);
  }

  console.log(`Found ${components.length} components:`);
  for (const comp of components) {
    const deps = comp.dependencies.length > 0
      ? ` (depends on: ${comp.dependencies.join(', ')})`
      : ' (no deps)';
    console.log(`  - ${comp.name}${deps}`);
  }

  // Create coordinator with console output (for now)
  // In production, this would integrate with AgentChat
  const coordinator = new Coordinator(
    specPath,
    components,
    (msg) => console.log(`[SEND ${channel}] ${msg}`)
  );

  // Broadcast initial tasks
  console.log('\nStarting coordinator...\n');
  coordinator.broadcastTasks();

  // Interactive mode: read messages from stdin
  console.log('\nEnter messages (format: @agent-id message):');
  console.log('Example: @builder-1 CLAIM greeter\n');

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  rl.prompt();

  rl.on('line', (line: string) => {
    const match = line.match(/^(@\S+)\s+(.+)$/);
    if (match) {
      const [, agent, message] = match;
      coordinator.handleMessage(message, agent);
    } else if (line.trim()) {
      console.log('Format: @agent-id message');
    }
    rl.prompt();
  });

  // Check timeouts every 30 seconds
  setInterval(() => {
    coordinator.checkTimeouts();
  }, 30000);
}

main().catch(console.error);
