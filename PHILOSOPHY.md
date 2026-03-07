# Philosophy

AI RPG Engine is built on three ideas about how RPG worlds should work.

---

## 1. Deterministic Worlds

Simulation results must be reproducible.

The engine uses seeded RNG and a structured action pipeline so that identical inputs always produce identical outputs. Every combat outcome, every rumor path, every faction reaction can be traced back to a specific seed and sequence of actions.

This is not a constraint — it is the foundation. Without determinism, you cannot debug, cannot replay, cannot compare, and cannot experiment.

When something unexpected happens in a simulation, you can:

- replay the exact sequence
- inspect every event
- trace the causal chain
- identify the specific rule or threshold that triggered the result

Once a world is deterministic, it becomes testable.

---

## 2. Evidence-Driven Design

World mechanics should be tested through simulation, not guesswork.

Most game design relies on play-testing: run the game, play it, notice something feels wrong, make a change, play it again. This is slow, subjective, and hard to scale.

AI RPG Engine adds a different loop:

```
build → simulate → analyze → tune → experiment → compare
```

Instead of asking "does this feel right?", you can ask:

- Does escalation happen too fast?
- Do rumors reach the second faction within one encounter?
- Is district stability inert or volatile?
- What happens if I increase paranoia by 20%?

The engine gives you structured findings, not opinions. You can run 50 simulations, analyze variance, and make decisions from data.

This does not replace creative judgment. It gives creative judgment better information.

---

## 3. AI as Assistant, Not Authority

AI tools help generate and critique designs. They do not replace deterministic systems.

The AI layer (the `@ai-rpg-engine/ollama` package) can scaffold rooms, generate factions, critique balance, and suggest tuning actions. But it operates under a strict boundary:

**The AI never mutates simulation truth directly.**

All AI output goes to stdout by default. Nothing is applied to the world state without explicit human confirmation. The engine remains the lawful keeper of reality — the AI is a design tool, not a game master.

This separation matters because:

- Simulation results must stay reproducible (AI outputs are non-deterministic)
- Authors must maintain ownership of their designs
- Generated content must pass the same validation as hand-authored content
- Trust requires transparency — every AI suggestion can be inspected and rejected

The AI is powerful. The simulation is authoritative. The human decides.

---

## Truth vs Presentation

One more idea runs through the entire engine, though it is more architectural than philosophical:

**The world maintains objective truth. Presentation layers may lie.**

An NPC's beliefs about the world may be wrong. A rumor may be distorted. A narrator may conceal information. But underneath, the engine knows exactly what happened.

This separation makes unreliable narration, deception, asymmetric information, and "fog of war" into natural system behaviors rather than scripted special cases.

Characters reason from their beliefs, not from omniscience. The gap between belief and truth is where interesting stories emerge.

---

## What This Means in Practice

If you are building a world with AI RPG Engine, the workflow is:

1. **Author content** — write rooms, entities, factions, or let the AI scaffold them.
2. **Validate** — run content through schemas and validators.
3. **Simulate** — run the world forward and see what happens.
4. **Analyze** — look at the structured findings from replay data.
5. **Tune** — apply fixes based on evidence.
6. **Experiment** — run many simulations to understand typical behavior.
7. **Compare** — see whether your changes improved the world.

The engine does not tell you what kind of world to build. It gives you the tools to build one that behaves.
