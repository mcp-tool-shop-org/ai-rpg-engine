// Author-facing JSON Schema for ContentPack (Draft 2020-12).
// Runtime validation (validate.ts / loadContent) remains the fail-closed gate.
// The checked-in artifact `schema/content-pack.schema.json` is the editor /
// World Forge / $ref surface so handbook appendix B cannot drift independently.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTENT_PACK_JSON_SCHEMA_ID =
  'https://ai-rpg-engine.dev/schemas/content-pack.schema.json';

function schemaPath(): string {
  // src/json-schema.ts and dist/json-schema.js both sit one directory below
  // the package root, so ../schema/content-pack.schema.json resolves either way.
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'schema', 'content-pack.schema.json');
}

/** Absolute path of the checked-in ContentPack JSON Schema artifact. */
export function contentPackSchemaPath(): string {
  return schemaPath();
}

/**
 * Return the ContentPack JSON Schema (Draft 2020-12) from the checked-in
 * artifact. Callers (editors, loadContentFromFile annotations, World Forge)
 * $ref {@link CONTENT_PACK_JSON_SCHEMA_ID}.
 */
export function toJsonSchema(): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(schemaPath(), 'utf-8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `toJsonSchema: could not read ${schemaPath()}: ${reason} — the schema artifact ships next to this package`,
    );
  }
  return JSON.parse(raw) as Record<string, unknown>;
}
