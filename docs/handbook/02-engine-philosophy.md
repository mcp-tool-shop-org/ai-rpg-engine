# Chapter 2 — Engine Philosophy

AI RPG Engine is guided by a small set of design principles. These principles shape how the engine is structured and how games are authored.

Understanding them will help you understand the rest of the system.

---

## Worlds Are Simulations, Not Scripts

Traditional narrative engines often rely on scripted sequences. AI RPG Engine takes a different approach.

You define the pieces of the world:

- entities
- environments
- rules
- relationships

The engine simulates how those pieces interact.

Stories emerge from those interactions rather than from predetermined sequences.

A character might investigate a noise, misinterpret what they see, and start a conflict that was never scripted explicitly.

That behavior arises from the systems themselves.

---

## Truth and Presentation Are Separate

Inside the engine there is always an objective simulation state.

However, what the player sees may not always reflect that truth directly.

Different presentation layers can interpret events differently:

- the narrator may describe something incorrectly
- a companion might disagree with the narrator
- a character might perceive the world inaccurately
- corrupted signals might distort information

The engine tracks both the objective truth and the presented version of events.

This allows games built with AI RPG Engine to experiment with perception, misinformation, and discovery without breaking the underlying simulation.

---

## Events Drive Everything

AI RPG Engine is an event-driven system.

Every meaningful change in the world produces an event.

Examples include:

- a character entering a zone
- damage being applied
- a status effect starting or ending
- a dialogue choice being selected
- an item being used

Modules and systems listen for these events and respond accordingly.

Because events are structured and deterministic, they can also be recorded and replayed. This makes debugging and testing far easier.

---

## Modules Extend the Engine

AI RPG Engine's core runtime stays intentionally small.

Most gameplay systems are implemented as modules that plug into the engine.

Examples include:

- combat mechanics
- dialogue handling
- inventory management
- environmental simulation
- AI cognition
- progression systems

Modules register themselves with the engine, subscribe to events, and add new behaviors.

This keeps the engine flexible and prevents the core runtime from becoming tangled with genre-specific logic.

---

## Genres Belong to Rulesets

The engine itself does not know what a sword is or what cybernetic implants are.

Instead, genres are defined through rulesets.

A ruleset describes:

- what stats exist
- what resources exist
- which verbs players can use
- how formulas are calculated

For example:

**A fantasy ruleset might define:**

| Category  | Values          |
|-----------|-----------------|
| stats     | vigor, instinct, will |
| resources | hp, stamina     |

**A cyberpunk ruleset might define:**

| Category  | Values                  |
|-----------|-------------------------|
| stats     | chrome, reflex, netrunning |
| resources | hp, heat                |

The engine runs both worlds using the same simulation loop.

---

## Content Is Data

Games built with AI RPG Engine rely heavily on structured content files.

These files define things such as:

- rooms and zones
- entity blueprints
- dialogue trees
- items and abilities
- quests
- progression trees

Content files are validated automatically to catch errors early.

This makes it easier to build large worlds without embedding gameplay logic directly into engine code.
