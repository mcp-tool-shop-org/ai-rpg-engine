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

describe('F-c53b68ee — GDScript kit is awaitable and watches transport liveness', () => {
  const kitDir = join(fileURLToPath(dirname(import.meta.url)), '..', 'gdscript');
  const src = readFileSync(join(kitDir, 'sidecar_client.gd'), 'utf8');

  it('documents advance(1) as METHOD_ADVANCE with a request id', () => {
    expect(src).toMatch(/func advance\(rounds: int = 1\) -> int:/);
    expect(src).toMatch(/METHOD_ADVANCE/);
    expect(src).toMatch(/_request\(METHOD_ADVANCE,\s*\{\s*"rounds":\s*rounds\s*\}\)/);
    expect(src).toMatch(/func preview\(/);
    expect(src).toMatch(/func replay\(/);
    expect(src).toMatch(/func shutdown\(/);
    expect(src).toMatch(/signal completed\(id: int, result: Variant\)/);
  });

  it('poll watches get_status and fails _pending on NONE/ERROR without leaving it growing', () => {
    expect(src).toMatch(/get_status\(\)/);
    expect(src).toMatch(/STATUS_NONE/);
    expect(src).toMatch(/STATUS_ERROR/);
    expect(src).toMatch(/func _fail_pending\(\)/);
    expect(src).toMatch(/_pending\.clear\(\)/);
    expect(src).toMatch(/func disconnect_from_host\(\)/);
    expect(src).toContain('_fail_transport("peer closed")');
  });
});
