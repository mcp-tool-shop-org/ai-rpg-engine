import { describe, it, expect } from 'vitest';
import { createGame as createFantasy } from '@signalfire/starter-fantasy';
import { createGame as createCyberpunk } from './setup.js';
import {
  getDistrictState,
  getDistrictForZone,
  getDistrictThreatLevel,
  isDistrictOnAlert,
  traceEntityBelief,
  traceFactionBelief,
  formatBeliefTrace,
  presentForObserver,
  presentForAllObservers,
  getDivergences,
  inspectDistrict,
  inspectAllDistricts,
  formatDistrictInspection,
  createSnapshot,
} from '@signalfire/modules';

describe('Phase 5 — Fantasy integration', () => {
  it('chapel zones belong to correct districts', () => {
    const engine = createFantasy(100);
    expect(getDistrictForZone(engine.world, 'chapel-entrance')).toBe('chapel-grounds');
    expect(getDistrictForZone(engine.world, 'crypt-chamber')).toBe('crypt-depths');
  });

  it('entering crypt raises intruder likelihood in crypt-depths district', () => {
    const engine = createFantasy(100);

    // Move to crypt
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.submitAction('move', { targetIds: ['vestry-door'] });
    engine.submitAction('move', { targetIds: ['crypt-chamber'] });

    const state = getDistrictState(engine.world, 'crypt-depths');
    // Player entered crypt-depths (controlled by chapel-undead), player not in faction
    expect(state!.intruderLikelihood).toBeGreaterThan(0);
  });

  it('combat in crypt raises district alert pressure', () => {
    const engine = createFantasy(100);
    engine.store.state.entities['player'].zoneId = 'crypt-chamber';
    engine.store.state.locationId = 'crypt-chamber';

    engine.submitAction('attack', { targetIds: ['ash-ghoul'] });

    const state = getDistrictState(engine.world, 'crypt-depths');
    expect(state!.alertPressure).toBeGreaterThan(0);
  });

  it('undead presentation rule frames player entry as trespass', () => {
    const engine = createFantasy(100);
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.submitAction('move', { targetIds: ['vestry-door'] });
    engine.submitAction('move', { targetIds: ['crypt-chamber'] });

    const entryEvent = engine.world.eventLog.find(
      (e) => e.type === 'world.zone.entered' && e.payload.zoneId === 'crypt-chamber',
    );
    expect(entryEvent).toBeDefined();

    const ghoulView = presentForObserver(entryEvent!, 'ash-ghoul', engine.world);
    expect(ghoulView._appliedRules).toContain('undead-threat-framing');
    expect(ghoulView.payload._undeadPerception).toBe(true);
  });

  it('traces ghoul hostile belief about player', () => {
    const engine = createFantasy(100);
    engine.store.state.entities['player'].zoneId = 'crypt-chamber';
    engine.store.state.locationId = 'crypt-chamber';

    engine.submitAction('attack', { targetIds: ['ash-ghoul'] });

    const trace = traceEntityBelief(engine.world, 'ash-ghoul', 'player', 'hostile');
    expect(trace.currentValue).toBe(true);
    expect(trace.chain.length).toBeGreaterThan(0);

    const formatted = formatBeliefTrace(trace);
    expect(formatted).toContain('Entity ash-ghoul');
    expect(formatted).toContain('hostile');
  });

  it('district inspection works via inspector', () => {
    const engine = createFantasy(100);
    const inspection = inspectDistrict(engine.world, 'crypt-depths');
    expect(inspection).not.toBeNull();
    expect(inspection!.name).toBe('Crypt Depths');
    expect(inspection!.controllingFaction).toBe('chapel-undead');
    expect(inspection!.zoneIds).toContain('crypt-chamber');
  });
});

