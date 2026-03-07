# Chapter 7 — Rulesets

> Part II — Engine Architecture

How genres are defined.

## Topics

- **RulesetDefinition** — the contract between content and engine
- **Stats** — character attributes
- **Resources** — consumable pools (hp, stamina, heat)
- **Verbs** — available player actions
- **Formulas** — calculations for damage, checks, costs

## Example Rulesets

**Fantasy**

```
stats:     vigor, instinct, will
resources: hp, stamina
verbs:     move, inspect, speak, attack, use, rest
```

**Cyberpunk**

```
stats:     chrome, reflex, netrunning
resources: hp, heat
verbs:     move, scan, speak, attack, jack-in, use
```

## Why the Engine Doesn't Know About Fantasy

The engine has no concept of swords, spells, or cybernetic implants. A ruleset tells the engine what stats matter, what resources exist, and what formulas govern interactions. This is what makes the same engine run both The Chapel Threshold and Neon Lockbox without code changes.
