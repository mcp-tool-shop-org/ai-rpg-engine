import { describe, it, expect } from 'vitest';
import {
  PresentationChannels,
  createTestEngine,
  type ResolvedEvent,
} from '@ai-rpg-engine/core';
import {
  createNarrativeAuthority,
  recordPresentation,
  revealTruth,
  getHiddenTruths,
  getRevealedTruths,
  type NarrativeAuthorityState,
} from './narrative-authority.js';
import { traversalCore } from './traversal-core.js';

describe('PresentationChannels', () => {
  it('passes events through without filters', () => {
    const channels = new PresentationChannels();
    const event: ResolvedEvent = {
      id: 'e1',
      tick: 1,
      type: 'test',
      payload: { value: 42 },
      presentation: { channels: ['objective'] },
    };

    const results = channels.present(event);
    expect(results).toHaveLength(1);
    expect(results[0]._channel).toBe('objective');
    expect(results[0]._filtered).toBe(false);
  });

  it('filters can suppress events', () => {
    const channels = new PresentationChannels();
    channels.addFilter('narrator', () => null);

    const event: ResolvedEvent = {
      id: 'e1',
      tick: 1,
      type: 'secret.revealed',
      payload: {},
      presentation: { channels: ['narrator'] },
    };

    const results = channels.present(event);
    expect(results).toHaveLength(0);
  });

  it('filters can modify events', () => {
    const channels = new PresentationChannels();
    channels.addFilter('narrator', (event) => ({
      ...event,
      payload: { ...event.payload, damage: 999, _lie: true },
    }));

    const event: ResolvedEvent = {
      id: 'e1',
      tick: 1,
      type: 'combat.damage.applied',
      payload: { damage: 5 },
      presentation: { channels: ['narrator'] },
    };

    const results = channels.present(event);
    expect(results).toHaveLength(1);
    expect(results[0].payload.damage).toBe(999);
    expect(results[0].payload._lie).toBe(true);
    expect(results[0]._filtered).toBe(true);
  });

  it('multi-channel event routes through each independently', () => {
    const channels = new PresentationChannels();
    channels.addFilter('narrator', (event) => ({
      ...event,
      payload: { ...event.payload, narratorSays: 'nothing happened' },
    }));

    const event: ResolvedEvent = {
      id: 'e1',
      tick: 1,
      type: 'combat.contact.hit',
      payload: { damage: 10 },
      presentation: { channels: ['objective', 'narrator'] },
    };

    const results = channels.present(event);
    expect(results).toHaveLength(2);

    const objective = results.find((r) => r._channel === 'objective')!;
    const narrator = results.find((r) => r._channel === 'narrator')!;

    expect(objective.payload.damage).toBe(10); // truth
    expect(narrator.payload.narratorSays).toBe('nothing happened'); // lie
  });
});

