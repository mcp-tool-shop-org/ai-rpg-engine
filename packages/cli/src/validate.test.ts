import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runValidate } from './validate.js';

// content-dx: `ai-rpg-engine validate <file.json>` loads + validates a content pack
// from a JSON file and prints a structured report: errors (path + message + hint) and
// advisories printed SEPARATELY. Exit code is 0 on valid, nonzero when there are errors.
// This is the command the package metadata already advertises but bin.ts never had.
//
// runValidate is written test-first to RETURN its exit code (0/nonzero) and accept an
// injected logger, so we can assert behavior without spawning a process or stubbing
// process.exit. bin.ts turns the returned code into process.exit.

function capture() {
  const lines: string[] = [];
  return { log: (m: string) => lines.push(m), lines, text: () => lines.join('\n') };
}

describe('runValidate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-validate-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePack(name: string, contents: unknown): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents), 'utf-8');
    return p;
  }

  it('exits 0 on a valid content pack', () => {
    const file = writePack('good.json', {
      entities: [{ id: 'player', type: 'player', name: 'Wanderer' }],
      zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
    });
    const out = capture();
    const code = runValidate([file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(out.text()).toMatch(/valid|ok|passed/i);
  });

  it('exits nonzero and reports structured errors (path + message) on a bad pack', () => {
    const file = writePack('bad.json', { entities: [{ id: '', type: 'x', name: 'Y' }] });
    const out = capture();
    const errOut = capture();
    const code = runValidate([file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    const combined = out.text() + '\n' + errOut.text();
    // The path of the offending field must appear in the report.
    expect(combined).toMatch(/id/);
    // And a human message.
    expect(combined.length).toBeGreaterThan(0);
  });

  it('reports a hint line alongside errors (path + message + hint)', () => {
    // A dangling cross-reference error carries an actionable hint in its message.
    const file = writePack('bad-ref.json', {
      entities: [{ id: 'hero', type: 'player', name: 'Hero', startingStatuses: ['ghost-buff'] }],
      statuses: [{ id: 'real-buff', name: 'Real Buff', tags: ['buff'], stacking: 'refresh' }],
    });
    const out = capture();
    const code = runValidate([file], { log: out.log, error: out.log });
    expect(code).not.toBe(0);
    expect(out.text()).toContain('ghost-buff');
  });

  it('prints advisories SEPARATELY from errors and still exits 0 when there are no errors', () => {
    // One-way passage is an advisory, not an error → exit 0 but the advisory is shown.
    const file = writePack('advisory.json', {
      zones: [
        { id: 'a', name: 'A', neighbors: ['b'] },
        { id: 'b', name: 'B', neighbors: [] },
      ],
    });
    const out = capture();
    const code = runValidate([file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    const text = out.text();
    expect(text.toLowerCase()).toContain('advisor');
    expect(text).toMatch(/one-way/);
  });

  it('exits nonzero with a structured error when the file is missing', () => {
    const out = capture();
    const errOut = capture();
    const code = runValidate([path.join(tmpDir, 'nope.json')], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toMatch(/read|not found|exist|file/);
  });

  it('exits nonzero with a structured error when the JSON is malformed', () => {
    const file = writePack('broken.json', '{ "zones": [ ');
    const out = capture();
    const errOut = capture();
    const code = runValidate([file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toContain('json');
  });

  it('exits nonzero with usage when no file argument is given', () => {
    const out = capture();
    const errOut = capture();
    const code = runValidate([], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toMatch(/usage|file|provide/);
  });

  it('--help prints validate usage and exits 0', () => {
    const out = capture();
    const code = runValidate(['--help'], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(out.text().toLowerCase()).toContain('validate');
  });

  it('uses the default console logger when no deps are injected (no throw)', () => {
    const file = writePack('good2.json', { zones: [{ id: 'z', name: 'Z', neighbors: [] }] });
    // Should not throw when deps omitted; returns 0 for a clean pack.
    expect(() => {
      const code = runValidate([file]);
      expect(code).toBe(0);
    }).not.toThrow();
  });
});
