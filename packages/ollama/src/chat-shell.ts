// Chat shell — interactive REPL for conversational engine use.
// Runs a readline loop: prompt → engine.process → print → repeat.
// Supports /commands for meta-actions.

import { createInterface } from 'node:readline';
import type { OllamaTextClient } from './client.js';
import { createChatEngine, type ChatEngine } from './chat-engine.js';
import { createTranscript, addToTranscript, saveTranscript, defaultTranscriptPath } from './chat-transcript.js';
import type { ChatTranscript } from './chat-types.js';
import { formatContextSnapshot, formatSources } from './chat-context-browser.js';
import { formatLoadoutRoute } from './chat-loadout.js';

export type ChatShellOptions = {
  client: OllamaTextClient;
  projectRoot: string;
  maxMemory?: number;
  saveTranscripts?: boolean;
  transcriptDir?: string;
  /** Enable loadout-guided context routing. */
  loadoutEnabled?: boolean;
};

export async function runChatShell(options: ChatShellOptions): Promise<void> {
  const { client, projectRoot, maxMemory, saveTranscripts = false, loadoutEnabled = false } = options;

  const engine = createChatEngine({ client, projectRoot, maxMemory, loadoutEnabled });
  const transcript = createTranscript(null);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'chat> ',
  });

  console.log('ai-rpg-engine chat — type your question, /help for commands, /quit to exit.');
  console.log('');
  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    // Slash commands
    if (trimmed.startsWith('/')) {
      const handled = await handleSlashCommand(trimmed, engine, transcript, projectRoot, saveTranscripts);
      if (handled === 'quit') {
        if (saveTranscripts && transcript.messages.length > 0) {
          const path = defaultTranscriptPath(projectRoot, transcript.sessionName);
          await saveTranscript(path, transcript);
          console.log(`Transcript saved to ${path}`);
        }
        rl.close();
        return;
      }
      rl.prompt();
      return;
    }

    // Process through chat engine
    try {
      const now = new Date().toISOString();
      addToTranscript(transcript, { role: 'user', content: trimmed, timestamp: now });

      const response = await engine.process(trimmed);
      console.log('');
      console.log(response);
      console.log('');

      addToTranscript(transcript, { role: 'assistant', content: response, timestamp: new Date().toISOString() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${msg}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    // Handled above in /quit — this covers Ctrl+C
  });
}

async function handleSlashCommand(
  input: string,
  engine: ChatEngine,
  transcript: ChatTranscript,
  projectRoot: string,
  saveTranscripts: boolean,
): Promise<'quit' | 'handled'> {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case 'quit':
    case 'exit':
    case 'q':
      return 'quit';

    case 'help':
    case 'h':
      console.log('');
      console.log('/help           Show this help');
      console.log('/quit           Exit chat');
      console.log('/save           Save transcript now');
      console.log('/memory         Show conversation memory stats');
      console.log('/clear          Clear conversation memory');
      console.log('/pending        Show pending write, if any');
      console.log('/context        Show what context the last response used');
      console.log('/sources        Show condensed source list from last retrieval');
      console.log('/loadout        Show loadout routing from last response');
      console.log('');
      return 'handled';

    case 'save': {
      if (transcript.messages.length === 0) {
        console.log('Nothing to save yet.');
        return 'handled';
      }
      const path = defaultTranscriptPath(projectRoot, transcript.sessionName);
      await saveTranscript(path, transcript);
      console.log(`Transcript saved to ${path}`);
      return 'handled';
    }

    case 'memory': {
      const mem = engine.memory;
      console.log(`Messages: ${mem.messages.length} / ${mem.maxMessages}`);
      if (mem.sessionName) console.log(`Session: ${mem.sessionName}`);
      return 'handled';
    }

    case 'clear':
      engine.memory.messages.length = 0;
      engine.pendingWrite = null;
      console.log('Memory cleared.');
      return 'handled';

    case 'pending':
      if (engine.pendingWrite) {
        console.log(`Pending write: ${engine.pendingWrite.suggestedPath}`);
        console.log(`Label: ${engine.pendingWrite.label}`);
        console.log(`Content length: ${engine.pendingWrite.content.length} chars`);
      } else {
        console.log('No pending write.');
      }
      return 'handled';

    case 'context':
      if (engine.lastContextSnapshot) {
        console.log(formatContextSnapshot(engine.lastContextSnapshot));
      } else {
        console.log('No context snapshot yet. Send a message first.');
      }
      return 'handled';

    case 'sources':
      if (engine.lastContextSnapshot) {
        console.log(formatSources(engine.lastContextSnapshot));
      } else {
        console.log('No context snapshot yet. Send a message first.');
      }
      return 'handled';

    case 'loadout':
      if (engine.lastLoadoutPlan) {
        console.log(formatLoadoutRoute(engine.lastLoadoutPlan));
      } else {
        console.log('No loadout plan yet. Send a message first (loadout must be enabled).');
      }
      return 'handled';

    default:
      console.log(`Unknown command: /${cmd}. Type /help for available commands.`);
      return 'handled';
  }
}
