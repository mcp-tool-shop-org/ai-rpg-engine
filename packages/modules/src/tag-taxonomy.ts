/**
 * Tag Taxonomy — canonical tag categories and validation utilities.
 *
 * Solves finding F2: no tag prefix enforcement. Provides:
 * - Canonical tag category definitions with prefix conventions
 * - Tag validation functions (warn on collision or unknown patterns)
 * - Lint-friendly audit for content authors
 *
 * Tags are strings. Convention-based, not type-enforced, because authors
 * need the freedom to add custom tags without modifying engine code.
 */

// ---------------------------------------------------------------------------
// Canonical Categories
// ---------------------------------------------------------------------------

export type TagCategory =
  | 'role'        // role:brute, role:boss — combat-intent, combat-roles
  | 'companion'   // companion:fighter — interception bonuses
  | 'engagement'  // bodyguard, ranged, caster — engagement-core
  | 'pack-bias'   // assassin, samurai, feral — combat-intent AI
  | 'zone'        // chokepoint, ambush_entry — engagement-core
  | 'status'      // buff, debuff, fear, poison — status-semantics
  | 'custom';     // human, commander, civilian — ability requirements etc.

export type TagCategoryDefinition = {
  category: TagCategory;
  prefix: string | null;   // null = unprefixed (convention only)
  description: string;
  examples: string[];
  usedBy: string[];
};

export const TAG_CATEGORIES: readonly TagCategoryDefinition[] = [
  {
    category: 'role',
    prefix: 'role:',
    description: 'Combat role assignment for AI behavior and encounter analysis',
    examples: ['role:brute', 'role:boss', 'role:elite', 'role:bodyguard', 'role:backliner', 'role:skirmisher', 'role:sentinel', 'role:coward'],
    usedBy: ['combat-intent', 'combat-roles', 'engagement-core'],
  },
  {
    category: 'companion',
    prefix: 'companion:',
    description: 'Companion type for interception and party bonuses',
    examples: ['companion:fighter', 'companion:healer', 'companion:scholar'],
    usedBy: ['engagement-core', 'companion-core'],
  },
  {
    category: 'engagement',
    prefix: null,
    description: 'Engagement positioning tags (bodyguard, ranged, caster)',
    examples: ['bodyguard', 'ranged', 'caster'],
    usedBy: ['engagement-core'],
  },
  {
    category: 'pack-bias',
    prefix: null,
    description: 'Pack bias personality for AI combat behavior',
    examples: ['assassin', 'samurai', 'feral', 'beast', 'pirate', 'colonial', 'vampire', 'hunter', 'zombie', 'undead', 'criminal', 'drone', 'alien', 'spirit'],
    usedBy: ['combat-intent'],
  },
  {
    category: 'zone',
    prefix: null,
    description: 'Zone-level tags for engagement and encounter mechanics',
    examples: ['chokepoint', 'ambush_entry', 'combat', 'safe'],
    usedBy: ['engagement-core', 'combat-tactics'],
  },
  {
    category: 'status',
    prefix: null,
    description: 'Status semantic tags for abilities and resistance',
    examples: ['buff', 'debuff', 'fear', 'poison', 'stun', 'bleed'],
    usedBy: ['status-semantics', 'ability-intent'],
  },
  {
    category: 'custom',
    prefix: null,
    description: 'Author-defined tags for ability requirements and content logic',
    examples: ['human', 'commander', 'civilian', 'noble'],
    usedBy: ['ability-core', 'content-specific'],
  },
] as const;

// ---------------------------------------------------------------------------
// Known tags (union of all canonical examples)
// ---------------------------------------------------------------------------

const KNOWN_TAGS = new Set<string>();
const KNOWN_PREFIXES = new Set<string>();

for (const cat of TAG_CATEGORIES) {
  for (const ex of cat.examples) {
    KNOWN_TAGS.add(ex);
  }
  if (cat.prefix) {
    KNOWN_PREFIXES.add(cat.prefix);
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type TagWarning = {
  tag: string;
  severity: 'info' | 'warn';
  message: string;
};

/**
 * Classify a tag into its canonical category.
 * Returns 'custom' for tags that don't match any known pattern.
 */
export function classifyTag(tag: string): TagCategory {
  for (const cat of TAG_CATEGORIES) {
    if (cat.prefix && tag.startsWith(cat.prefix)) return cat.category;
  }
  // Check engagement tags (unprefixed but known)
  if (['bodyguard', 'ranged', 'caster'].includes(tag)) return 'engagement';
  // Check known pack-bias tags
  const packBiasTags = TAG_CATEGORIES.find(c => c.category === 'pack-bias')!.examples;
  if (packBiasTags.includes(tag)) return 'pack-bias';
  // Check known zone tags
  const zoneTags = TAG_CATEGORIES.find(c => c.category === 'zone')!.examples;
  if (zoneTags.includes(tag)) return 'zone';
  // Check known status tags
  const statusTags = TAG_CATEGORIES.find(c => c.category === 'status')!.examples;
  if (statusTags.includes(tag)) return 'status';

  return 'custom';
}

/**
 * Validate a set of tags on an entity and return warnings.
 *
 * Checks for:
 * - Multiple role tags (picks first — documented behavior)
 * - Unknown prefixed tags (typos like `role:brut` instead of `role:brute`)
 * - Engagement + role collision (e.g., `bodyguard` + `role:backliner`)
 */
export function validateEntityTags(tags: string[]): TagWarning[] {
  const warnings: TagWarning[] = [];

  // Check for multiple role tags
  const roleTags = tags.filter(t => t.startsWith('role:'));
  if (roleTags.length > 1) {
    warnings.push({
      tag: roleTags.join(', '),
      severity: 'warn',
      message: `Multiple role tags found (${roleTags.join(', ')}). Only the first is used by combat-intent.`,
    });
  }

  // Check for unknown prefixed tags
  for (const tag of tags) {
    for (const prefix of KNOWN_PREFIXES) {
      if (tag.startsWith(prefix)) {
        const known = TAG_CATEGORIES.find(c => c.prefix === prefix)!.examples;
        if (!known.includes(tag)) {
          warnings.push({
            tag,
            severity: 'info',
            message: `Unknown ${prefix}* tag "${tag}". Known: ${known.join(', ')}.`,
          });
        }
      }
    }
  }

  // Check for engagement + role collision
  const hasBodyguardTag = tags.includes('bodyguard');
  const hasBacklinerRole = tags.includes('role:backliner');
  if (hasBodyguardTag && hasBacklinerRole) {
    warnings.push({
      tag: 'bodyguard + role:backliner',
      severity: 'warn',
      message: 'Entity has "bodyguard" engagement tag but "role:backliner" role. These contradict — bodyguard is frontline, backliner is rear.',
    });
  }

  return warnings;
}

/**
 * Validate a set of zone tags and return warnings.
 */
export function validateZoneTags(tags: string[]): TagWarning[] {
  const warnings: TagWarning[] = [];

  // Zones shouldn't have entity-level tags
  for (const tag of tags) {
    if (tag.startsWith('role:') || tag.startsWith('companion:')) {
      warnings.push({
        tag,
        severity: 'warn',
        message: `Zone has entity-level tag "${tag}". Role and companion tags belong on entities, not zones.`,
      });
    }
  }

  return warnings;
}
