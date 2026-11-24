---
title: "Appendix A — Event Vocabulary Reference"
description: "Appendix A — Event Vocabulary Reference"
sidebar:
  order: 26
---


Simulation event types emitted via `makeEvent`, `makeCognitionEvent`, and `makeStatusEvent` across package and template source. Exported programmatically as `ENGINE_EVENT_TYPES` (and type `EngineEventType`) from `@ai-rpg-engine/core`.

This list is complete for those three emission helpers because the source-scan test in `packages/core/src/event-vocabulary.test.ts` enforces exact parity between the emitting code, `ENGINE_EVENT_TYPES`, and both appendix tables.

## Naming Convention

Events follow the pattern: `domain.object.verb`

## World & Action Events

| Event | Source | Description |
|-------|--------|-------------|
| `action.rejected` | action handlers (`traversal-core`, `combat-core`, `ability-core`, etc.) | Action failed preconditions or validation (`reason`, optional `verb` and `hint`) |
| `world.entity.inspected` | traversal-core | Actor inspected an entity (carries `entityId`, `stats`, `resources`, `tags`, and `statuses`) |
| `world.flag.changed` | dialogue-core | Dialogue `set-global` effect updated a `world.globals` flag (`key`, `value`) |
| `world.zone.entered` | traversal-core | Actor entered a zone (`zoneId`, `previousZoneId`, and optional `moodHint`/`tone`) |
| `world.zone.gate.refused` | traversal-core | Hard zone gate refused entry and reported `unmet` conditions (`zoneId`, `fromZoneId`) |
| `world.zone.gate.warned` | traversal-core | Soft zone gate warned of `unmet` conditions before allowing entry (`zoneId`, `fromZoneId`) |
| `world.zone.inspected` | traversal-core | Actor inspected current zone (`entities`, `interactables`, `exits`, `hazards`, optional hints/economy) |

## Combat & Resource Events

| Event | Source | Description |
|-------|--------|-------------|
| `combat.brace.stabilized` | combat-tactics | Brace cleared the actor's `OFF_BALANCE` status |
| `combat.brace.start` | combat-tactics | Actor entered brace stance (records whether `atChokepoint`) |
| `combat.companion.intercepted` | combat-core | Active companion intercepted an attack targeting the player (`damage`, `interceptChance`) |
| `combat.contact.hit` | combat-core | Attack hit roll succeeded against target or interceptor (`roll`, `hitChance`, `hitStyle`) |
| `combat.contact.miss` | combat-core | Attack hit roll failed (`roll`, `hitChance`) |
| `combat.counter.off_balance` | combat-core | Guarded defender countered and inflicted `OFF_BALANCE` on attacker (`causedBy`) |
| `combat.damage.applied` | combat-core | Combat damage applied to target after defense modifiers (`damage`, `previousHp`, `currentHp`) |
| `combat.disengage.fail` | combat-core | Disengage failed, applying `EXPOSED` to actor (`roll`, `needed`) |
| `combat.disengage.success` | combat-core | Disengage succeeded, applying `FLEEING` and moving actor (`fromZoneId`, `toZoneId`) |
| `combat.entity.defeated` | combat-core, ability-effects | Target HP reached zero from combat attack or ability damage (`defeatedBy`, `defeatZoneId`) |
| `combat.guard.absorbed` | combat-core | Guard absorbed incoming hit and cleared (`originalDamage`, `reducedDamage`) |
| `combat.guard.broken` | combat-core | High-vigor attacker staggered a guarded defender (`attackerVigor`, `defenderResolve`, `breakChance`) |
| `combat.guard.start` | combat-core | Actor entered `GUARDED` stance |
| `combat.morale.flee` | cognition-core | Entity morale dropped to threshold and applied `FLEEING` (`morale`, `threshold`, `reason`) |
| `combat.morale.rout` | cognition-core | Isolated entity suffered an extra `-10` rout penalty after an ally fell (`delta`, `previous`, `current`) |
| `combat.morale.shift` | cognition-core | AI entity morale shifted after miss, damage, defeat witness, or guard absorb (`delta`, `reason`) |
| `combat.reposition.fail` | combat-tactics | Reposition failed and left actor `EXPOSED` (`roll`, `needed`) |
| `combat.reposition.guard_broken` | combat-tactics | Outflanking reposition cleared target's `GUARDED` stance (`brokenBy`) |
| `combat.reposition.outflank` | combat-tactics | Targeted reposition applied `EXPOSED` to the outflanked target |
| `combat.reposition.success` | combat-tactics | Actor repositioned for tactical advantage (`roll`, `needed`, optional `targetId`) |
| `combat.will.hold` | cognition-core | High-will entity mitigated severe morale loss (`rawLoss`, `mitigatedLoss`, `will`) |
| `resource.changed` | ability-core, combat-core, combat-tactics | Entity resource pool changed (stamina cost or HP loss; `resource`, `previous`, `current`, `delta`) |

