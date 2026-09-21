import { describe, it, expect } from 'vitest';
import { createTestEngine, type ResolvedEvent } from '@ai-rpg-engine/core';
import { FeltPresenter } from './felt.js';

function bearing(partial: Partial<ResolvedEvent> & Pick<ResolvedEvent, 'type'>): ResolvedEvent {
  return {
    id: partial.id ?? `evt-${partial.type}`,
    tick: partial.tick ?? 1,
    type: partial.type,
    payload: partial.payload ?? {},
    presentation: partial.presentation ?? { channels: ['objective'] },
  };
}

function worldOf() {
  return createTestEngine({
    modules: [],
    playerId: 'hero',
    startZone: 'room',
    entities: [
      {
        id: 'hero',
        blueprintId: 'hero',
        type: 'player',
        name: 'Hero',
        tags: ['player'],
        stats: {},
        resources: { hp: 10 },
        statuses: [],
        zoneId: 'room',
      },
    ],
    zones: [{ id: 'room', roomId: 'room', name: 'Room', tags: [], neighbors: [] }],
  }).world;
}

describe('FeltPresenter', () => {
  it('a zone-entry turn schedules a music stem and an ambient bed, not a sting', () => {
    const felt = new FeltPresenter();
    const payload = felt.present(worldOf(), [
      bearing({
        type: 'world.zone.entered',
        payload: { zoneId: 'crypt', tone: 'dread' },
      }),
    ]);
    const music = payload.audio.filter((c) => c.domain === 'music');
    const ambient = payload.audio.filter((c) => c.domain === 'ambient');
    expect(music.length).toBeGreaterThan(0);
    expect(music.every((c) => c.action !== 'sting')).toBe(true);
    expect(ambient.length).toBeGreaterThan(0);
    expect(payload.speaker).toBeUndefined();
  });

  it('a victory-cleared turn overlays a sting without replacing the stem action', () => {
    const felt = new FeltPresenter();
    const payload = felt.present(worldOf(), [
      bearing({
        type: 'world.zone.entered',
        payload: { zoneId: 'crypt', tone: 'dread' },
      }),
      bearing({
        type: 'combat.encounter.cleared',
        payload: { outcome: 'victory' },
      }),
    ]);
    const stings = payload.audio.filter((c) => c.action === 'sting');
    const stemPlays = payload.audio.filter((c) => c.domain === 'music' && c.action === 'play');
    expect(stings.length).toBe(1);
    expect(stings[0]?.resourceId).toMatch(/sting/);
    expect(stemPlays.length).toBeGreaterThan(0);
    expect(stemPlays.some((c) => c.resourceId === stings[0]?.resourceId)).toBe(false);
  });

  it('dialogue puts the spoken line on speaker and never on the felt payload as asides', () => {
    const felt = new FeltPresenter();
    const payload = felt.present(worldOf(), [
      bearing({
        type: 'dialogue.node.entered',
        payload: {
          text: 'The quay is closed.',
          textureHint: 'Halle does not look up.',
          dialogueHint: 'cold',
        },
      }),
    ]);
    expect(payload.speaker?.text).toBe('The quay is closed.');
    expect(JSON.stringify(payload)).not.toMatch(/Halle does not look up/);
    expect((payload as { asides?: unknown }).asides).toBeUndefined();
  });
});
