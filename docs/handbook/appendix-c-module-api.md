# Appendix C — Module API Reference

Function signatures and hooks for built-in modules.

## Core Engine

### createEngine(config)

Creates and returns an engine instance.

### createTestEngine(config)

Creates an isolated engine instance for testing.

## Cognition Core — `createCognitionCore(config?)`

| Function | Signature | Description |
|----------|-----------|-------------|
| getCognition | `(world, entityId) → CognitionState` | Get entity's cognition state |
| setBelief | `(world, entityId, belief) → void` | Set a belief |
| getBelief | `(world, entityId, subject, key) → Belief` | Get a specific belief |
| getBeliefValue | `(world, entityId, subject, key) → any` | Get belief value directly |
| believes | `(world, entityId, subject, key, value) → boolean` | Check if entity holds a belief |
| addMemory | `(world, entityId, memory) → void` | Record a memory |
| getMemories | `(world, entityId) → Memory[]` | Get all memories |
| getRecentMemories | `(world, entityId, count) → Memory[]` | Get N most recent memories |
| checkPerception | `(world, entityId, difficulty, stat?) → PerceptionResult` | Roll a perception check |
| selectIntent | `(world, entityId) → IntentOption` | Choose an action from AI profile |

## Perception Filter — `createPerceptionFilter(config?)`

| Function | Signature | Description |
|----------|-----------|-------------|
| getPerceptionLog | `(world, entityId) → PerceivedEvent[]` | Full perception history |
| getRecentPerceptions | `(world, entityId, count) → PerceivedEvent[]` | Recent perceptions |
| didPerceive | `(world, entityId, eventType) → boolean` | Check if entity perceived event type |
| whoPerceived | `(world, eventType) → string[]` | List entities that perceived event |

## Progression Core — `createProgressionCore(config)`

| Function | Signature | Description |
|----------|-----------|-------------|
| getCurrency | `(world, entityId, currency) → number` | Get currency balance |
| addCurrency | `(world, entityId, currency, amount) → void` | Add currency |
| spendCurrency | `(world, entityId, currency, amount) → boolean` | Spend currency |
| isNodeUnlocked | `(world, entityId, nodeId) → boolean` | Check if node is unlocked |
| canUnlock | `(world, entityId, nodeId) → boolean` | Check if node can be unlocked |
| unlockNode | `(world, entityId, nodeId) → UnlockResult` | Unlock a progression node |
| getAvailableNodes | `(world, entityId) → TreeNode[]` | List unlockable nodes |
| getUnlockedNodes | `(world, entityId) → string[]` | List unlocked node IDs |

## Environment Core — `createEnvironmentCore(config?)`

| Function | Signature | Description |
|----------|-----------|-------------|
| getZoneProperty | `(world, zoneId, key) → number` | Get dynamic zone property |
| setZoneProperty | `(world, zoneId, key, value) → void` | Set zone property |
| modifyZoneProperty | `(world, zoneId, key, delta) → void` | Modify property by delta |
| processEnvironmentDecays | `(world) → void` | Process all decay timers |

## Narrative Authority — `createNarrativeAuthority(config?)`

| Function | Signature | Description |
|----------|-----------|-------------|
| conceal | `(world, eventId, reason) → void` | Hide an event from presentation |
| distort | `(world, eventId, replacement) → void` | Replace event in presentation |
| getContradictions | `(world) → Contradiction[]` | List recorded contradictions |
| reveal | `(world, contradictionId) → void` | Expose a hidden truth |

## District Core — `createDistrictCore(config)`

| Function | Signature | Description |
|----------|-----------|-------------|
| getDistrictForZone | `(world, zoneId) → string \| undefined` | Find which district a zone belongs to |
| getDistrictState | `(world, districtId) → DistrictMetrics \| undefined` | Get district aggregate metrics |
| getDistrictDefinition | `(world, districtId) → DistrictDefinition \| undefined` | Get district config |
| getAllDistrictIds | `(world) → string[]` | List all district IDs |
| getDistrictMetric | `(world, districtId, metric) → number` | Get a specific metric value |
| modifyDistrictMetric | `(world, districtId, metric, delta) → void` | Modify a metric by delta (clamped 0-100) |
| isDistrictOnAlert | `(world, districtId) → boolean` | Check if alertPressure > 30 |
| getDistrictThreatLevel | `(world, districtId) → number` | Weighted composite of all metrics |

## Belief Provenance — `createBeliefProvenance()`

| Function | Signature | Description |
|----------|-----------|-------------|
| traceEntityBelief | `(world, entityId, subject, key) → BeliefTrace` | Trace an entity belief's provenance |
| traceFactionBelief | `(world, factionId, subject, key) → BeliefTrace` | Trace a faction belief through rumor chain |
| traceSubject | `(world, subject) → BeliefTrace[]` | Find all beliefs about a subject |
| formatBeliefTrace | `(trace) → string` | Human-readable forensic narrative |

## Observer Presentation — `createObserverPresentation(config?)`

| Function | Signature | Description |
|----------|-----------|-------------|
| presentForObserver | `(event, observerId, world, rules?) → ObserverPresentedEvent` | Present event from observer's perspective |
| presentForAllObservers | `(event, world) → ObserverPresentedEvent[]` | One version per AI entity |
| getDivergences | `(world) → DivergenceRecord[]` | All recorded divergences |
| getEventDivergences | `(world, eventId) → DivergenceRecord[]` | Divergences for a specific event |

## Simulation Inspector — `createSimulationInspector()`

| Function | Signature | Description |
|----------|-----------|-------------|
| inspectEntity | `(world, entityId) → EntityInspection` | Full entity cognitive state |
| inspectFaction | `(world, factionId) → FactionInspection` | Faction beliefs and alert level |
| inspectZone | `(world, zoneId) → ZoneInspection` | Zone environment state |
| inspectDistrict | `(world, districtId) → DistrictInspection` | District aggregate metrics |
| inspectAllDistricts | `(world) → Record<string, DistrictInspection>` | All district inspections |
| createSnapshot | `(world) → SimulationSnapshot` | Full world snapshot |
| formatEntityInspection | `(inspection) → string` | Text format for entity |
| formatFactionInspection | `(inspection) → string` | Text format for faction |
| formatDistrictInspection | `(inspection) → string` | Text format for district |