## Ability Events

| Event | Source | Description |
|-------|--------|-------------|
| `ability.check.failed` | ability-core | Required stat check failed with `onFail: 'abort'` after deducting costs (`checks`, `aborted`) |
| `ability.damage.applied` | ability-effects | Ability damage effect reduced target HP (`baseDamage`, `finalDamage`, `damageType`, `halfDamage`) |
| `ability.effect.unknown` | ability-effects | Ability referenced an unregistered effect type (`effectType`, `reason`) |
| `ability.heal.applied` | ability-effects | Ability heal effect restored a target resource (`resource`, `amount`, `actual`, `before`, `after`) |
| `ability.rejected` | ability-core | Ability failed tag requirements, cooldown, resource cost, or target resolution (`reason`) |
| `ability.resolved` | ability-effects | All effects for an ability invocation finished resolving (`effectCount`, `allChecksPassed`) |
| `ability.resource.modified` | ability-effects | Ability `resource-modify` effect changed a target resource (`resource`, `delta`, `actual`) |
| `ability.stat.modified` | ability-effects | Ability `stat-modify` effect changed a target stat (`stat`, `delta`, `before`, `after`) |
| `ability.status.applied` | ability-effects | Ability applied a status effect after resistance checks (`statusId`, `duration`, `resistance`) |
| `ability.status.immune` | ability-effects | Target immunity prevented an ability status application (`statusId`) |
| `ability.status.removed` | ability-effects | Ability removed a target status directly or by semantic tag (`statusId`, optional `matchedTags`) |
| `ability.status.resisted` | ability-effects | Target resistance halved an ability status duration (`statusId`, `baseDuration`, `adjustedDuration`) |
| `ability.status.unregistered` | ability-effects | Ability applied an unregistered status with no semantic tags before continuing |
| `ability.status.vulnerable` | ability-effects | Target vulnerability extended an ability status duration (`statusId`, `baseDuration`, `adjustedDuration`) |
| `ability.used` | ability-core | Ability passed checks and deducted costs to begin resolution (`abilityId`, `verb`, `targetIds`) |

## Status Events

| Event | Source | Description |
|-------|--------|-------------|
| `status.applied` | status-core | Status effect added to entity or refreshed in place (`statusId`, `stacks` or `refreshed`) |
| `status.expired` | status-core | Status effect removed because its `expiresAtTick` was reached (`statusId`, `stacks`) |
| `status.removed` | status-core | Status effect explicitly removed from an entity (`statusId`) |
| `status.stacked` | status-core | Existing stackable status incremented or refreshed at max stacks (`statusId`, `stacks`) |

## Dialogue, Reputation & Leverage Events

| Event | Source | Description |
|-------|--------|-------------|
| `dialogue.choice.selected` | dialogue-core | Actor selected a dialogue choice (`dialogueId`, `choiceId`, `choiceText`) |
| `dialogue.effect.unknown` | dialogue-core | Dialogue effect lacked a player entity or handler (`effectType`, `reason`) |
| `dialogue.ended` | dialogue-core | Conversation terminated at a missing target node or choiceless leaf node (`dialogueId`) |
| `dialogue.node.entered` | dialogue-core | Entered a dialogue node with filtered choices and optional narrator hints (`nodeId`, `speaker`) |
| `dialogue.started` | dialogue-core | Actor initiated dialogue with an NPC (`dialogueId`, `speakerId`, `speakerName`) |
| `leverage.adjusted` | dialogue-core | Dialogue `leverage-adjust` effect modified a leverage currency (`currency`, `delta`, `value`) |
| `leverage.resolved` | player-leverage | Social, rumor, diplomacy, or sabotage leverage action resolved (`verb`, `subAction`, `effects`) |
| `reputation.adjusted` | dialogue-core | Dialogue `reputation-adjust` effect updated accrued faction reputation (`factionId`, `delta`, `value`) |
| `rumor.seeded` | player-leverage | Player rumor verb spawned a rumor record (`rumorId`, `claim`, `valence`, `targetFactionId`) |

## Inventory, Equipment, Crafting & Trade Events

