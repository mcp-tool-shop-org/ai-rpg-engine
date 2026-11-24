---
title: "Appendix A — Event Vocabulary Reference"
description: "Appendix A — Event Vocabulary Reference"
sidebar:
  order: 26
---

Complete catalog of all simulation event types emitted across the engine, built-in modules, and starters/templates (`165` event types across every event sink and `ResolvedEvent` / `PendingEffect` literal). Exported programmatically as `ENGINE_EVENT_TYPES` (and type `EngineEventType`) from `@ai-rpg-engine/core`.

The source-scan and unregistered-sink guard tests in `packages/core/src/event-vocabulary.test.ts` enforce exact parity across all emitting sinks, `ENGINE_EVENT_TYPES`, and both appendix tables (including every row's `Source` emitter list).

## Naming Convention

Events follow the pattern: `domain.object.verb`

Dynamic event types built from finite TypeScript union templates (`module.${phase}.failed` and `opportunity.${resolutionType}`) are resolved through the TypeScript `TypeChecker` into their concrete member types below. If an unbounded runtime dynamic event type is introduced, it is documented and registered explicitly as a pattern with `<placeholder>` segments (for example `domain.action.<kind>`) and verified by `packages/core/src/event-vocabulary.test.ts`.

## Core, World, Action & Lifecycle Events

| Event | Source | Description |
|-------|--------|-------------|
| `action.declared` | core (actions) | Action dispatch began execution (`verb`, `actorId`, optional `targetIds`) |
| `action.rejected` | ability-core, combat-core, combat-tactics, companion-core, core (actions), core (engine), crafting-recipes, dialogue-core, equipment-core, inventory-core, opportunity-resolution, player-leverage, sidecar (server), starter-bounty-hunter (pursuit-core), starter-merchant (contract-core), trade-core, traversal-core, world-tick | Action failed preconditions or validation (`reason`, optional `verb` and `hint`) |
| `action.resolved` | core (actions) | Action dispatch finished resolving (`verb`, `actorId`, `eventCount`) |
| `encounter.spawned` | encounter-spawn | Encounter spawner placed an encounter in a zone (`encounterId`, `encounterName`, `composition`) |
| `event.log.compacted` | core (world) | World event log trimmed older entries beyond retention limit |
| `hazard.damage.applied` | hazard-interpreter | Zone hazard applied typed damage to an entity (`hazardId`, `hazardName`, `zoneId`, `entityId`) |
| `hazard.depth.exceeded` | hazard-interpreter | Typed hazard recursion stopped at `HAZARD_DEPTH_LIMIT` (`zoneId`, `entityId`, `limit`) |
| `module.init.failed` | core (engine), core (modules) | Module initialization error caught by engine/module runtime (`moduleId`, `reason`; from `module.${phase}.failed`) |
| `module.round.failed` | core (engine), core (modules) | Module round-tick error caught by module runtime (`moduleId`, `reason`; from `module.${phase}.failed`) |
| `module.teardown.failed` | core (engine), core (modules) | Module teardown error caught by module runtime (`moduleId`, `reason`; from `module.${phase}.failed`) |
| `pending.failed` | core (engine) | Due pending effect failed during dispatch (`pendingId`, `type`, `reason`) |
| `pending.skipped` | core (world) | Scheduled pending effect was skipped at execution time |
| `resource.modify.missed` | core (world) | Resource mutation targeted a missing entity (`entityId`, `resourceId`, `delta`, `reason`) |
| `rule.effect.failed` | core (actions), core (modules) | Registered rule or effect handler threw during action or module execution |
| `world.entity.inspected` | traversal-core | Actor inspected an entity (`entityId`, `stats`, `resources`, `tags`, and `statuses`) |
| `world.flag.changed` | dialogue-core | Dialogue `set-global` effect updated a `world.globals` flag (`key`, `value`) |
| `world.zone.entered` | traversal-core | Actor entered a zone (`zoneId`, optional `previousZoneId`, `placement`) |
| `world.zone.gate.refused` | traversal-core | Hard zone gate refused entry and reported `unmet` conditions (`zoneId`, `fromZoneId`) |
| `world.zone.gate.warned` | traversal-core | Soft zone gate warned of `unmet` conditions before allowing entry (`zoneId`, `fromZoneId`) |
| `world.zone.inspected` | traversal-core | Actor inspected current zone (`entities`, `interactables`, `exits`, `hazards`, optional hints/economy) |
| `world.zone.state.changed` | zone-state | Zone state transitioned between named states (`zoneId`, `zoneName`, `from`, `to`) |

## Combat, Resource, Recovery & Boss Role Events

| Event | Source | Description |
|-------|--------|-------------|
| `boss.definition.invalid` | combat-roles | Boss phase configuration failed validation checks |
| `boss.phase.spawn.unresolved` | combat-roles | Boss phase transition could not resolve configured spawn entity definitions |
| `boss.phase.transition` | combat-roles | Boss entity transitioned into a subsequent combat phase |
| `combat.aftermath.hp-tick` | combat-recovery | Hidden recovery tick adjusted survivor HP (`entityId`, `prevHp`) |
| `combat.aftermath.injury` | combat-recovery | Hidden post-combat recovery recorded an injury consequence (`entityId`, `entityName`) |
| `combat.aftermath.morale` | combat-recovery | Hidden post-combat recovery adjusted survivor morale (`entityId`, `entityName`) |
| `combat.aftermath.recovery-complete` | combat-recovery | Entity completed post-combat recovery aftermath (`entityId`) |
| `combat.aftermath.stamina-tick` | combat-recovery | Hidden recovery tick adjusted survivor stamina (`entityId`, `prevStamina`) |
| `combat.aftermath.started` | combat-recovery | Hidden post-combat aftermath began in a zone (`zoneId`, `survivorIds`, `casualtyIds`) |
| `combat.aftermath.summary` | combat-recovery | Hidden post-combat aftermath recorded zone casualty/survivor summary (`zoneId`, `casualties`, `survivors`) |
| `combat.ai.decision` | combat-intent | Combat AI recorded a scored intent decision trace |
| `combat.ambush.triggered` | engagement-core | Engagement module triggered an ambush encounter event |
| `combat.brace.stabilized` | combat-tactics | Brace cleared the actor's `OFF_BALANCE` status |
| `combat.brace.start` | combat-tactics | Actor entered brace stance (`atChokepoint`) |
| `combat.companion.intercepted` | combat-core | Active companion intercepted an attack targeting the player (`damage`, `interceptChance`) |
| `combat.contact.hit` | combat-core | Attack hit roll succeeded against target or interceptor (`roll`, `hitChance`, `hitStyle`) |
| `combat.contact.miss` | combat-core | Attack hit roll failed (`roll`, `hitChance`) |
| `combat.counter.off_balance` | combat-core | Guarded defender countered and inflicted `OFF_BALANCE` on attacker (`causedBy`) |
| `combat.damage.applied` | combat-core, hazard-interpreter, status-effects | Damage reduced target HP via combat, hazard, or status effect (`damage`, `previousHp`, `currentHp`) |
| `combat.disengage.fail` | combat-core | Disengage failed, applying `EXPOSED` to actor (`roll`, `needed`) |
| `combat.disengage.success` | combat-core | Disengage succeeded, applying `FLEEING` and moving actor (`fromZoneId`, `toZoneId`) |
| `combat.encounter.cleared` | engagement-core | Engagement tracker detected all hostile combatants defeated in encounter |
| `combat.entity.defeated` | ability-effects, combat-core, hazard-interpreter, status-effects | Target HP reached zero from combat attack, ability, hazard, or status damage (`defeatedBy`, `defeatZoneId`) |
| `combat.frontline.collapsed` | engagement-core | Engagement frontline collapsed during combat |
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
| `combat.resource.trigger.unknown` | combat-resources | Combat resource rule referenced an unknown trigger (`kind`, `packId`, `trigger`, `resourceId`) |
| `combat.review.trace` | combat-review | Combat formula review module emitted a trace event |
| `combat.will.hold` | cognition-core | High-will entity mitigated severe morale loss (`rawLoss`, `mitigatedLoss`, `will`) |
| `resource.changed` | ability-core, combat-core, combat-tactics, hazard-interpreter, starter-bounty-hunter (content), starter-colony (content), starter-detective (content), starter-fantasy (content), starter-gladiator (content), starter-merchant (content), starter-pirate (content), starter-ronin (content), starter-vampire (content), starter-weird-west (content), starter-zombie (content), status-effects | Entity resource pool changed across combat, abilities, hazards, status effects, or starter actions (`resource`, `previous`, `current`, `delta`) |

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
| `ability.review.trace` | ability-review | Ability review module emitted an evaluation trace event |
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
| `status.periodic.damage` | status-effects | Periodic status effect applied tick damage (`amount`, `sourceId`, ...) |
| `status.periodic.expired` | status-effects | Periodic status definition expired at the end of its duration (`appliedAtTick`, `duration`) |
| `status.periodic.heal` | status-effects | Periodic status effect applied tick healing (`amount`, `actual`, ...) |
| `status.removed` | status-core | Status effect explicitly removed from an entity (`statusId`) |
| `status.stacked` | status-core | Existing stackable status incremented or refreshed at max stacks (`statusId`, `stacks`) |
| `status.trigger.fired` | status-effects | Reactive status trigger fired in response to a matching event (`statusId`, `sourceId`, ...) |
| `status.trigger.halted` | status-effects | Reactive status trigger chain halted upon reaching `PROC_DEPTH_LIMIT` (`reason`) |
| `status.trigger.heal` | status-effects | Reactive status trigger applied healing to a target (`targetId`, `amount`, `actual`) |

## Dialogue, Progression, Rumor & Leverage Events

| Event | Source | Description |
|-------|--------|-------------|
| `dialogue.choice.selected` | dialogue-core | Actor selected a dialogue choice (`dialogueId`, `choiceId`, `choiceText`) |
| `dialogue.effect.unknown` | dialogue-core | Dialogue effect lacked a player entity or handler (`effectType`, `reason`) |
| `dialogue.ended` | dialogue-core | Conversation terminated at a missing target node or choiceless leaf node (`dialogueId`) |
| `dialogue.node.entered` | dialogue-core | Entered a dialogue node with filtered choices and optional narrator hints (`nodeId`, `speaker`) |
| `dialogue.started` | dialogue-core | Actor initiated dialogue with an NPC (`dialogueId`, `speakerId`, `speakerName`) |
| `leverage.adjusted` | dialogue-core | Dialogue `leverage-adjust` effect modified a leverage currency (`currency`, `delta`, `value`) |
| `leverage.resolved` | player-leverage | Social, rumor, diplomacy, or sabotage leverage action resolved (`verb`, `subAction`, `effects`) |
| `progression.node.unlocked` | progression-core | Progression tree node unlocked for entity (`nodeId`, `treeId`, `currencySpent`) |
| `progression.unlock.rejected` | progression-core | Progression tree unlock rejected due to missing prerequisites or insufficient currency |
| `reputation.adjusted` | dialogue-core | Dialogue `reputation-adjust` effect updated accrued faction reputation (`factionId`, `delta`, `value`) |
| `rumor.belief.propagated` | rumor-propagation | Scheduled pending effect delivered a propagated rumor belief to target factions |
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

## Companion, Quest & Agency Events

| Event | Source | Description |
|-------|--------|-------------|
| `companion.departed` | item-recognition, player-leverage, world-tick | Companion left the party after a morale-triggering reaction (`npcId`, `role`, `reason`) |
| `companion.reaction` | item-recognition, player-leverage, world-tick | Companion reacted to an event trigger with a morale shift (`npcId`, `trigger`, `moraleDelta`, `morale`) |
| `companion.recruited` | companion-core | NPC joined the player's party (`npcId`, `role`, `faction`, `partySize`) |
| `faction.action.resolved` | world-tick | Faction agency step resolved an autonomous off-screen faction action (`factionId`, `verb`, `description`) |
| `npc.action.resolved` | world-tick | NPC agency step resolved an autonomous off-screen NPC action (`npcId`, `npcName`, `verb`) |
| `npc.betrayal.witnessed` | world-tick | NPC agency betrayal action was witnessed (`npcId`, `npcName`, `targetEntityId`) |
| `quest.completed` | quest-core | Quest reached completion and emitted rewards (`questId`, `questName`, `rewardSummary`) |
| `quest.failed` | quest-core | Quest failed with a recorded reason (`questId`, `questName`, `reason`) |
| `quest.offered` | quest-core | Quest was offered and auto-accepted by the player (`questId`, `questName`, `autoAccepted`) |
| `quest.stage.advanced` | quest-core | Quest advanced from one stage to another (`questId`, `questName`, `via`, `fromStageId`) |

## Opportunity, Pressure & Defeat Fallout Events

| Event | Source | Description |
|-------|--------|-------------|
| `defeat.fallout.chronicle` | defeat-fallout | Defeat fallout recorded a chronicle death/defeat entry (`category`, `actorId`) |
| `defeat.fallout.companion` | defeat-fallout | Defeat fallout triggered companion `combat-lost` morale reaction |
| `defeat.fallout.milestone` | defeat-fallout | Boss defeat fallout recorded a campaign milestone (`label`, `tags`) |
| `defeat.fallout.player-fallen` | defeat-fallout | Defeat fallout processed player defeat (`defeatedBy`, `zoneId`) |
| `defeat.fallout.pressure` | defeat-fallout | Defeat fallout raised faction alert pressure (`factionId`, `alertLevel`) |
| `defeat.fallout.rumor` | defeat-fallout | Defeat fallout seeded a defeat rumor (`claim`, `valence`, `originDistrictId`) |
| `defeat.fallout.triggered` | defeat-fallout | Defeat fallout resolution began for defeated combatant (`actorId`, `targetId`, `targetName`) |
| `defeat.region.violence-escalated` | defeat-fallout | Defeat fallout escalated regional violence metric (`districtId`, `level`) |
| `opportunity.abandoned` | opportunity-resolution | Player abandoned an accepted opportunity (`opportunityId`, `kind`, `summary`, `effects`; from `opportunity.${resolutionType}`) |
| `opportunity.accepted` | opportunity-resolution | Player accepted an available opportunity (`opportunityId`, `kind`, `title`) |
| `opportunity.betrayed` | opportunity-resolution | Player betrayed an accepted counterparty opportunity (`opportunityId`, `kind`, `summary`, `effects`; from `opportunity.${resolutionType}`) |
| `opportunity.completed` | opportunity-resolution | Player completed an accepted opportunity (`opportunityId`, `kind`, `summary`, `effects`; from `opportunity.${resolutionType}`) |
| `opportunity.expired` | world-tick | Opportunity expired on world tick without resolution (`opportunityId`, `kind`, `title`) |
| `opportunity.spawned` | world-tick | World tick spawned a new opportunity (`opportunityId`, `kind`, ...) |
| `pressure.escalated` | world-tick | World tick escalated an active pressure to a higher heat band (`pressureId`, `band`, `heat`) |
| `pressure.expired` | world-tick | World tick expired an active pressure and applied fallout (`pressureId`, `summary`) |
| `pressure.resolved` | opportunity-resolution, world-tick | Player or completed opportunity resolved an active world pressure (`pressureId`, `kind`, `resolutionType`) |
| `pressure.revealed` | world-tick | World tick revealed a previously hidden active pressure to the player (`pressureId`, ...) |
| `pressure.spawned` | player-leverage, world-tick | Leverage action or pressure fallout chain spawned a new world pressure (`pressureId`, `kind`, `urgency`) |

## Presentation & Starter Domain Events

| Event | Source | Description |
|-------|--------|-------------|
| `audio.cue.requested` | starter-bounty-hunter (setup), starter-colony (setup), starter-cyberpunk (setup), starter-detective (setup), starter-fantasy (setup), starter-gladiator (setup), starter-merchant (setup), starter-pirate (setup), starter-ronin (setup), starter-vampire (setup), starter-weird-west (setup), starter-zombie (setup) | Starter setup requested an audio cue for presentation (`cueId`, `channel`, `priority`) |
| `merchant.audit.requested` | starter-merchant (contract-core) | Actor audited open contracts, exposure, and overdue obligations (`openCount`, `overdueCount`, `balanced`) |
| `merchant.books.opened` | starter-merchant (setup) | Merchant starter setup opened initial house ledger books (`houseId`, `factorId`) |
| `merchant.contract.consigned` | starter-merchant (contract-core) | Actor consigned goods to a broker against a future payment obligation (`obligationId`, `itemId`, `value`, `dueTick`) |
| `merchant.contract.defaulted` | starter-merchant (contract-core) | Overdue merchant obligation defaulted at deadline |
| `merchant.contract.honoured` | starter-merchant (contract-core) | Merchant obligation was settled and honoured on time |
| `merchant.factor.encumbered` | starter-merchant (contract-core) | Merchant factor became encumbered above seizure threshold (`lien`, `threshold`) |
| `merchant.factor.unencumbered` | starter-merchant (contract-core) | Merchant factor lien cleared back below encumbrance threshold (`lien`) |
| `merchant.instrument.seized` | starter-merchant (contract-core) | Creditor seized instrument to satisfy defaulted merchant lien (`obligationId`, `itemId`, `value`, `lien`) |
| `merchant.item.appraised` | starter-merchant (contract-core) | Actor appraised an item's trade value band (`itemId`, `accuracy`, `estimateLow`, `estimateHigh`) |
| `merchant.lien.accrued` | starter-merchant (contract-core) | Overdue merchant obligation accrued interest/lien (`obligationId`, `itemId`, `overdueTicks`, `accrued`, `lien`) |
| `merchant.price.haggled` | starter-merchant (contract-core) | Actor spent liquidity to bank a price margin against a counterparty (`counterparty`, `marginPercent`, `won`) |
| `merchant.risk.claimed` | starter-merchant (contract-core) | Underwritten counterparty policy triggered a payout claim (`policyId`, `counterparty`, `exposure`, `lien`) |
| `merchant.risk.lapsed` | starter-merchant (contract-core) | Underwritten counterparty policy lapsed cleanly with premium retained (`policyId`, `counterparty`, `premiumKept`) |
| `merchant.risk.underwritten` | starter-merchant (contract-core) | Actor underwrote a counterparty policy for an immediate liquidity premium (`policyId`, `premium`, `exposure`) |
| `merchant.seal.revoked` | starter-merchant (contract-core) | Excess merchant lien revoked trading seal (`lien`, `threshold`, `sealTaken`) |
| `netrunning.ice.breached` | starter-cyberpunk (content) | Cyberpunk netrunning action breached ICE defenses |
| `pursuit.bounty.posted` | starter-bounty-hunter (pursuit-core) | Actor posted a bounty warrant on a mark (`markId`, `markName`, `warrantSpent`) |
| `pursuit.goods.fenced` | starter-bounty-hunter (pursuit-core) | Actor fenced stolen/contraband goods (`itemId`, `buyerId`, `buyerName`, `paid`, `infamyGained`) |
| `pursuit.mark.collared` | starter-bounty-hunter (pursuit-core) | Actor collared a pursued mark using a warrant (`markId`, `markName`, `warrantSpent`) |
| `pursuit.mark.convicted` | starter-bounty-hunter (pursuit-core) | Held mark was convicted after detention ticks (`markId`, `markName`, `heldForTicks`) |
| `pursuit.state.changed` | starter-bounty-hunter (pursuit-core) | Pursuit status transitioned between named pursuit states (`from`, `to`) |
| `pursuit.sworn.in` | starter-bounty-hunter (setup) | Bounty-hunter starter setup swore in thief-taker office (`officeId`, `takerId`) |
| `pursuit.word.bought` | starter-bounty-hunter (pursuit-core) | Actor purchased informant whereabouts on a mark (`markId`, `markName`, `whereabouts`, `price`, `infamyGained`) |

## Consumed Hook Events (Not Emitted by the Engine)

Built-in listeners in `packages/character-profile/src/profile-core.ts` subscribe to three optional lifecycle/game-hook event types that the engine and starters do not emit on their own (`ENGINE_EVENT_TYPES` intentionally excludes them because no built-in emitter produces them):

- `combat.defeat.survived` — game-emitted survival hook handled alongside `combat.aftermath.injury` (`onSurvived`) to update profile injury records and compute injury penalties.
- `rest.completed` — game-emitted rest hook handled alongside `ability.heal.applied` (`onHeal`) to heal active injuries and clear `injured-<id>` statuses.
- `combat.injury.healed` — game-emitted healing hook handled by `onHeal` to heal a targeted `injuryId` or active injuries.