describe('Phase 5 — Cyberpunk integration', () => {
  it('vault zones belong to vault-complex district', () => {
    const engine = createCyberpunk(200);
    expect(getDistrictForZone(engine.world, 'data-vault')).toBe('vault-complex');
    expect(getDistrictForZone(engine.world, 'server-room')).toBe('vault-complex');
    expect(getDistrictForZone(engine.world, 'street-level')).toBe('neon-street');
  });

  it('ICE security framing presents player entry as intrusion', () => {
    const engine = createCyberpunk(200);
    engine.store.state.entities['runner'].zoneId = 'server-room';
    engine.store.state.locationId = 'server-room';
    engine.submitAction('move', { targetIds: ['data-vault'] });

    const entryEvent = engine.world.eventLog.find(
      (e) => e.type === 'world.zone.entered' && e.payload.zoneId === 'data-vault',
    );

    const iceView = presentForObserver(entryEvent!, 'ice-sentry', engine.world);
    expect(iceView._appliedRules).toContain('ice-security-framing');
    expect(iceView.payload._securityFraming).toBe(true);
  });

  it('district alert pressure rises from vault combat', () => {
    const engine = createCyberpunk(200);
    engine.store.state.entities['runner'].zoneId = 'data-vault';
    engine.store.state.locationId = 'data-vault';

    engine.submitAction('attack', { targetIds: ['ice-sentry'] });

    const state = getDistrictState(engine.world, 'vault-complex');
    expect(state!.alertPressure).toBeGreaterThan(0);
  });

  it('traces faction belief from combat through rumor chain', () => {
    const engine = createCyberpunk(200);
    engine.store.state.entities['runner'].zoneId = 'data-vault';
    engine.store.state.locationId = 'data-vault';

    engine.submitAction('attack', { targetIds: ['ice-sentry'] });
    engine.submitAction('faction-tick');
    engine.submitAction('faction-tick');

    const trace = traceFactionBelief(engine.world, 'vault-ice', 'runner', 'hostile');
    expect(trace.currentValue).toBe(true);
    expect(trace.chain.some((s) => s.type === 'rumor-scheduled')).toBe(true);
    expect(trace.chain.some((s) => s.type === 'faction-belief-updated')).toBe(true);
  });

  it('snapshot includes district data', () => {
    const engine = createCyberpunk(200);
    const snapshot = createSnapshot(engine.world);

    expect(snapshot.districts).toBeDefined();
    expect(snapshot.districts['vault-complex']).toBeDefined();
    expect(snapshot.districts['vault-complex'].controllingFaction).toBe('vault-ice');
  });

  it('formatDistrictInspection produces readable output', () => {
    const engine = createCyberpunk(200);
    const inspection = inspectDistrict(engine.world, 'vault-complex');
    const formatted = formatDistrictInspection(inspection!);

    expect(formatted).toContain('Vault Complex');
    expect(formatted).toContain('vault-ice');
    expect(formatted).toContain('Alert Pressure');
    expect(formatted).toContain('Surveillance');
  });
});

describe('Phase 5 — Genre portability', () => {
  it('both starters have districts without core changes', () => {
    const fantasy = createFantasy(300);
    const cyberpunk = createCyberpunk(300);

    const fantasyDistricts = inspectAllDistricts(fantasy.world);
    const cyberpunkDistricts = inspectAllDistricts(cyberpunk.world);

    expect(Object.keys(fantasyDistricts).length).toBe(2);
    expect(Object.keys(cyberpunkDistricts).length).toBe(2);

    // Different district names, same engine
    expect(fantasyDistricts['chapel-grounds']).toBeDefined();
    expect(cyberpunkDistricts['vault-complex']).toBeDefined();
  });

  it('divergent presentation works in both genres', () => {
    const fantasy = createFantasy(300);
    const cyberpunk = createCyberpunk(300);

    // Fantasy: move to crypt
    fantasy.store.state.entities['player'].zoneId = 'vestry-door';
    fantasy.store.state.locationId = 'vestry-door';
    fantasy.submitAction('move', { targetIds: ['crypt-chamber'] });

    // Cyberpunk: move to data vault
    cyberpunk.store.state.entities['runner'].zoneId = 'server-room';
    cyberpunk.store.state.locationId = 'server-room';
    cyberpunk.submitAction('move', { targetIds: ['data-vault'] });

    // Get move events
    const fantasyEntry = fantasy.world.eventLog.find(
      (e) => e.type === 'world.zone.entered' && e.payload.zoneId === 'crypt-chamber',
    );
    const cyberpunkEntry = cyberpunk.world.eventLog.find(
      (e) => e.type === 'world.zone.entered' && e.payload.zoneId === 'data-vault',
    );

    const ghoulView = presentForObserver(fantasyEntry!, 'ash-ghoul', fantasy.world);
    const iceView = presentForObserver(cyberpunkEntry!, 'ice-sentry', cyberpunk.world);

    // Both have genre-specific framing
    expect(ghoulView.payload._undeadPerception).toBe(true);
    expect(iceView.payload._securityFraming).toBe(true);
  });
});
