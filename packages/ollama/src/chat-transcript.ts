// Transcript persistence — save /load chat sessions.
// Transcripts are line-delimited JSON (one message per line).
// Chat engine calls save() after each exchange. Reads are on demand.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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

/** Save transcript as JSONL (one JSON object per line). */
export async function saveTranscript(path: string, transcript: ChatTranscript): Promise<string> {
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

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, lines.join('\n') + '\n', 'utf-8');
  return path;
}

/** Load a transcript from JSONL file. */
export async function loadTranscript(path: string): Promise<ChatTranscript | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    return null;
  }

  const lines = raw.trim().split('\n').filter(l => l.length > 0);
  if (lines.length === 0) return null;

  const header = JSON.parse(lines[0]);
  const messages: ChatMessage[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parsed = JSON.parse(lines[i]);
    messages.push({
      role: parsed.role,
      content: parsed.content,
      timestamp: parsed.timestamp,
      ...(parsed.actions ? { actions: parsed.actions } : {}),
    });
  }

  return {
    sessionName: header.sessionName ?? 'unnamed',
    startedAt: header.startedAt ?? '',
    messages,
  };
}
