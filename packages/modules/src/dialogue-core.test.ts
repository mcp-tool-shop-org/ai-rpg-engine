// dialogue-core.test.ts — behavioral coverage (F-5c0d279a)
//
// Before this file, dialogue-core.ts had ZERO behavioral test coverage: only
// minimal-install-proof.test.ts (constructs createDialogueCore([]) with an
// EMPTY dialogues array — never exercises speakHandler/chooseHandler/
// applyDialogueEffect/evaluateCondition against real content) and
// readme-quickstart.test.ts (a config-string smoke check, not a real
// interaction). This file exercises: speakHandler dialogue/entry-node
// resolution, condition-filtered choice visibility, chooseHandler mid-branch
// navigation vs end-of-branch termination, and effect application — including
// the F-db919552 fix (unsupported effect types surfaced as a warning instead
// of silently doing nothing).

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import type { DialogueDefinition } from '@ai-rpg-engine/content-schema';
import { createDialogueCore } from './dialogue-core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const npc: EntityState = {
  id: 'merchant', blueprintId: 'merchant', type: 'npc', name: 'Merchant',
  tags: ['npc'], stats: {}, resources: {}, statuses: [], zoneId: 'zone-a',
};
const player: EntityState = {
  id: 'player', blueprintId: 'player', type: 'player', name: 'Hero',
  tags: ['player'], stats: {}, resources: {}, statuses: [], zoneId: 'zone-a',
};
const zones = [{ id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: [] }];

// entry -> {buy: set-global effect -> shop, haggle: resource-modify effect (unsupported) -> shop,
//           hidden: condition-gated -> shop, leave: dangling nextNodeId -> ends}
const dialogue: DialogueDefinition = {
  id: 'merchant-greeting',
  speakers: ['merchant'],
  entryNodeId: 'entry',
  nodes: {
    entry: {
      id: 'entry',
      speaker: 'merchant',
      text: 'Welcome, traveler.',
      choices: [
        {
          id: 'buy', text: 'I want to buy something.', nextNodeId: 'shop',
          effects: [{ type: 'set-global', params: { key: 'metMerchant', value: true } }],
        },
        {
          id: 'haggle', text: 'Give me a discount.', nextNodeId: 'shop',
          effects: [{ type: 'resource-modify', params: { resource: 'reputation', amount: 10 } }],
        },
        {
          id: 'hidden', text: 'Secret option', nextNodeId: 'shop',
          condition: { type: 'global-set', params: { key: 'secretUnlocked' } },
        },
        { id: 'leave', text: 'Never mind.', nextNodeId: 'nowhere' },
      ],
    },
    shop: {
      id: 'shop',
      speaker: 'merchant',
      text: 'Take a look.',
    },
  },
};

function buildEngine(dialogues: DialogueDefinition[] = [dialogue]) {
  return createTestEngine({
    modules: [createDialogueCore(dialogues)],
    entities: [player, npc],
    zones,
  });
}

// ---------------------------------------------------------------------------
// speakHandler
// ---------------------------------------------------------------------------

describe('dialogue-core: speakHandler', () => {
  it('rejects with no target', () => {
    const engine = buildEngine();
    const events = engine.submitAction('speak', {});
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'no one to speak to')).toBe(true);
  });

  it('rejects when target entity does not exist', () => {
    const engine = buildEngine();
    const events = engine.submitAction('speak', { targetIds: ['nobody'] });
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'nobody not found')).toBe(true);
  });

  it('rejects when target has no matching dialogue', () => {
    const engine = buildEngine([]);
    const events = engine.submitAction('speak', { targetIds: ['merchant'] });
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'Merchant has nothing to say')).toBe(true);
  });

  it('finds dialogue by speaker match and enters the entry node', () => {
    const engine = buildEngine();
    const events = engine.submitAction('speak', { targetIds: ['merchant'] });
    expect(events.some(e => e.type === 'dialogue.started')).toBe(true);
    const entered = events.find(e => e.type === 'dialogue.node.entered');
    expect(entered).toBeDefined();
    expect(entered!.payload.nodeId).toBe('entry');
    expect(entered!.payload.text).toBe('Welcome, traveler.');
  });

  it('finds dialogue by explicit dialogueId parameter', () => {
    const engine = buildEngine();
    const events = engine.submitAction('speak', {
      targetIds: ['merchant'],
      parameters: { dialogueId: 'merchant-greeting' },
    });
    expect(events.some(e => e.type === 'dialogue.started' && e.payload.dialogueId === 'merchant-greeting')).toBe(true);
  });

  it('filters choices by condition — an unmet global-set condition hides the choice', () => {
    const engine = buildEngine();
    const events = engine.submitAction('speak', { targetIds: ['merchant'] });
    const entered = events.find(e => e.type === 'dialogue.node.entered')!;
    const choiceIds = (entered.payload.choices as Array<{ id: string }>).map(c => c.id);
    expect(choiceIds).not.toContain('hidden');
    expect(choiceIds).toContain('buy');
  });

  it('meeting the condition reveals the choice', () => {
    const engine = buildEngine();
    engine.store.state.globals.secretUnlocked = true;
    const events = engine.submitAction('speak', { targetIds: ['merchant'] });
    const entered = events.find(e => e.type === 'dialogue.node.entered')!;
    const choiceIds = (entered.payload.choices as Array<{ id: string }>).map(c => c.id);
    expect(choiceIds).toContain('hidden');
  });
});

