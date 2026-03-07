# Chapter 3 — Quick Start

This section shows how to run Signalfire and explore the included example worlds.

The examples are intentionally small, but they demonstrate how the engine works.

---

## Installing Dependencies

Clone the repository and install dependencies:

```bash
npm install
```

Then build the project:

```bash
npx tsc --build
```

---

## Running a Game

To run a Signalfire game, use the CLI:

```bash
node packages/cli/dist/bin.js run
```

This starts the terminal interface and loads the default starter world.

You will see a scene panel describing the current location, an event log, and a command prompt.

---

## Navigating the World

Players interact with the world through commands.

Commands can be typed directly:

```
move crypt
inspect altar
speak pilgrim
attack ghoul
```

The interface also presents numbered options for available actions.

You can select them by typing the number associated with the action.

Both approaches are supported simultaneously.

---

## Dialogue

Talking to characters uses dialogue trees.

When a conversation begins, the engine shows dialogue options that depend on the current world state.

Your choices can:

- reveal information
- change character attitudes
- modify world state
- trigger other systems

---

## Combat

Combat uses the same action system as exploration.

An attack command produces a chain of simulation events:

- contact check
- damage calculation
- resource changes
- status effects
- defeat conditions

These events are recorded in the event log and presented to the player.

---

## Saving Your Game

The engine can serialize the entire world state.

Save files are generated automatically during play and can be inspected using the CLI.

```bash
signalfire inspect-save
```

This command prints the saved state in a readable format.

---

## Replay

Signalfire supports deterministic replay.

Every player action is recorded, and the engine can replay those actions using the same random seed to reproduce the exact same sequence of events.

Run a replay using:

```bash
signalfire replay
```

Replay is extremely useful for debugging and automated testing.

---

## Next Steps

The remaining chapters of this handbook explain how the engine works internally and how to build your own worlds.

You will learn how to:

- define rooms and entities
- write dialogue trees
- build progression systems
- create new modules
- design new rulesets

Once you understand these pieces, you can build entirely new RPG worlds using the Signalfire engine.
