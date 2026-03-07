---
title: "Chapter 16 — Dialogue Trees"
description: "Dialogue Trees"
sidebar:
  order: 16
---


> Part IV — Authoring Games

NPC conversations.

## Topics

- **Dialogue nodes** — individual conversation beats
- **Choices** — player response options
- **Conditions** — requirements for choices to appear
- **Effects** — world state changes triggered by dialogue

## How Dialogue Works

Dialogue trees are structured as a graph of nodes. Each node contains text and a set of player choices. Choices can be conditional (only appearing when world state matches) and can trigger effects when selected.

## Dialogue Can Modify World State

A dialogue choice isn't just text. It can:

- reveal information (update entity beliefs)
- change character attitudes (modify NPC disposition)
- modify world state (set flags, grant items)
- trigger other systems (start combat, unlock zones, award currency)

Because dialogue feeds into the event system, other modules can react to conversation outcomes. A dialogue choice that angers an NPC might update their cognition state, shifting their intent from neutral to hostile.

## State-Dependent Conversations

Dialogue conditions can check any world state: flags, entity stats, inventory contents, progression unlocks, or beliefs. This means the same NPC can offer different conversations depending on what has happened in the simulation.
