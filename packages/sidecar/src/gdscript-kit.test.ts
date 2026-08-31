// gdscript-kit.test.ts — the shipped Godot attach kit shares framing vectors
// with Node MessageReader. Godot itself is not on this path; the pin is that
// a fixture of split Content-Length frames reconstructs the same RpcMessage.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { MessageReader, type FramingError, type RpcMessage } from './framing.js';

const fixturePath = join(fileURLToPath(dirname(import.meta.url)), '..', 'gdscript', 'fixtures', 'split-frames.json');

type FixtureCase = {
  name: string;
  chunks: string[];
  messages: RpcMessage[];
  errors: string[];
};

type FixtureFile = {
  maxMessageBytes: number;
  cases: FixtureCase[];
};

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as FixtureFile;

describe('F-31094245 — GDScript framing fixture matches Node MessageReader', () => {
  it('ships the Godot attach kit next to the JS client', () => {
    const kitDir = join(fileURLToPath(dirname(import.meta.url)), '..', 'gdscript');
    expect(readFileSync(join(kitDir, 'framing.gd'), 'utf8')).toMatch(/Content-Length/);
    expect(readFileSync(join(kitDir, 'framing.gd'), 'utf8')).toMatch(/MAX_MESSAGE_BYTES/);
    expect(readFileSync(join(kitDir, 'sidecar_client.gd'), 'utf8')).toMatch(/SidecarAttachClient/);
    expect(readFileSync(join(kitDir, 'sidecar_client.gd'), 'utf8')).toMatch(/apply_patches/);
    expect(readFileSync(join(kitDir, 'sidecar_client.gd'), 'utf8')).toMatch(/canonical_state_hash/);
    expect(readFileSync(join(kitDir, 'sidecar_client.gd'), 'utf8')).toMatch(/connect_to_host/);
  });

  for (const c of fixture.cases) {
    it(`fixture "${c.name}" reconstructs the same RpcMessage`, () => {
      const messages: RpcMessage[] = [];
      const errors: FramingError[] = [];
      const reader = new MessageReader(
        (m) => messages.push(m),
        (e) => errors.push(e),
      );
      for (const chunk of c.chunks) reader.push(chunk);
      expect(messages).toEqual(c.messages);
      expect(errors.map((e) => e.kind)).toEqual(c.errors);
    });
  }
});