describe('narrative-authority module', () => {
  it('conceals specified event types', () => {
    const channels = new PresentationChannels();
    const mod = createNarrativeAuthority(channels, {
      voice: 'unreliable',
      distortion: 0.5,
      conceals: ['secret.revealed'],
    });

    const engine = createTestEngine({
      modules: [traversalCore, mod],
      entities: [
        { id: 'player', blueprintId: 'player', type: 'player', name: 'Hero', tags: [], stats: {}, resources: {}, statuses: [], zoneId: 'a' },
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    const secretEvent: ResolvedEvent = {
      id: 'secret-1',
      tick: 1,
      type: 'secret.revealed',
      payload: { truth: 'the NPC is the villain' },
      presentation: { channels: ['narrator'] },
    };

    const presented = channels.present(secretEvent);
    expect(presented).toHaveLength(0); // narrator concealed it
  });

  it('distorts specified event types', () => {
    const channels = new PresentationChannels();
    const mod = createNarrativeAuthority(channels, {
      voice: 'trickster',
      distortion: 0.8,
      distorts: ['combat.damage.applied'],
    });

    createTestEngine({
      modules: [mod],
      entities: [
        { id: 'player', blueprintId: 'player', type: 'player', name: 'Hero', tags: [], stats: {}, resources: {}, statuses: [] },
      ],
    });

    const combatEvent: ResolvedEvent = {
      id: 'dmg-1',
      tick: 1,
      type: 'combat.damage.applied',
      payload: { damage: 10 },
      presentation: { channels: ['narrator'] },
    };

    const presented = channels.present(combatEvent);
    expect(presented).toHaveLength(1);
    expect(presented[0].payload._narratorDistorted).toBe(true);
    expect(presented[0].tags).toContain('narrator-distorted');
  });
});

describe('contradiction tracking + truth reveal', () => {
  it('records contradictions when narrator distorts', () => {
    const channels = new PresentationChannels();

    // Narrator lies about damage
    channels.addFilter('narrator', (event) => {
      if (event.type !== 'combat.damage.applied') return event;
      return {
        ...event,
        payload: { ...event.payload, damage: 0, narratorSays: 'The blow glances harmlessly off!' },
      };
    });

    const state: NarrativeAuthorityState = {
      objectiveLog: [],
      presentedLog: [],
      contradictions: [],
      revealedTruths: [],
    };

    const truthEvent: ResolvedEvent = {
      id: 'dmg-real',
      tick: 5,
      type: 'combat.damage.applied',
      payload: { damage: 15, targetId: 'merchant' },
      presentation: { channels: ['objective', 'narrator'] },
    };

    const presented = channels.present(truthEvent);
    recordPresentation(state, truthEvent, presented);

    // Objective truth is in the log
    expect(state.presentedLog.length).toBe(2);

    // There should be a contradiction
    expect(state.contradictions).toHaveLength(1);
    expect(state.contradictions[0].eventId).toBe('dmg-real');
    expect(state.contradictions[0].discovered).toBe(false);
  });

  it('reveals truth and marks contradiction discovered', () => {
    const state: NarrativeAuthorityState = {
      objectiveLog: [],
      presentedLog: [],
      contradictions: [
        {
          eventId: 'dmg-real',
          objectiveType: 'combat.damage.applied',
          presentedType: 'combat.damage.applied',
          objectiveValue: { damage: 15 },
          presentedValue: { damage: 0 },
          discovered: false,
        },
      ],
      revealedTruths: [],
    };

    expect(getHiddenTruths(state)).toHaveLength(1);
    expect(getRevealedTruths(state)).toHaveLength(0);

    const revealed = revealTruth(state, 'dmg-real', 10);
    expect(revealed).toBeDefined();
    expect(revealed!.discovered).toBe(true);
    expect(revealed!.discoveredAtTick).toBe(10);

    expect(getHiddenTruths(state)).toHaveLength(0);
    expect(getRevealedTruths(state)).toHaveLength(1);
    expect(state.revealedTruths).toContain('dmg-real');
  });

  it('full contradiction demo: narrator lies, player discovers truth', () => {
    const channels = new PresentationChannels();

    // The narrator claims the merchant is trustworthy
    channels.addFilter('narrator', (event) => {
      if (event.type !== 'npc.alignment.revealed') return event;
      return {
        ...event,
        payload: {
          ...event.payload,
          alignment: 'friendly',
          narratorSays: 'The merchant smiles warmly. A trustworthy soul.',
        },
      };
    });

    const state: NarrativeAuthorityState = {
      objectiveLog: [],
      presentedLog: [],
      contradictions: [],
      revealedTruths: [],
    };

    // The objective truth: the merchant is hostile
    const truthEvent: ResolvedEvent = {
      id: 'reveal-merchant',
      tick: 3,
      type: 'npc.alignment.revealed',
      payload: { npcId: 'merchant', alignment: 'hostile', intent: 'ambush' },
      presentation: { channels: ['objective', 'narrator'] },
    };

    // Present through channels
    const presented = channels.present(truthEvent);
    recordPresentation(state, truthEvent, presented);

    // Player sees: "The merchant smiles warmly"
    const narratorVersion = presented.find((p) => p._channel === 'narrator')!;
    expect(narratorVersion.payload.alignment).toBe('friendly');

    // Objective truth stored
    const objectiveVersion = presented.find((p) => p._channel === 'objective')!;
    expect(objectiveVersion.payload.alignment).toBe('hostile');

    // Contradiction recorded
    expect(state.contradictions).toHaveLength(1);
    expect(state.contradictions[0].discovered).toBe(false);

    // Later: player finds evidence (inspect a note, talk to another NPC, etc.)
    const revealed = revealTruth(state, 'reveal-merchant', 8);
    expect(revealed).toBeDefined();
    expect(revealed!.discovered).toBe(true);

    // Now the player knows the narrator lied
    expect(getHiddenTruths(state)).toHaveLength(0);
    expect(getRevealedTruths(state)).toHaveLength(1);
  });
});
