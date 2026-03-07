import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'AI RPG Engine',
  description: 'A simulation-first terminal RPG engine for worlds shaped by perception, cognition, and consequence',
  logoBadge: 'AR',
  brandName: 'AI RPG Engine',
  repoUrl: 'https://github.com/mcp-tool-shop-org/ai-rpg-engine',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'v1.0.0',
    headline: 'AI RPG Engine',
    headlineAccent: 'Simulation truth, first.',
    description: 'A modular runtime for terminal RPGs where actions create information, information distorts, and consequences emerge from what characters believe happened.',
    primaryCta: { href: '#usage', label: 'Get started' },
    secondaryCta: { href: '#modules', label: 'Explore modules' },
    previews: [
      { label: 'Install', code: 'npm install @ai-rpg-engine/core @ai-rpg-engine/modules' },
      { label: 'Import', code: "import { Engine } from '@ai-rpg-engine/core'" },
      { label: 'Run', code: "engine.submitAction('attack', { targetIds: ['guard-01'] })" },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Core Capabilities',
      subtitle: 'What makes AI RPG Engine different.',
      features: [
        {
          title: 'Simulation Truth',
          desc: 'The engine maintains objective world state. Presentation layers may lie, narrators may distort, but truth is sacred and queryable.',
        },
        {
          title: 'Perception & Cognition',
          desc: 'Every character perceives the world differently. AI actors reason from beliefs, not omniscience. Ambushes, deception, and misinformation emerge naturally.',
        },
        {
          title: 'Deterministic Replay',
          desc: 'Seeded RNG and structured action pipeline guarantee identical results from identical inputs. Debug, replay, and inspect any game session.',
        },
        {
          title: '17 Built-In Modules',
          desc: 'Combat, dialogue, inventory, traversal, status effects, environment, cognition, perception, factions, rumors, districts, and more — all composable.',
        },
        {
          title: 'Genre-Agnostic',
          desc: 'Same core runs dark fantasy, cyberpunk, or cosmic horror. Genre belongs to rulesets and content packs, not the engine.',
        },
        {
          title: 'Content Is Data',
          desc: 'Rooms, entities, dialogue, items, and quests are defined as data, not code. Ship whole games without touching engine internals.',
        },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Quick Start',
      cards: [
        {
          title: 'Install',
          code: 'npm install @ai-rpg-engine/core @ai-rpg-engine/modules @ai-rpg-engine/content-schema',
        },
        {
          title: 'Create an engine',
          code: `import { Engine } from '@ai-rpg-engine/core';
import { combatCore, dialogueCore, cognitionCore, perceptionFilter } from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game',
    version: '1.0.0', engineVersion: '1.0.0',
    ruleset: 'fantasy', modules: ['combat-core'],
    contentPacks: [],
  },
  seed: 42,
  modules: [combatCore(), dialogueCore(), cognitionCore(), perceptionFilter()],
});`,
        },
        {
          title: 'Submit actions',
          code: `const events = engine.submitAction('attack', {
  targetIds: ['guard-01'],
});

for (const event of events) {
  console.log(event.type, event.payload);
}`,
        },
        {
          title: 'Inspect state',
          code: `const state = engine.getState();
const guard = state.entities.get('guard-01');
console.log(guard?.resources); // HP, stamina, etc.`,
        },
      ],
    },
    {
      kind: 'data-table',
      id: 'modules',
      title: 'Built-In Modules',
      subtitle: '17 composable simulation modules.',
      columns: ['Module', 'Description'],
      rows: [
        ['combat-core', 'Attack/defend, damage, defeat, stamina'],
        ['dialogue-core', 'Graph-based dialogue trees with conditions'],
        ['inventory-core', 'Items, equipment, use/equip/unequip'],
        ['traversal-core', 'Zone movement and exit validation'],
        ['status-core', 'Status effects with duration and stacking'],
        ['environment-core', 'Dynamic zone properties, hazards, decay'],
        ['cognition-core', 'AI beliefs, intent, morale, memory'],
        ['perception-filter', 'Sensory channels, clarity, cross-zone hearing'],
        ['narrative-authority', 'Truth vs presentation, concealment, distortion'],
        ['progression-core', 'Currency-based advancement, skill trees'],
        ['faction-cognition', 'Faction beliefs, trust, inter-faction knowledge'],
        ['rumor-propagation', 'Information spread with confidence decay'],
        ['knowledge-decay', 'Time-based confidence erosion'],
        ['district-core', 'Spatial memory, zone metrics, alert thresholds'],
        ['belief-provenance', 'Trace reconstruction across perception/cognition/rumor'],
        ['observer-presentation', 'Per-observer event filtering, divergence tracking'],
        ['simulation-inspector', 'Runtime inspection, health checks, diagnostics'],
      ],
    },
  ],
};
