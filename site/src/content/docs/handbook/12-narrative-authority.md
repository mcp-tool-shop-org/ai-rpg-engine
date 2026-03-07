---
title: "Chapter 12 — Narrative Authority"
description: "Narrative Authority"
sidebar:
  order: 12
---


> Part III — Simulation Systems

The truth vs presentation system.

## Topics

- **Concealment** — hiding information from the player
- **Distortion** — presenting false or altered information
- **Contradiction tracking** — recording conflicts between truth and presentation
- **Truth reveal mechanics** — uncovering what was hidden

## How It Works

Narrative authority sits between the simulation and the player. It can intercept events before they reach the presentation layer and modify, suppress, or replace them.

The simulation always tracks objective truth. Narrative authority controls what version of that truth the player receives.

## Example Scenario

1. The narrator describes an NPC as friendly and helpful
2. The simulation tracks that the NPC has hostile intent (cognition layer)
3. Narrative authority conceals the hostility from the player's view
4. A perception event later reveals a contradiction
5. The player discovers the NPC was never actually friendly

The simulation was always correct. The presentation was deliberately misleading.

## Authority Levels

Zones can have an `authority` property that controls how much the narrator can distort events in that area. High authority means the narrator has more control. Low authority means events are presented more truthfully.

This creates natural tension: entering a low-authority zone might strip away comforting lies the narrator was telling you.

## Contradiction Records

When the engine detects a conflict between what was presented and what was true, it records a contradiction. These records can be queried by other systems — for example, a companion module might use them to offer alternative interpretations.
