import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'AI RPG Engine',
  description: 'Simulation-native toolkit for building, analyzing, and balancing RPG worlds',
  logoBadge: 'AR',
  brandName: 'AI RPG Engine',
  repoUrl: 'https://github.com/mcp-tool-shop-org/ai-rpg-engine',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'v2.0.0',
    headline: 'AI RPG Engine',
    headlineAccent: 'Build worlds. Simulate them. Improve them.',
    description: 'The first RPG engine designed for experimentation. Deterministic simulation runtime + AI-assisted design studio.',
    primaryCta: { href: '#usage', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Install', code: 'npm install -g @ai-rpg-engine/cli' },
      { label: 'Studio', code: 'ai chat' },
      { label: 'Onboard', code: '/onboard' },
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
          title: 'Deterministic Simulation',
          desc: 'Tick-based engine with world state, events, perception, cognition, faction beliefs, rumor propagation, and seeded RNG. Every run can be replayed exactly.',
        },
        {
          title: 'AI-Assisted Worldbuilding',
          desc: 'Scaffold rooms, factions, quests, and districts from a theme. Critique designs, repair schema errors, and guide multi-step builds. AI suggests — you decide.',
        },
        {
          title: 'Replay Analysis',
          desc: 'Structured findings explain why events happened, where mechanics break down, and which systems create instability. Analysis feeds directly into tuning.',
        },
        {
          title: 'Experiment-Driven Balancing',
          desc: 'Run batches of simulations across seeds. Detect variance, sweep parameters, compare tuned vs baseline. Turn world design into a testable process.',
        },
        {
          title: 'Studio Workflow',
          desc: 'CLI design studio with dashboards, issue tracking, experiment browsing, session history, guided onboarding, and context-aware command discovery.',
        },
        {
          title: '17 Built-In Modules',
          desc: 'Combat, dialogue, cognition, perception, factions, rumors, districts, progression, environment, and more. All composable, all deterministic.',
        },
        {
          title: 'Genre-Agnostic',
          desc: 'Same core runs dark fantasy, cyberpunk, or any setting. Genre belongs to rulesets and content packs, not the engine.',
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
          code: 'npm install -g @ai-rpg-engine/cli',
        },
        {
          title: 'Start the studio',
          code: `ai chat\n/onboard`,
        },
        {
          title: 'Build a world',
          code: `create-location-pack haunted chapel district\ncritique-content\nsimulate`,
        },
        {
          title: 'Analyze and improve',
          code: `analyze-balance\ntune paranoia\nexperiment run --runs 50`,
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
    {
      kind: 'code-cards',
      id: 'ai-authoring',
      title: 'Design Workflow',
      cards: [
        {
          title: 'Scaffold content',
          code: `create-location-pack --theme "abandoned mine" \\
  --factions miners_guild,deep_crawlers`,
        },
        {
          title: 'Analyze balance',
          code: `simulate\nanalyze-balance\nsuggest-fixes`,
        },
        {
          title: 'Tune mechanics',
          code: `tune rumor propagation\ntune-step\ntune-status`,
        },
        {
          title: 'Run experiments',
          code: `experiment run --runs 50\nexperiment compare baseline tuned\n/findings`,
        },
      ],
    },
  ],
};
