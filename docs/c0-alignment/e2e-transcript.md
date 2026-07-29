# C0 — the end-to-end chain, run live

Captured f045ff0 on branch feat/c0-alignment-audit.
Engine v3.8.0 · world-forge v4.5.0 · schema 4.5.0.

## The chain

1. Author the vocabulary-coverage `WorldProject` (377 leaf fields, every domain populated).
2. `exportToEngine(project)` → a 12-key ContentPack.
3. Write the pack to disk.
4. `ai-rpg-engine validate <file>`.

## Step 4, verbatim

```
$ node packages/cli/dist/bin.js validate packages/cli/src/__fixtures__/c0-forge-pack.json
✓ Content valid: packages/cli/src/__fixtures__/c0-forge-pack.json
  Content loaded: 3 entities, 3 zones, 1 dialogues, 0 quests
$ echo $?
0
```
