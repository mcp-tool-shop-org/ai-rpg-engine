<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# My Game

An [ai-rpg-engine](https://mcp-tool-shop-org.github.io/ai-rpg-engine/) content
pack, scaffolded from the starter template. The project is **standalone**: it
carries its own `tsconfig.json` and declares every dependency it needs
(including `typescript` and `vitest` as devDependencies), so it builds and
tests anywhere — no engine monorepo required.

## Getting started

If you are reading this inside `templates/starter`, scaffold your own copy
first (it names everything for you):

```bash
npx --package=@ai-rpg-engine/cli ai-rpg-engine create-starter my-game --out=./my-game
```

Then, from the project directory:

```bash
npm install        # pulls @ai-rpg-engine/* plus typescript + vitest
npx tsc --noEmit   # typecheck
npx vitest run     # run the pack's tests
```

## Make it yours

| File | What to edit |
|------|--------------|
| `package.json` | name and description |
| `src/ruleset.ts` | your stats, resources, verbs |
| `src/content.ts` | entities and zones — keep each enemy's `ai.profileId` paired with a profile in setup |
| `src/setup.ts` | wire your modules alongside `buildCombatStack`; the intent profiles list lives here |
| `src/starter.test.ts` | grows with your content — register dialogues/abilities in the integrity lists |

Two wiring rules worth knowing from day one:

- **Enemies act only if their `ai.profileId` resolves.** Every profile id
  declared in `src/content.ts` must appear in the `cognition.profiles` list in
  `src/setup.ts` (built-ins: `aggressive`, `cautious`). An empty profiles list
  means enemies never select an intent.
- **`buildCombatStack` owns the combat stack** (cognition, tactics, resources,
  intent, recovery, narration). Your custom modules go in the marked
  starter-owned section of `src/setup.ts`.

See [Chapter 58 — Create Your Own Starter](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/58-create-your-own-starter/)
in the handbook for the full walkthrough.
