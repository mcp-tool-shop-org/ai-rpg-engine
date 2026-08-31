// Unit tests — apply-preview safe file write
// Uses temp directories, no live Ollama needed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  generatePreview, applyConfirmed, formatUnifiedDiff, restoreFromBackup, parseContentAppliedDetail, undoLastApply,
  formatContentAppliedDetail, formatUndoResultDetail,
} from './apply-preview.js';

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
        projectRoot: tempDir,
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
        projectRoot: tempDir,
      });

      expect(result.existingFile).toBe(true);
      expect(result.existingLength).toBe('old content'.length);
      expect(result.delta).toBeGreaterThan(0);
      expect(result.preview).toContain('OVERWRITE');
    });

    it('emits a unified diff of existing vs new on OVERWRITE', async () => {
      const target = join(tempDir, 'chapel.yaml');
      await writeFile(target, 'id: chapel\nname: Old Chapel\n', 'utf-8');

      const result = await generatePreview({
        content: 'id: chapel\nname: Ruined Chapel\n',
        targetPath: target,
        projectRoot: tempDir,
      });

      expect(result.preview).toContain('OVERWRITE');
      expect(result.preview).toContain('--- ');
      expect(result.preview).toContain('+++ ');
      expect(result.preview).toContain('-name: Old Chapel');
      expect(result.preview).toContain('+name: Ruined Chapel');
      // Must not look like a CREATE-shaped dump of only the new payload.
      expect(result.preview).not.toMatch(/^ {2}id: chapel$/m);
    });

    it('includes label in preview header', async () => {
      const result = await generatePreview({
        content: 'id: test',
        targetPath: join(tempDir, 'test.yaml'),
        label: 'Room definition',
        projectRoot: tempDir,
      });

      expect(result.preview).toContain('Room definition');
    });

    it('shows first 40 lines of content', async () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line_${i}: value`);
      const result = await generatePreview({
        content: lines.join('\n'),
        targetPath: join(tempDir, 'big.yaml'),
        projectRoot: tempDir,
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
        projectRoot: tempDir,
      });

      expect(result.preview).toContain('line_a');
      expect(result.preview).toContain('line_c');
      expect(result.preview).not.toContain('more lines');
    });
  });

  describe('applyConfirmed', () => {
    it('writes file to disk', async () => {
      const target = join(tempDir, 'output.yaml');
      const result = await applyConfirmed({
        content: 'id: written\nname: Written Room',
        targetPath: target,
        projectRoot: tempDir,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toBe(resolve(target));
        expect(result.bytes).toBe('id: written\nname: Written Room'.length);
      }
      const onDisk = await readFile(target, 'utf-8');
      expect(onDisk).toBe('id: written\nname: Written Room');
    });

    it('creates parent directories', async () => {
      const target = join(tempDir, 'sub', 'deep', 'output.yaml');
      const result = await applyConfirmed({
        content: 'id: nested',
        targetPath: target,
        projectRoot: tempDir,
      });
      expect(result.ok).toBe(true);

      const onDisk = await readFile(target, 'utf-8');
      expect(onDisk).toBe('id: nested');
    });

    it('overwrites existing file', async () => {
      const target = join(tempDir, 'overwrite.yaml');
      await writeFile(target, 'old', 'utf-8');
      const result = await applyConfirmed({
        content: 'new',
        targetPath: target,
        projectRoot: tempDir,
      });
      expect(result.ok).toBe(true);

      const onDisk = await readFile(target, 'utf-8');
      expect(onDisk).toBe('new');
    });

    it('writes a sibling .bak then the new payload on OVERWRITE', async () => {
      const target = join(tempDir, 'chapel.yaml');
      await writeFile(target, 'id: old\n', 'utf-8');
      const result = await applyConfirmed({
        content: 'id: new\n',
        targetPath: target,
        projectRoot: tempDir,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.backupPath).toBe(`${target}.bak`);
      }
      expect(await readFile(target, 'utf-8')).toBe('id: new\n');
      expect(await readFile(`${target}.bak`, 'utf-8')).toBe('id: old\n');
      await expect(readFile(`${target}.tmp`, 'utf-8')).rejects.toThrow();
    });

    it('does not write a .bak on CREATE', async () => {
      const target = join(tempDir, 'fresh.yaml');
      const result = await applyConfirmed({
        content: 'id: fresh\n',
        targetPath: target,
        projectRoot: tempDir,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.backupPath).toBeUndefined();
      await expect(readFile(`${target}.bak`, 'utf-8')).rejects.toThrow();
    });

    it('restoreFromBackup puts the .bak body back', async () => {
      const target = join(tempDir, 'undo.yaml');
      await writeFile(target, 'before\n', 'utf-8');
      await applyConfirmed({ content: 'after\n', targetPath: target, projectRoot: tempDir });
      const restored = await restoreFromBackup({ targetPath: target, projectRoot: tempDir });
      expect(restored.ok).toBe(true);
      expect(await readFile(target, 'utf-8')).toBe('before\n');
    });

    it('parseContentAppliedDetail reads path and backup from history detail', () => {
      expect(parseContentAppliedDetail('/proj/chapel.yaml')).toEqual({ targetPath: '/proj/chapel.yaml' });
      expect(parseContentAppliedDetail('/proj/chapel.yaml (backup: /proj/chapel.yaml.bak)')).toEqual({
        targetPath: '/proj/chapel.yaml',
        backupPath: '/proj/chapel.yaml.bak',
        wasCreate: false,
      });
    });

    // F-2d9f6b18 (wave-4): a CREATE write must be recorded and parsed back
    // as a CREATE explicitly -- not inferred from the mere absence of a
    // backup suffix -- so undo can delete instead of hunting a .bak that
    // was never written.
    it('parseContentAppliedDetail reads the explicit (create) tag', () => {
      expect(parseContentAppliedDetail('/proj/fresh.yaml (create)')).toEqual({
        targetPath: '/proj/fresh.yaml',
        wasCreate: true,
      });
    });

    it('formatContentAppliedDetail tags CREATE and OVERWRITE distinctly', () => {
      expect(formatContentAppliedDetail({ path: '/proj/fresh.yaml' })).toBe('/proj/fresh.yaml (create)');
      expect(formatContentAppliedDetail({ path: '/proj/chapel.yaml', backupPath: '/proj/chapel.yaml.bak' }))
        .toBe('/proj/chapel.yaml (backup: /proj/chapel.yaml.bak)');
    });

    it('undoLastApply restores from the last content_applied backup', async () => {
      const target = join(tempDir, 'chapel.yaml');
      await writeFile(target, 'before\n', 'utf-8');
      const written = await applyConfirmed({ content: 'after\n', targetPath: target, projectRoot: tempDir });
      expect(written.ok).toBe(true);
      if (!written.ok) return;
      const restored = await undoLastApply({
        history: [{ kind: 'content_applied', detail: formatContentAppliedDetail(written) }],
        projectRoot: tempDir,
      });
      expect(restored.ok).toBe(true);
      expect(await readFile(target, 'utf-8')).toBe('before\n');
    });

    // F-2d9f6b18 (wave-4, CRITICAL): applyConfirmed never writes a .bak for
    // a CREATE (the overwhelming case for guided-build scaffold output).
    // Before this fix, undoLastApply always fell back to a `${path}.bak`
    // probe that was never written, so the FIRST /undo after ANY confirmed
    // guided-build batch failed outright with "backup not found" -- for
    // every freshly-scaffolded file, every time.
    it('undoLastApply DELETES the file on undo of a CREATE, instead of hunting a nonexistent .bak', async () => {
      const target = join(tempDir, 'fresh.yaml');
      const written = await applyConfirmed({ content: 'id: fresh\n', targetPath: target, projectRoot: tempDir });
      expect(written.ok).toBe(true);
      if (!written.ok) return;
      expect(written.backupPath).toBeUndefined();

      const undone = await undoLastApply({
        history: [{ kind: 'content_applied', detail: formatContentAppliedDetail(written) }],
        projectRoot: tempDir,
      });
      expect(undone.ok).toBe(true);
      if (undone.ok) expect(undone.deleted).toBe(true);
      await expect(readFile(target, 'utf-8')).rejects.toThrow();
    });

    // F-2d9f6b18 (wave-4): a SECOND consecutive /undo used to target a
    // garbled, self-referential path -- the undo-restore's own
    // content_applied event was recorded as the bespoke string
    // `undo restored ${path}`, which has no ' (backup: ' substring, so the
    // ENTIRE string became the parsed targetPath. formatUndoResultDetail
    // gives the undo's own effect the same parseable shape every other
    // content_applied event uses, so a second /undo targets a real path.
    it('formatUndoResultDetail keeps a second consecutive undo parseable (OVERWRITE case)', async () => {
      const target = join(tempDir, 'chapel.yaml');
      await writeFile(target, 'before\n', 'utf-8');
      const written = await applyConfirmed({ content: 'after\n', targetPath: target, projectRoot: tempDir });
      expect(written.ok).toBe(true);
      if (!written.ok) return;

      // First undo: restores 'before' (and, being an OVERWRITE-shaped
      // restoreFromBackup->applyConfirmed call, backs up 'after' first).
      const firstUndo = await undoLastApply({
        history: [{ kind: 'content_applied', detail: formatContentAppliedDetail(written) }],
        projectRoot: tempDir,
      });
      expect(firstUndo.ok).toBe(true);
      if (!firstUndo.ok) return;
      expect(await readFile(target, 'utf-8')).toBe('before\n');

      // The engine records the undo's own effect the same way a write is
      // recorded -- never the old bespoke "undo restored X" string.
      const firstUndoDetail = formatUndoResultDetail(firstUndo);
      expect(firstUndoDetail).not.toContain('undo restored');

      // Second undo, parsing ONLY that recorded detail, must restore back
      // to 'after' -- not fail on a garbled path.
      const secondUndo = await undoLastApply({
        history: [{ kind: 'content_applied', detail: firstUndoDetail }],
        projectRoot: tempDir,
      });
      expect(secondUndo.ok).toBe(true);
      expect(await readFile(target, 'utf-8')).toBe('after\n');
    });

    // The CREATE-undo (delete) side of the same second-undo contract: its
    // own effect is tagged distinctly (not as a fresh CREATE, which a third
    // undo would then wrongly try to delete again) and refuses cleanly.
    it('formatUndoResultDetail tags a CREATE-undo delete so a further undo refuses cleanly', async () => {
      const target = join(tempDir, 'fresh.yaml');
      const written = await applyConfirmed({ content: 'id: fresh\n', targetPath: target, projectRoot: tempDir });
      expect(written.ok).toBe(true);
      if (!written.ok) return;

      const undone = await undoLastApply({
        history: [{ kind: 'content_applied', detail: formatContentAppliedDetail(written) }],
        projectRoot: tempDir,
      });
      expect(undone.ok).toBe(true);
      if (!undone.ok) return;
      const undoDetail = formatUndoResultDetail(undone);
      expect(undoDetail).not.toContain('(create)');

      const secondUndo = await undoLastApply({
        history: [{ kind: 'content_applied', detail: undoDetail }],
        projectRoot: tempDir,
      });
      expect(secondUndo.ok).toBe(false);
    });
  });

  describe('formatUnifiedDiff', () => {
    it('marks changed lines with +/-', () => {
      const diff = formatUnifiedDiff('a\nb\nc\n', 'a\nB\nc\n', 'file.yaml');
      expect(diff).toContain('--- file.yaml');
      expect(diff).toContain('+++ file.yaml');
      expect(diff).toContain('-b');
      expect(diff).toContain('+B');
      expect(diff).toMatch(/^ a$/m);
    });
  });

  // ollama-sec-B — preview shares the write sandbox; it must not read out-of-root
  // files (no file-existence/size oracle via a model/user-supplied targetPath).
  describe('sandbox confinement', () => {
    let root: string;
    let secret: string;

    beforeEach(async () => {
      root = join(tempDir, 'project');
      const outside = join(tempDir, 'outside');
      await mkdir(root, { recursive: true });
      await mkdir(outside, { recursive: true });
      secret = join(outside, 'secret.yaml');
      await writeFile(secret, 'id: SECRET\nsize: 9999\n', 'utf-8');
    });

    it('generatePreview does NOT read a file outside projectRoot', async () => {
      const r = await generatePreview({ content: 'new', targetPath: secret, projectRoot: root });
      expect(r.existingFile).toBe(false); // never read the out-of-root file
      expect(r.existingLength).toBe(0);
      expect(r.preview).toContain('BLOCKED');
      expect(r.preview).not.toContain('9999'); // no size leak
    });

    it('generatePreview still previews a file inside projectRoot', async () => {
      const inside = join(root, 'content.yaml');
      await writeFile(inside, 'existing-body', 'utf-8');
      const r = await generatePreview({ content: 'new-body', targetPath: inside, projectRoot: root });
      expect(r.existingFile).toBe(true);
      expect(r.existingLength).toBe('existing-body'.length);
      expect(r.preview).not.toContain('BLOCKED');
    });

    it('applyConfirmed refuses to write outside projectRoot', async () => {
      const result = await applyConfirmed({ content: 'x', targetPath: secret, projectRoot: root });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('escapes project root');
      await expect(readFile(secret, 'utf-8')).resolves.toBe('id: SECRET\nsize: 9999\n');
    });
  });

  // Relative targets must resolve against projectRoot, not process.cwd()
  // (F-10f397f0). Chat scaffold pendingWrite uses `${artifactId}.yaml`.
  describe('relative targets resolve against projectRoot', () => {
    it('applyConfirmed writes a relative path under projectRoot when cwd differs', async () => {
      const project = join(tempDir, 'project');
      const cwdDir = join(tempDir, 'cwd');
      await mkdir(project, { recursive: true });
      await mkdir(cwdDir, { recursive: true });
      const prevCwd = process.cwd();
      try {
        process.chdir(cwdDir);
        const result = await applyConfirmed({
          content: 'id: rel',
          targetPath: 'rel.yaml',
          projectRoot: project,
        });
        expect(result.ok).toBe(true);
        expect(await readFile(join(project, 'rel.yaml'), 'utf-8')).toBe('id: rel');
        await expect(readFile(join(cwdDir, 'rel.yaml'), 'utf-8')).rejects.toThrow();
      } finally {
        process.chdir(prevCwd);
      }
    });

    it('generatePreview previews a relative path under projectRoot when cwd differs', async () => {
      const project = join(tempDir, 'project');
      const cwdDir = join(tempDir, 'cwd');
      await mkdir(project, { recursive: true });
      await mkdir(cwdDir, { recursive: true });
      const prevCwd = process.cwd();
      try {
        process.chdir(cwdDir);
        const result = await generatePreview({
          content: 'id: rel',
          targetPath: 'rel.yaml',
          projectRoot: project,
        });
        expect(result.preview).not.toContain('BLOCKED');
        expect(result.preview).toContain('CREATE');
        expect(result.targetPath).toBe(resolve(project, 'rel.yaml'));
      } finally {
        process.chdir(prevCwd);
      }
    });
  });
});
