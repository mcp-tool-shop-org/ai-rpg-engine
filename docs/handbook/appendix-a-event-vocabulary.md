# Appendix A — Event Vocabulary Reference

All core event types used by the engine and built-in modules.

## Naming Convention

Events follow the pattern: `domain.object.verb`

## Core Events

| Event | Source | Description |
|-------|--------|-------------|
| `world.zone.entered` | traversal | Entity entered a zone |
| `world.zone.exited` | traversal | Entity left a zone |

## Combat Events

| Event | Source | Description |
|-------|--------|-------------|
| `combat.contact.hit` | combat-core | Attack connected |
| `combat.contact.missed` | combat-core | Attack missed |
| `combat.damage.applied` | combat-core | Damage dealt to entity |
| `combat.entity.defeated` | combat-core | Entity HP reached zero |

## Status Events

| Event | Source | Description |
|-------|--------|-------------|
| `status.applied` | status-core | Status effect added |
| `status.tick` | status-core | Status effect ticked |
| `status.expired` | status-core | Status effect ended |

## Dialogue Events

| Event | Source | Description |
|-------|--------|-------------|
| `dialogue.started` | dialogue-core | Conversation began |
| `dialogue.node.entered` | dialogue-core | Entered a dialogue node |
| `dialogue.choice.selected` | dialogue-core | Player made a choice |
| `dialogue.ended` | dialogue-core | Conversation ended |

## Environment Events

| Event | Source | Description |
|-------|--------|-------------|
| `environment.noise.changed` | environment-core | Zone noise level changed |
| `environment.hazard.triggered` | environment-core | Hazard activated |
| `environment.tick` | environment-core | Environment simulation tick |

## Cognition Events

| Event | Source | Description |
|-------|--------|-------------|
| `cognition.belief.updated` | cognition-core | Entity belief changed |
| `cognition.intent.selected` | cognition-core | AI chose an action |

## Perception Events

| Event | Source | Description |
|-------|--------|-------------|
| `perception.detected` | perception-filter | Entity perceived an event |
| `perception.missed` | perception-filter | Entity failed to perceive |

## Progression Events

| Event | Source | Description |
|-------|--------|-------------|
| `progression.currency.earned` | progression-core | Currency awarded |
| `progression.node.unlocked` | progression-core | Tree node unlocked |

## Faction Events

| Event | Source | Description |
|-------|--------|-------------|
| `faction.belief.updated` | faction-cognition | Faction shared belief changed |
| `faction.alert.changed` | faction-cognition | Faction alert level changed |

## Rumor Events

| Event | Source | Description |
|-------|--------|-------------|
| `rumor.belief.propagated` | rumor-propagation | Rumor delivered to faction |
| `rumor.scheduled` | rumor-propagation | Rumor queued for delayed delivery |

## Presentation Events

| Event | Source | Description |
|-------|--------|-------------|
| `audio.cue.requested` | channels | Sound cue for presentation |
| `narrative.concealed` | narrative-authority | Information hidden from player |
| `narrative.distorted` | narrative-authority | Information altered |
| `narrative.revealed` | narrative-authority | Hidden truth uncovered |
