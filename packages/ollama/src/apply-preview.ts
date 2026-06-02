// apply-preview — safe file write with visible preview
// Shows what would be written, where, and how big.
// Writes only with explicit --confirm. No filesystem goblins.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type ApplyPreviewInput = {
  content: string;
  targetPath: string;
  label?: string;
  projectRoot?: string;
};

export type ApplyPreviewResult = {
  targetPath: string;
  contentLength: number;
  existingFile: boolean;
  existingLength: number;
  delta: number;
  preview: string;
};

/** True when `resolved` is the project root or a descendant of it. */
function withinRoot(resolved: string, projectRoot?: string): boolean {
  const root = resolve(projectRoot ?? process.cwd());
  return resolved === root || resolved.startsWith(root + '/') || resolved.startsWith(root + '\\');
}

export async function generatePreview(input: ApplyPreviewInput): Promise<ApplyPreviewResult> {
  const resolved = resolve(input.targetPath);

  // Security: preview shares the same sandbox as the confirmed write. A
  // model/user-supplied targetPath that escapes the project root must NOT be
  // read here — otherwise preview becomes a file-existence/size oracle for
  // arbitrary on-disk paths outside the project. Block BEFORE any readFile.
  if (!withinRoot(resolved, input.projectRoot)) {
    return {
      targetPath: resolved,
      contentLength: input.content.length,
      existingFile: false,
      existingLength: 0,
      delta: input.content.length,
      preview:
        `--- Apply Preview${input.label ? `: ${input.label}` : ''} ---\n` +
        `Target: ${resolved}\n` +
        `Status: BLOCKED — target path escapes project root\n\n` +
        `No preview generated (out-of-sandbox path).`,
    };
  }

  let existingContent = '';
  let existingFile = false;

  try {
    existingContent = await readFile(resolved, 'utf-8');
    existingFile = true;
  } catch {
    // File doesn't exist — that's fine
  }

  const contentLength = input.content.length;
  const existingLength = existingContent.length;
  const delta = contentLength - existingLength;

  const lines: string[] = [];
  lines.push(`--- Apply Preview${input.label ? `: ${input.label}` : ''} ---`);
  lines.push(`Target: ${resolved}`);
  lines.push(`Status: ${existingFile ? 'OVERWRITE' : 'CREATE'}`);
  lines.push(`Size: ${contentLength} bytes${existingFile ? ` (${delta >= 0 ? '+' : ''}${delta} from existing)` : ''}`);
  lines.push('');

  // Show first 40 lines of content
  const contentLines = input.content.split('\n');
  const previewLines = contentLines.slice(0, 40);
  for (const line of previewLines) {
    lines.push(`  ${line}`);
  }
  if (contentLines.length > 40) {
    lines.push(`  ... (${contentLines.length - 40} more lines)`);
  }

  lines.push('');
  lines.push('To apply: re-run with --confirm');

  return {
    targetPath: resolved,
    contentLength,
    existingFile,
    existingLength,
    delta,
    preview: lines.join('\n'),
  };
}

export async function applyConfirmed(input: ApplyPreviewInput): Promise<string> {
  const resolved = resolve(input.targetPath);
  if (!withinRoot(resolved, input.projectRoot)) {
    return `Error: target path escapes project root (${resolved})`;
  }
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, input.content, 'utf-8');
  return `Written: ${resolved} (${input.content.length} bytes)`;
}
