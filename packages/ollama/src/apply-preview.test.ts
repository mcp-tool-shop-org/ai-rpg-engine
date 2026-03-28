// Unit tests — apply-preview safe file write
// Uses temp directories, no live Ollama needed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generatePreview, applyConfirmed } from './apply-preview.js';

describe('apply-preview', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'apply-preview-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('generatePreview', () => {
    it('shows CREATE status for new file', async () => {
      const result = await generatePreview({
        content: 'id: chapel\nname: Ruined Chapel',
        targetPath: join(tempDir, 'chapel.yaml'),
      });

      expect(result.existingFile).toBe(false);
      expect(result.contentLength).toBe('id: chapel\nname: Ruined Chapel'.length);
      expect(result.delta).toBe(result.contentLength);
      expect(result.preview).toContain('CREATE');
      expect(result.preview).toContain('chapel.yaml');
      expect(result.preview).toContain('re-run with --confirm');
    });

    it('shows OVERWRITE status for existing file', async () => {
      const target = join(tempDir, 'existing.yaml');
      await writeFile(target, 'old content', 'utf-8');

      const result = await generatePreview({
        content: 'new content that is longer',
        targetPath: target,
      });

      expect(result.existingFile).toBe(true);
      expect(result.existingLength).toBe('old content'.length);
      expect(result.delta).toBeGreaterThan(0);
      expect(result.preview).toContain('OVERWRITE');
    });

    it('includes label in preview header', async () => {
      const result = await generatePreview({
        content: 'id: test',
        targetPath: join(tempDir, 'test.yaml'),
        label: 'Room definition',
      });

      expect(result.preview).toContain('Room definition');
    });

    it('shows first 40 lines of content', async () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line_${i}: value`);
      const result = await generatePreview({
        content: lines.join('\n'),
        targetPath: join(tempDir, 'big.yaml'),
      });

      expect(result.preview).toContain('line_0');
      expect(result.preview).toContain('line_39');
      expect(result.preview).toContain('10 more lines');
      expect(result.preview).not.toContain('line_49');
    });

    it('shows all lines when content is short', async () => {
      const result = await generatePreview({
        content: 'line_a\nline_b\nline_c',
        targetPath: join(tempDir, 'short.yaml'),
      });

      expect(result.preview).toContain('line_a');
      expect(result.preview).toContain('line_c');
      expect(result.preview).not.toContain('more lines');
    });
  });

  describe('applyConfirmed', () => {
    it('writes file to disk', async () => {
      const target = join(tempDir, 'output.yaml');
      const msg = await applyConfirmed({
        content: 'id: written\nname: Written Room',
        targetPath: target,
        projectRoot: tempDir,
      });

      expect(msg).toContain('Written');
      const onDisk = await readFile(target, 'utf-8');
      expect(onDisk).toBe('id: written\nname: Written Room');
    });

    it('creates parent directories', async () => {
      const target = join(tempDir, 'sub', 'deep', 'output.yaml');
      await applyConfirmed({
        content: 'id: nested',
        targetPath: target,
        projectRoot: tempDir,
      });

      const onDisk = await readFile(target, 'utf-8');
      expect(onDisk).toBe('id: nested');
    });

    it('overwrites existing file', async () => {
      const target = join(tempDir, 'overwrite.yaml');
      await writeFile(target, 'old', 'utf-8');
      await applyConfirmed({
        content: 'new',
        targetPath: target,
        projectRoot: tempDir,
      });

      const onDisk = await readFile(target, 'utf-8');
      expect(onDisk).toBe('new');
    });
  });
});
