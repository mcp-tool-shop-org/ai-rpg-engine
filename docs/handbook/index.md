# AI RPG Engine Handbook

A guide to building simulation-driven RPG worlds — from first room to experiment-driven balancing.

---

## Start Here

New to AI RPG Engine? Follow this path:

1. **[What AI RPG Engine Is](./01-what-ai-rpg-engine-is.md)** — overview and positioning
2. **[Engine Philosophy](./02-engine-philosophy.md)** — deterministic worlds, truth vs presentation
3. **[Quick Start](./03-quick-start.md)** — install, run, create your first content

---

## By Topic

### Building Worlds

Create rooms, entities, factions, quests, and content packs.

- [Content Files](./13-content-files.md) — how content is structured
- [Rooms and Zones](./14-rooms-and-zones.md) — spatial design
- [Entities](./15-entities.md) — NPCs, creatures, players
- [Dialogue Trees](./16-dialogue-trees.md) — branching conversations
- [Items and Status Effects](./17-items-and-status-effects.md) — equipment, consumables, buffs
- [Equipment](./30-equipment.md) — gear types, item provenance, relic growth
- [Character Profiles](./31-character-profiles.md) — progression state, injuries, reputation
- [The Chapel Threshold](./20-chapel-threshold.md) — fantasy starter walkthrough
- [Neon Lockbox](./21-neon-lockbox.md) — cyberpunk starter walkthrough

### Understanding the Simulation

How the engine processes actions, events, perception, and cognition.

- [The Simulation Core](./04-simulation-core.md) — tick loop, world state, action pipeline
- [The Event System](./05-event-system.md) — structured events, subscriptions
- [AI Cognition](./08-ai-cognition.md) — beliefs, intent, morale, memory
- [Perception Layers](./09-perception-layers.md) — sensory channels, clarity, distortion
- [Narrative Authority](./12-narrative-authority.md) — truth vs presentation, unreliable narration

### Living Systems

NPC agency, districts, companions, leverage, and strategic play.

- [NPC Agency](./37-npc-agency.md) — goals, obligations, loyalty breakpoints, consequence chains
- [District Life](./38-district-life.md) — commerce, morale, safety, mood derivation
- [Companions & Party Dynamics](./39-companions.md) — recruitment, morale, departure risk

### Balancing Worlds

Analyze replay data, tune mechanics, run experiments.

- [AI-Assisted Worldbuilding](./36-ai-worldbuilding.md) — scaffold, critique, tune, experiment workflows
- [Deterministic Replay](./33-deterministic-replay.md) — reproduce and inspect any session
- [Observability](./34-observability.md) — runtime inspection, health checks

### Using Chat Mode

The interactive design studio.

- [AI-Assisted Worldbuilding](./36-ai-worldbuilding.md) — chat shell commands, guided workflows, studio UX

---

## Diagrams

### Simulation Pipeline

```
action → validation → resolution → events → perception → cognition → faction beliefs → district metrics → NPC agency → companion reactions
```

### AI Authoring Pipeline

```
prompt → scaffold → critique → iterate → session memory
```

### Studio Workflow

```
build → simulate → analyze → tune → experiment
```

---

## Full Table of Contents

### Part I — Orientation

1. [What AI RPG Engine Is](./01-what-ai-rpg-engine-is.md)
2. [Engine Philosophy](./02-engine-philosophy.md)
3. [Quick Start](./03-quick-start.md)

### Part II — Engine Architecture

4. [The Simulation Core](./04-simulation-core.md)
5. [The Event System](./05-event-system.md)
6. [Modules](./06-modules.md)
7. [Rulesets](./07-rulesets.md)

### Part III — Simulation Systems

8. [AI Cognition](./08-ai-cognition.md)
9. [Perception Layers](./09-perception-layers.md)
10. [Environment Simulation](./10-environment-simulation.md)
11. [Progression System](./11-progression-system.md)
12. [Narrative Authority](./12-narrative-authority.md)

### Part IV — Authoring Games

13. [Content Files](./13-content-files.md)
14. [Rooms and Zones](./14-rooms-and-zones.md)
15. [Entities](./15-entities.md)
16. [Dialogue Trees](./16-dialogue-trees.md)
17. [Items and Status Effects](./17-items-and-status-effects.md)

### Part V — Building Modules

18. [Writing a Module](./18-writing-a-module.md)
19. [Testing Modules](./19-testing-modules.md)

### Part VI — Starter Worlds

20. [The Chapel Threshold (Fantasy)](./20-chapel-threshold.md)
21. [Neon Lockbox (Cyberpunk)](./21-neon-lockbox.md)
22. [Gaslight Detective (Victorian Mystery)](./22-gaslight-detective.md)
23. [Black Flag Requiem (Pirate)](./23-black-flag-requiem.md)
24. [Ashfall Dead (Zombie Survival)](./24-ashfall-dead.md)
25. [Dust Devil's Bargain (Weird West)](./25-dust-devils-bargain.md)
26. [Signal Loss (Sci-Fi Colony)](./26-signal-loss.md)

### Part VII — Character Systems

27. [Character Creation](./27-character-creation.md)
28. [Asset Registry](./28-asset-registry.md)
29. [Image Generation](./29-image-generation.md)
30. [Equipment](./30-equipment.md)
31. [Character Profiles](./31-character-profiles.md)

### Part VIII — Debugging and Tools

32. [Save Files](./32-save-files.md)
33. [Deterministic Replay](./33-deterministic-replay.md)
34. [Observability](./34-observability.md)

### Part IX — Live Systems

35. [Planned Systems](./35-planned-systems.md)
36. [AI-Assisted Worldbuilding](./36-ai-worldbuilding.md)
37. [NPC Agency](./37-npc-agency.md)
38. [District Life](./38-district-life.md)
39. [Companions & Party Dynamics](./39-companions.md)

### Appendix

- [A. Event Vocabulary Reference](./appendix-a-event-vocabulary.md)
- [B. Schema Reference](./appendix-b-schema-reference.md)
- [C. Module API Reference](./appendix-c-module-api.md)
- [D. CLI Reference](./appendix-d-cli-reference.md)

---

AI RPG Engine does not tell you what kind of world to build. It gives you the tools to build one that behaves.