// ---------------------------------------------------------------------------
// chooseHandler — end-of-branch vs mid-branch navigation
// ---------------------------------------------------------------------------

describe('dialogue-core: chooseHandler navigation', () => {
  it('rejects when no dialogue is active', () => {
    const engine = buildEngine();
    const events = engine.submitAction('choose', { parameters: { choiceId: 'buy' } });
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'no active dialogue')).toBe(true);
  });

  it('rejects an invalid choice id', () => {
    const engine = buildEngine();
    engine.submitAction('speak', { targetIds: ['merchant'] });
    const events = engine.submitAction('choose', { parameters: { choiceId: 'nonexistent' } });
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'invalid choice')).toBe(true);
  });

  it('mid-branch: a choice with a valid nextNodeId advances activeNodeId and renders the next node', () => {
    const engine = buildEngine();
    engine.submitAction('speak', { targetIds: ['merchant'] });
    const events = engine.submitAction('choose', { parameters: { choiceId: 'buy' } });

    expect(events.some(e => e.type === 'dialogue.choice.selected')).toBe(true);
    const entered = events.find(e => e.type === 'dialogue.node.entered');
    expect(entered).toBeDefined();
    expect(entered!.payload.nodeId).toBe('shop');

    const dState = engine.world.modules['dialogue-core'] as { activeNodeId: string | null };
    expect(dState.activeNodeId).toBe('shop');
  });

  it('end-of-branch: a choice whose nextNodeId does not resolve to a real node ends the dialogue', () => {
    const engine = buildEngine();
    engine.submitAction('speak', { targetIds: ['merchant'] });
    const events = engine.submitAction('choose', { parameters: { choiceId: 'leave' } });

    expect(events.some(e => e.type === 'dialogue.ended')).toBe(true);
    expect(events.some(e => e.type === 'dialogue.node.entered')).toBe(false);

    const dState = engine.world.modules['dialogue-core'] as {
      activeDialogue: string | null; activeNodeId: string | null; speakerId: string | null;
    };
    expect(dState.activeDialogue).toBeNull();
    expect(dState.activeNodeId).toBeNull();
    expect(dState.speakerId).toBeNull();
  });

  it('selecting by choiceIndex resolves against the SAME condition-filtered list shown to the player', () => {
    const engine = buildEngine();
    engine.submitAction('speak', { targetIds: ['merchant'] });
    // 'hidden' is filtered out (condition unmet), so filtered index 0 is 'buy'.
    const events = engine.submitAction('choose', { parameters: { choiceIndex: 0 } });
    const selected = events.find(e => e.type === 'dialogue.choice.selected');
    expect(selected!.payload.choiceId).toBe('buy');
  });
});

// ---------------------------------------------------------------------------
// Effect application (F-db919552)
// ---------------------------------------------------------------------------

describe('dialogue-core: effect application', () => {
  it('applies a set-global effect and emits world.flag.changed', () => {
    const engine = buildEngine();
    engine.submitAction('speak', { targetIds: ['merchant'] });
    const events = engine.submitAction('choose', { parameters: { choiceId: 'buy' } });

    expect(events.some(
      e => e.type === 'world.flag.changed' && e.payload.key === 'metMerchant' && e.payload.value === true,
    )).toBe(true);
    expect(engine.world.globals.metMerchant).toBe(true);
  });

  it('an unsupported effect type (e.g. resource-modify) is surfaced as a structured warning instead of silently doing nothing', () => {
    const engine = buildEngine();
    engine.submitAction('speak', { targetIds: ['merchant'] });
    const events = engine.submitAction('choose', { parameters: { choiceId: 'haggle' } });

    const unknown = events.find(e => e.type === 'dialogue.effect.unknown');
    expect(unknown).toBeDefined();
    expect(unknown!.payload.effectType).toBe('resource-modify');
  });
});
