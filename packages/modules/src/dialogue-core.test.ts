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
import type { EntityState, ResolvedEvent } from '@ai-rpg-engine/core';
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
// shop  -> {done -> farewell}   (mid-branch node: HAS choices, stays active)
// farewell                      (leaf node: NO choices — ends the dialogue, node effect fires)
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
      choices: [
        { id: 'done', text: 'That is all, thanks.', nextNodeId: 'farewell' },
      ],
    },
    farewell: {
      id: 'farewell',
      speaker: 'merchant',
      text: 'Safe travels, friend.',
      effects: [{ type: 'set-global', params: { key: 'farewellGiven', value: true } }],
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

// ---------------------------------------------------------------------------
// Leaf-node termination (MOD-C-BH-02)
//
// Before this fix, dialogue.ended only fired when a choice's nextNodeId pointed
// at a MISSING node. Advancing into a REAL node with no choices left
// activeDialogue set forever: every later 'choose' rejected with "no choices
// available", the numbered menu was dead for the rest of the session, and
// end-of-conversation hooks (starter-fantasy's healing-draught gift grants on
// dialogue.ended) never ran. All 10 starter packs end conversations on
// choiceless nodes (dismiss / end-gift / end-info), so every conversation
// hit this. A leaf node now renders its text, applies its own effects, and
// ends the conversation cleanly.
// ---------------------------------------------------------------------------

describe('dialogue-core: leaf-node termination (MOD-C-BH-02)', () => {
  it('advancing into a choiceless node renders it, fires dialogue.ended, and clears active dialogue', () => {
    const engine = buildEngine();
    engine.submitAction('speak', { targetIds: ['merchant'] });
    engine.submitAction('choose', { parameters: { choiceId: 'buy' } }); // -> shop (has choices)
    const events = engine.submitAction('choose', { parameters: { choiceId: 'done' } }); // -> farewell (leaf)

    // The closing line still renders — the player sees the farewell text.
    const entered = events.find(e => e.type === 'dialogue.node.entered');
    expect(entered).toBeDefined();
    expect(entered!.payload.nodeId).toBe('farewell');
    expect(entered!.payload.hasChoices).toBe(false);

    const ended = events.find(e => e.type === 'dialogue.ended');
    expect(ended).toBeDefined();
    expect(ended!.payload.dialogueId).toBe('merchant-greeting');
    expect(ended!.payload.nodeId).toBe('farewell');

    const dState = engine.world.modules['dialogue-core'] as {
      activeDialogue: string | null; activeNodeId: string | null; speakerId: string | null;
    };
    expect(dState.activeDialogue).toBeNull();
    expect(dState.activeNodeId).toBeNull();
    expect(dState.speakerId).toBeNull();
  });

  it("the leaf node's own effects still apply, and fire BEFORE dialogue.ended", () => {
    const engine = buildEngine();
    engine.submitAction('speak', { targetIds: ['merchant'] });
    engine.submitAction('choose', { parameters: { choiceId: 'buy' } });
    const events = engine.submitAction('choose', { parameters: { choiceId: 'done' } });

    expect(engine.world.globals.farewellGiven).toBe(true);
    const flagIdx = events.findIndex(e => e.type === 'world.flag.changed' && e.payload.key === 'farewellGiven');
    const endedIdx = events.findIndex(e => e.type === 'dialogue.ended');
    expect(flagIdx).toBeGreaterThanOrEqual(0);
    expect(endedIdx).toBeGreaterThan(flagIdx);
  });

  it('a conversation can start again after ending on a leaf (the menu is not dead)', () => {
    const engine = buildEngine();
    engine.submitAction('speak', { targetIds: ['merchant'] });
    engine.submitAction('choose', { parameters: { choiceId: 'buy' } });
    engine.submitAction('choose', { parameters: { choiceId: 'done' } }); // ends on leaf

    // Speaking again starts a FRESH conversation at the entry node...
    const again = engine.submitAction('speak', { targetIds: ['merchant'] });
    expect(again.some(e => e.type === 'dialogue.started')).toBe(true);
    expect(again.find(e => e.type === 'dialogue.node.entered')!.payload.nodeId).toBe('entry');

    // ...and choosing works. Previously activeNodeId stayed stuck on the
    // choiceless node, so every subsequent choose was rejected.
    const chosen = engine.submitAction('choose', { parameters: { choiceId: 'buy' } });
    expect(chosen.some(e => e.type === 'dialogue.choice.selected')).toBe(true);
    expect(chosen.some(e => e.type === 'action.rejected')).toBe(false);
  });

  it('a single-node dialogue (choiceless entry node) speaks its line and ends immediately', () => {
    const oneLiner: DialogueDefinition = {
      id: 'guard-bark',
      speakers: ['merchant'],
      entryNodeId: 'only',
      nodes: {
        only: { id: 'only', speaker: 'merchant', text: 'Move along.' },
      },
    };
    const engine = buildEngine([oneLiner]);
    const events = engine.submitAction('speak', { targetIds: ['merchant'] });

    expect(events.some(e => e.type === 'dialogue.started')).toBe(true);
    expect(events.find(e => e.type === 'dialogue.node.entered')!.payload.text).toBe('Move along.');
    expect(events.some(e => e.type === 'dialogue.ended')).toBe(true);
    const dState = engine.world.modules['dialogue-core'] as { activeDialogue: string | null };
    expect(dState.activeDialogue).toBeNull();
  });

  it('a node whose choices are ALL condition-hidden is the same dead end and also ends', () => {
    const gated: DialogueDefinition = {
      id: 'gated',
      speakers: ['merchant'],
      entryNodeId: 'start',
      nodes: {
        start: {
          id: 'start', speaker: 'merchant', text: 'Only the worthy may answer.',
          choices: [
            {
              id: 'secret', text: 'The password.', nextNodeId: 'start',
              condition: { type: 'global-set', params: { key: 'password' } },
            },
          ],
        },
      },
    };
    const engine = buildEngine([gated]);
    const events = engine.submitAction('speak', { targetIds: ['merchant'] });
    expect(events.some(e => e.type === 'dialogue.ended')).toBe(true);
    const dState = engine.world.modules['dialogue-core'] as { activeDialogue: string | null };
    expect(dState.activeDialogue).toBeNull();
  });

  it('dialogue.ended from a leaf reaches store listeners (the starter gift-grant pattern)', () => {
    const engine = buildEngine();
    let endedDialogueId: string | null = null;
    engine.store.events.on('dialogue.ended', (e: ResolvedEvent) => {
      endedDialogueId = e.payload.dialogueId as string;
    });
    engine.submitAction('speak', { targetIds: ['merchant'] });
    engine.submitAction('choose', { parameters: { choiceId: 'buy' } });
    engine.submitAction('choose', { parameters: { choiceId: 'done' } });
    expect(endedDialogueId).toBe('merchant-greeting');
  });
});

// ---------------------------------------------------------------------------
// action.rejected payloads name the verb (convention parity with the dispatcher)
//
// Every action.rejected the DISPATCHER emits — unknown verb, a validator or
// handler throw (core/actions.ts dispatch) — stamps `verb: action.verb` into
// the payload. dialogue-core's own rejections, built through makeEvent, carried
// only `{ reason }` with NO verb. That broke any consumer keying on the verb:
// the CLI's dialogue-trap fall-through (bin.ts `chooseRejected`, CS-C-001)
// tests `payload.verb === 'choose'`, so against the REAL module a rejected
// `choose` was invisible to it — a mistyped dialogue number was silently
// accepted as a valid selection and the fall-through never engaged. The gap
// hid because the CLI's own trap tests use a synthetic engine with NO `choose`
// verb, so the DISPATCHER rejects it (and DOES stamp verb) — the real handler
// path was never exercised. These tests pin the contract against a real, wired
// engine: dialogue-core rejections name their verb, like every other
// action.rejected payload in the codebase.
// ---------------------------------------------------------------------------

describe('dialogue-core: action.rejected payloads name the verb', () => {
  const rejectionOf = (events: ResolvedEvent[]) =>
    events.find(e => e.type === 'action.rejected');

  it("chooseHandler names verb 'choose' on all four rejection branches", () => {
    // 1. No dialogue active (no speak first) -> "no active dialogue".
    const e1 = buildEngine();
    const r1 = rejectionOf(e1.submitAction('choose', { parameters: { choiceId: 'buy' } }));
    expect(r1?.payload).toMatchObject({ verb: 'choose', reason: 'no active dialogue' });

    // 2. Active dialogue whose id is not in the registry -> "dialogue not found".
    const e2 = buildEngine();
    e2.world.modules['dialogue-core'] = { activeDialogue: 'ghost', activeNodeId: 'entry', speakerId: null };
    const r2 = rejectionOf(e2.submitAction('choose', { parameters: { choiceId: 'buy' } }));
    expect(r2?.payload).toMatchObject({ verb: 'choose', reason: 'dialogue not found' });

    // 3. Current node has no choices ('farewell' is a leaf) -> "no choices available".
    const e3 = buildEngine();
    e3.world.modules['dialogue-core'] = { activeDialogue: 'merchant-greeting', activeNodeId: 'farewell', speakerId: 'merchant' };
    const r3 = rejectionOf(e3.submitAction('choose', { parameters: { choiceId: 'x' } }));
    expect(r3?.payload).toMatchObject({ verb: 'choose', reason: 'no choices available' });

    // 4. Out-of-range choiceIndex on a node that HAS choices -> "invalid choice".
    const e4 = buildEngine();
    e4.submitAction('speak', { targetIds: ['merchant'] });
    const r4 = rejectionOf(e4.submitAction('choose', { parameters: { choiceIndex: 99 } }));
    expect(r4?.payload).toMatchObject({ verb: 'choose', reason: 'invalid choice' });
  });

  it("speakHandler names verb 'speak' on its rejection branches", () => {
    const e1 = buildEngine();
    const r1 = rejectionOf(e1.submitAction('speak', {}));
    expect(r1?.payload).toMatchObject({ verb: 'speak', reason: 'no one to speak to' });

    const e2 = buildEngine();
    const r2 = rejectionOf(e2.submitAction('speak', { targetIds: ['nobody'] }));
    expect(r2?.payload).toMatchObject({ verb: 'speak', reason: 'nobody not found' });

    const e3 = buildEngine([]); // empty registry -> "<name> has nothing to say"
    const r3 = rejectionOf(e3.submitAction('speak', { targetIds: ['merchant'] }));
    expect(r3?.payload).toMatchObject({ verb: 'speak', reason: 'Merchant has nothing to say' });
  });
});
