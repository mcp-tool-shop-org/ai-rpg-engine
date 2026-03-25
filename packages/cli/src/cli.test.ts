import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const bin = path.resolve(import.meta.dirname, '../dist/bin.js');

function run(...args: string[]): string {
  return execFileSync('node', [bin, ...args], {
    encoding: 'utf-8',
    timeout: 10_000,
  }).trim();
}

describe('CLI', () => {
  it('--version prints version', () => {
    const out = run('--version');
    expect(out).toBe(`ai-rpg-engine v${version}`);
  });

  it('-v prints version', () => {
    const out = run('-v');
    expect(out).toBe(`ai-rpg-engine v${version}`);
  });

  it('version command prints version', () => {
    const out = run('version');
    expect(out).toBe(`ai-rpg-engine v${version}`);
  });

  it('--help prints usage', () => {
    const out = run('--help');
    expect(out).toContain('Usage: ai-rpg-engine');
    expect(out).toContain('Commands:');
    expect(out).toContain('run');
    expect(out).toContain('replay');
    expect(out).toContain('inspect-save');
  });

  it('unknown command exits with error', () => {
    expect(() => run('nonsense')).toThrow();
  });
});
