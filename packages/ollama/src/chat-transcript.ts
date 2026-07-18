// Transcript persistence — save /load chat sessions.
// Transcripts are line-delimited JSON (one message per line).
// Chat engine calls save() after each exchange. Reads are on demand.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { withinRoot } from './apply-preview.js';
import type { ChatMessage, ChatTranscript } from './chat-types.js';

export function createTranscript(sessionName: string | null): ChatTranscript {
  return {
    sessionName: sessionName ?? 'unnamed',
    startedAt: new Date().toISOString(),
    messages: [],
  };
}

export function addToTranscript(transcript: ChatTranscript, message: ChatMessage): void {
  transcript.messages.push(message);
}

/** Default transcript path: <projectRoot>/.ai-transcripts/<slug>-<date>.jsonl */
export function defaultTranscriptPath(projectRoot: string, sessionName: string | null): string {
  const slug = (sessionName ?? 'chat').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  return join(projectRoot, '.ai-transcripts', `${slug}-${date}.jsonl`);
}

/**
 * Save transcript as JSONL (one JSON object per line).
 *
 * Sandboxed to `projectRoot` (default: process.cwd()) via the same
 * withinRoot() predicate apply-preview.ts's generatePreview/applyConfirmed
 * and the CLI's --write flag use for every other AI-output-to-disk path in
 * this package (v2.6 audit F-2992b0cf). saveTranscript/loadTranscript are
 * exported from the package's public index.ts, so a caller-supplied `path`
 * must be confined HERE, not merely by caller discipline — today's only
 * production call site (chat-shell.ts) always derives `path` from
 * defaultTranscriptPath(), which is already inside the sandbox.
 */
export async function saveTranscript(
  path: string,
  transcript: ChatTranscript,
  projectRoot?: string,
): Promise<string> {
  const resolved = resolve(path);
  if (!withinRoot(resolved, projectRoot)) {
    return `Error: target path escapes project root (${resolved})`;
  }

  const header = JSON.stringify({
    _type: 'transcript',
    sessionName: transcript.sessionName,
    startedAt: transcript.startedAt,
    messageCount: transcript.messages.length,
  });

  const lines = [header];
  for (const msg of transcript.messages) {
    lines.push(JSON.stringify({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      ...(msg.actions?.length ? { actions: msg.actions.map(a => ({ command: a.command, status: a.status })) } : {}),
    }));
  }

  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, lines.join('\n') + '\n', 'utf-8');
  return resolved;
}

/**
 * Load a transcript from a JSONL file.
 *
 * Same project-root sandbox as saveTranscript() (v2.6 audit F-2992b0cf): a
 * path outside `projectRoot` is treated the same as "not found" — rejected
 * BEFORE the read, so this can never become a file-existence/content oracle
 * for arbitrary on-disk paths outside the project.
 */
export async function loadTranscript(path: string, projectRoot?: string): Promise<ChatTranscript | null> {
  const resolved = resolve(path);
  if (!withinRoot(resolved, projectRoot)) return null;

  let raw: string;
  try {
    raw = await readFile(resolved, 'utf-8');
  } catch {
    return null;
  }

  const lines = raw.trim().split('\n').filter(l => l.length > 0);
  if (lines.length === 0) return null;

  // A malformed header means we can't trust the file's metadata — honor the
  // documented `ChatTranscript | null` contract and bail rather than throw.
  let header: { sessionName?: string; startedAt?: string };
  try {
    header = JSON.parse(lines[0]) as { sessionName?: string; startedAt?: string };
  } catch {
    return null;
  }
  const messages: ChatMessage[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Skip a corrupt line instead of throwing — one bad line shouldn't sink
    // the whole transcript (contract: never throw, return null on total failure).
    let parsed: { role?: ChatMessage['role']; content?: string; timestamp?: string; actions?: ChatMessage['actions'] };
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    messages.push({
      role: parsed.role as ChatMessage['role'],
      content: parsed.content as string,
      timestamp: parsed.timestamp as string,
      ...(parsed.actions ? { actions: parsed.actions } : {}),
    });
  }

  return {
    sessionName: header.sessionName ?? 'unnamed',
    startedAt: header.startedAt ?? '',
    messages,
  };
}
