/**
 * README Quickstart Compilation Proof
 *
 * This test compiles the exact code from the README Quick Start section,
 * proving the documented API surface is accurate and type-safe.
 */

import { describe, it, expect } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import type { GameManifest } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

describe('README Quickstart', () => {
  it('compiles and runs the documented example', () => {
    // Stubs for user-provided content (README assumes these exist)
    const myManifest: GameManifest = {
      id: 'readme-example',
      title: 'README Example',
      version: '1.0.0',
      engineVersion: '2.3.2',
      ruleset: 'example',
      modules: ['combat', 'traversal', 'dialogue'],
      contentPacks: [],
    };

    const myDialogues: Parameters<typeof createDialogueCore>[0] = [];

    // --- BEGIN README CODE (verbatim) ---

    // Define your stat mapping
    const combat = buildCombatStack({
      statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
      playerId: 'hero',
      biasTags: ['undead', 'beast'],
    });

    // Wire the engine
    const engine = new Engine({
      manifest: myManifest,
      modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(myDialogues)],
    });

    // --- END README CODE ---

    // The engine boots and has the expected verbs
    expect(engine).toBeDefined();
    expect(engine.tick).toBe(0);
    const verbs = engine.getAvailableActions();
    expect(verbs).toContain('attack');
    expect(verbs).toContain('move');
  });
});