| Event | Source | Description |
|-------|--------|-------------|
| `inventory.item.received` | trade-core | Bought item entered actor inventory and notified district commerce listeners (`entityId`, `itemId`, `districtId`) |
| `item.acquired` | inventory-core | Recipient received an item transferred via `give` (`itemId`, `entityId`, `fromEntityId`) |
| `item.already-equipped` | equipment-core | Actor tried to equip an item already occupying its slot (`itemId`, `slot`) |
| `item.bought` | trade-core | Actor purchased an item from a district market (`itemId`, `districtId`, `value`, `currency`) |
| `item.crafted` | crafting-recipes | Actor crafted an item from materials in a district (`recipeId`, `outputItem`, `materialsConsumed`) |
| `item.equipped` | equipment-core | Actor equipped an item and committed loadout/status changes (`itemId`, `slot`, optional `displacedItemId`) |
| `item.given` | inventory-core | Actor transferred an item to a co-located recipient (`itemId`, `fromEntityId`, `toEntityId`) |
| `item.lost` | inventory-core | Sender lost possession of a given item for item chronicle tracking (`itemId`, `entityId`, `toEntityId`) |
| `item.modified` | crafting-recipes | Actor modified an item using a modification recipe (`itemId`, `recipeId`, `statDelta`, `loreAppend`) |
| `item.recognized` | item-recognition | Faction witnesses recognized an actor's equipped item upon zone entry (`itemId`, `recognitionType`, `stanceDelta`) |
| `item.repaired` | crafting-recipes | Actor repaired an item with a repair recipe (`itemId`, `recipeId`, `materialsConsumed`, `districtId`) |
| `item.salvaged` | crafting-recipes | Actor salvaged an item into crafting materials (`itemId`, `materials`, `byproducts`) |
| `item.sold` | trade-core | Actor sold an item in a district market (`itemId`, `districtId`, `value`, `currency`, `advice`) |
| `item.unequipped` | equipment-core | Actor unequipped an item from an equipment slot (`itemId`, `slot`) |
| `item.used` | inventory-core | Actor consumed an item with a registered use effect (`entityId`, `itemId`, `consumed`) |

## Companion Events

| Event | Source | Description |
|-------|--------|-------------|
| `companion.departed` | item-recognition, player-leverage, world-tick | Companion left the party after a morale-triggering reaction (`npcId`, `role`, `reason`) |
| `companion.reaction` | item-recognition, player-leverage, world-tick | Companion reacted to an event trigger with a morale shift (`npcId`, `trigger`, `moraleDelta`, `morale`) |
| `companion.recruited` | companion-core | NPC joined the player's party (`npcId`, `role`, `faction`, `partySize`) |

## Opportunity & Pressure Events

| Event | Source | Description |
|-------|--------|-------------|
| `opportunity.abandoned` | opportunity-resolution | Player abandoned an accepted opportunity (`opportunityId`, `kind`, `summary`, `effects`) |
| `opportunity.accepted` | opportunity-resolution | Player accepted an available opportunity (`opportunityId`, `kind`, `title`) |
| `opportunity.betrayed` | opportunity-resolution | Player betrayed an accepted counterparty opportunity (`opportunityId`, `kind`, `summary`, `effects`) |
| `opportunity.completed` | opportunity-resolution | Player completed an accepted opportunity (`opportunityId`, `kind`, `summary`, `effects`) |
| `pressure.resolved` | opportunity-resolution, world-tick | Player or completed opportunity resolved an active world pressure (`pressureId`, `kind`, `resolutionType`) |
| `pressure.spawned` | player-leverage, world-tick | Leverage action or pressure fallout chain spawned a new world pressure (`pressureId`, `kind`, `urgency`) |

## Merchant Contract Events

| Event | Source | Description |
|-------|--------|-------------|
| `merchant.audit.requested` | starter-merchant (`contract-core`) | Actor audited open contracts, exposure, and overdue obligations (`openCount`, `overdueCount`, `balanced`) |
| `merchant.contract.consigned` | starter-merchant (`contract-core`) | Actor consigned goods to a broker against a future payment obligation (`obligationId`, `itemId`, `value`, `dueTick`) |
| `merchant.item.appraised` | starter-merchant (`contract-core`) | Actor appraised an item's trade value band (`itemId`, `accuracy`, `estimateLow`, `estimateHigh`) |
| `merchant.price.haggled` | starter-merchant (`contract-core`) | Actor spent liquidity to bank a price margin against a counterparty (`counterparty`, `marginPercent`, `won`) |
| `merchant.risk.underwritten` | starter-merchant (`contract-core`) | Actor underwrote a counterparty policy for an immediate liquidity premium (`policyId`, `premium`, `exposure`) |
