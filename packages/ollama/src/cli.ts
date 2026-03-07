// CLI wiring — parses argv for `ai` subcommands and dispatches

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { resolveConfig } from './config.js';
import type { OllamaConfig } from './config.js';
import { createClient } from './client.js';
import { explainValidationError } from './commands/explain-validation-error.js';
import { summarizeBeliefTrace } from './commands/summarize-belief-trace.js';
import { createRoom } from './commands/create-room.js';
import { createFaction } from './commands/create-faction.js';
import { createQuest } from './commands/create-quest.js';
import { explainLint } from './commands/explain-lint.js';
import { createDistrict } from './commands/create-district.js';
import { explainBeliefDivergence } from './commands/explain-belief-divergence.js';
import { createLocationPack } from './commands/create-location-pack.js';
import { createEncounterPack } from './commands/create-encounter-pack.js';
import { explainDistrictState } from './commands/explain-district-state.js';
import { explainFactionAlert } from './commands/explain-faction-alert.js';
import { improveContent } from './commands/improve-content.js';
import { expandPack } from './commands/expand-pack.js';
import { critiqueContent } from './commands/critique-content.js';
import { normalizeContent } from './commands/normalize-content.js';
import { diffSummary } from './commands/diff-summary.js';
import {
  loadSession, saveSession, deleteSession, createSession,
  addThemes, addConstraints, addArtifact, addCritiqueIssues,
  renderSessionContext, formatSessionStatus,
} from './session.js';
import type { DesignSession } from './session.js';

type CliFlags = {
  model?: string;
  url?: string;
  format?: string;
  theme?: string;
  ruleset?: string;
  district?: string;
  difficulty?: string;
  goal?: string;
  contentType?: string;
  focus?: string;
  labelBefore?: string;
  labelAfter?: string;
  factions?: string[];
  districts?: string[];
  zones?: string[];
  constraints?: string[];
  themes?: string[];
  repair?: boolean;
  stdin?: boolean;
  write?: string;
  session?: string;
};

function parseFlags(args: string[]): { command: string; flags: CliFlags } {
  const command = args[0] ?? '';
  const flags: CliFlags = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--model': flags.model = next; i++; break;
      case '--url': flags.url = next; i++; break;
      case '--format': flags.format = next; i++; break;
      case '--theme': flags.theme = next; i++; break;
      case '--ruleset': flags.ruleset = next; i++; break;
      case '--district': flags.district = next; i++; break;
      case '--factions': flags.factions = next?.split(','); i++; break;
      case '--districts': flags.districts = next?.split(','); i++; break;
      case '--zones': flags.zones = next?.split(','); i++; break;
      case '--difficulty': flags.difficulty = next; i++; break;
      case '--goal': flags.goal = next; i++; break;
      case '--content-type': flags.contentType = next; i++; break;
      case '--focus': flags.focus = next; i++; break;
      case '--label-before': flags.labelBefore = next; i++; break;
      case '--label-after': flags.labelAfter = next; i++; break;
      case '--constraints': flags.constraints = next?.split(','); i++; break;
      case '--themes': flags.themes = next?.split(','); i++; break;
      case '--write': flags.write = next; i++; break;
      case '--session': flags.session = next; i++; break;
      case '--repair': flags.repair = true; break;
      case '--stdin': flags.stdin = true; break;
    }
  }

  return { command, flags };
}

function buildConfig(flags: CliFlags): OllamaConfig {
  return resolveConfig({
    model: flags.model,
    baseUrl: flags.url,
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function emit(text: string, writePath: string | undefined): Promise<void> {
  if (writePath) {
    const resolved = resolve(writePath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, text, 'utf-8');
    console.error(`Wrote ${resolved}`);
  } else {
    console.log(text);
  }
}

export async function runCli(args: string[]): Promise<void> {
  const { command, flags } = parseFlags(args);
  const projectRoot = process.cwd();

  // --- Session subcommands (no client needed) ---
  if (command === 'session') {
    const sub = args[1] ?? '';
    switch (sub) {
      case 'start': {
        const name = args[2] ?? flags.session ?? 'untitled';
        const existing = await loadSession(projectRoot);
        if (existing) {
          console.error(`Session "${existing.name}" already active. End it first with: ai session end`);
          process.exit(1);
        }
        const session = createSession(name);
        if (flags.themes?.length) addThemes(session, flags.themes);
        if (flags.constraints?.length) addConstraints(session, flags.constraints);
        await saveSession(projectRoot, session);
        console.log(`Session "${name}" started.`);
        return;
      }
      case 'status': {
        const session = await loadSession(projectRoot);
        if (!session) {
          console.log('No active session.');
          return;
        }
        console.log(formatSessionStatus(session));
        return;
      }
      case 'end': {
        const deleted = await deleteSession(projectRoot);
        console.log(deleted ? 'Session ended.' : 'No active session to end.');
        return;
      }
      case 'add-theme': {
        const session = await loadSession(projectRoot);
        if (!session) { console.error('No active session.'); process.exit(1); }
        const newThemes = args.slice(2);
        if (newThemes.length === 0) { console.error('Provide theme(s) to add.'); process.exit(1); }
        addThemes(session, newThemes);
        await saveSession(projectRoot, session);
        console.log(`Themes added: ${newThemes.join(', ')}`);
        return;
      }
      case 'add-constraint': {
        const session = await loadSession(projectRoot);
        if (!session) { console.error('No active session.'); process.exit(1); }
        const newConstraints = args.slice(2);
        if (newConstraints.length === 0) { console.error('Provide constraint(s) to add.'); process.exit(1); }
        addConstraints(session, newConstraints);
        await saveSession(projectRoot, session);
        console.log(`Constraints added: ${newConstraints.join(', ')}`);
        return;
      }
      default:
        console.log('Session commands:');
        console.log('  session start <name>       Start a new design session');
        console.log('  session status             Show current session state');
        console.log('  session end                End the current session');
        console.log('  session add-theme <t>      Add theme(s) to session');
        console.log('  session add-constraint <c> Add constraint(s) to session');
        return;
    }
  }

  const config = buildConfig(flags);
  const client = createClient(config);

  // Load session context (advisory — null if no session active)
  const session: DesignSession | null = await loadSession(projectRoot);
  const sessionCtx = session ? renderSessionContext(session) : undefined;

  if (session) {
    const n = session.artifacts;
    const counts = [
      n.districts.length && `${n.districts.length} districts`,
      n.factions.length && `${n.factions.length} factions`,
      n.quests.length && `${n.quests.length} quests`,
      n.rooms.length && `${n.rooms.length} rooms`,
      n.packs.length && `${n.packs.length} packs`,
    ].filter(Boolean);
    const openIssues = session.issues.filter(i => i.status === 'open').length;
    const parts = [session.name, ...counts];
    if (openIssues) parts.push(`${openIssues} open issues`);
    console.error(`Using session context: ${parts.join(', ')}.`);
  }

  switch (command) {
    case 'explain-validation-error': {
      let input: string;
      if (flags.stdin || !process.stdin.isTTY) {
        input = await readStdin();
      } else {
        console.error('Pipe validation errors as JSON, or use --stdin');
        process.exit(1);
      }

      let errors: Array<{ path: string; message: string }>;
      try {
        const parsed = JSON.parse(input);
        errors = Array.isArray(parsed) ? parsed : parsed.errors ?? [];
      } catch {
        console.error('Could not parse input as JSON');
        process.exit(1);
      }

      const result = await explainValidationError(client, { errors });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      await emit(result.text, flags.write);
      break;
    }

    case 'summarize-belief-trace': {
      let input: string;
      if (flags.stdin || !process.stdin.isTTY) {
        input = await readStdin();
      } else {
        console.error('Pipe belief trace as JSON, or use --stdin');
        process.exit(1);
      }

      let trace: Record<string, unknown>;
      try {
        trace = JSON.parse(input);
      } catch {
        console.error('Could not parse input as JSON');
        process.exit(1);
      }

      const format = (flags.format === 'forensic' || flags.format === 'author')
        ? flags.format
        : 'plain' as const;

      const result = await summarizeBeliefTrace(client, {
        trace: trace as never,
        format,
      });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      await emit(result.text, flags.write);
      break;
    }

    case 'create-room': {
      const theme = flags.theme;
      if (!theme) {
        console.error('--theme is required');
        process.exit(1);
      }

      const result = await createRoom(client, {
        theme,
        rulesetId: flags.ruleset,
        districtId: flags.district,
        repair: flags.repair,
        sessionContext: sessionCtx,
      });

      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }

      if (result.repaired && result.repairNote) {
        console.error(result.repairNote);
      } else if (!result.validation.valid) {
        console.error('Generated on first pass (has validation warnings).');
      }
      await emit(result.yaml, flags.write);

      if (!result.validation.valid) {
        console.error('\n--- Validation warnings ---');
        for (const err of result.validation.validation.errors) {
          console.error(`  ${err.path}: ${err.message}`);
        }
      }
      if (session) {
        const idMatch = result.yaml.match(/^id:\s*(\S+)/m);
        if (idMatch) addArtifact(session, 'rooms', idMatch[1]);
        await saveSession(projectRoot, session);
      }
      break;
    }

    case 'create-faction': {
      const theme = flags.theme;
      if (!theme) {
        console.error('--theme is required');
        process.exit(1);
      }

      const result = await createFaction(client, {
        theme,
        rulesetId: flags.ruleset,
        districtIds: flags.districts,
        sessionContext: sessionCtx,
      });

      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }

      await emit(result.yaml, flags.write);
      if (session) {
        const idMatch = result.yaml.match(/^id:\s*(\S+)/m);
        if (idMatch) addArtifact(session, 'factions', idMatch[1]);
        await saveSession(projectRoot, session);
      }
      break;
    }

    case 'create-quest': {
      const theme = flags.theme;
      if (!theme) {
        console.error('--theme is required');
        process.exit(1);
      }

      const result = await createQuest(client, {
        theme,
        rulesetId: flags.ruleset,
        factions: flags.factions,
        districts: flags.districts,
        repair: flags.repair,
        sessionContext: sessionCtx,
      });

      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }

      if (result.repaired && result.repairNote) {
        console.error(result.repairNote);
      } else if (!result.validation.valid) {
        console.error('Generated on first pass (has validation warnings).');
      }
      await emit(result.yaml, flags.write);

      if (!result.validation.valid) {
        console.error('\n--- Validation warnings ---');
        for (const err of result.validation.validation.errors) {
          console.error(`  ${err.path}: ${err.message}`);
        }
      }
      if (session) {
        const idMatch = result.yaml.match(/^id:\s*(\S+)/m);
        if (idMatch) addArtifact(session, 'quests', idMatch[1]);
        await saveSession(projectRoot, session);
      }
      break;
    }

    case 'explain-lint': {
      let input: string;
      if (flags.stdin || !process.stdin.isTTY) {
        input = await readStdin();
      } else {
        console.error('Pipe lint findings as JSON, or use --stdin');
        process.exit(1);
      }

      let findings: Array<{ path: string; message: string }>;
      try {
        const parsed = JSON.parse(input);
        findings = Array.isArray(parsed) ? parsed : parsed.errors ?? [];
      } catch {
        console.error('Could not parse input as JSON');
        process.exit(1);
      }

      const result = await explainLint(client, { findings });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      await emit(result.text, flags.write);
      break;
    }

    case 'create-district': {
      const theme = flags.theme;
      if (!theme) {
        console.error('--theme is required');
        process.exit(1);
      }

      const result = await createDistrict(client, {
        theme,
        rulesetId: flags.ruleset,
        factions: flags.factions,
        existingZones: flags.zones,
        sessionContext: sessionCtx,
      });

      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }

      await emit(result.yaml, flags.write);
      if (session) {
        const idMatch = result.yaml.match(/^id:\s*(\S+)/m);
        if (idMatch) addArtifact(session, 'districts', idMatch[1]);
        await saveSession(projectRoot, session);
      }
      break;
    }

    case 'explain-belief-divergence': {
      let input: string;
      if (flags.stdin || !process.stdin.isTTY) {
        input = await readStdin();
      } else {
        console.error('Pipe two belief traces as JSON ({traceA, traceB}), or use --stdin');
        process.exit(1);
      }

      let traceA: Record<string, unknown>;
      let traceB: Record<string, unknown>;
      try {
        const parsed = JSON.parse(input);
        traceA = parsed.traceA;
        traceB = parsed.traceB;
        if (!traceA || !traceB) throw new Error('missing traceA or traceB');
      } catch {
        console.error('Input must be JSON with traceA and traceB fields');
        process.exit(1);
      }

      const result = await explainBeliefDivergence(client, {
        traceA: traceA as never,
        traceB: traceB as never,
      });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      await emit(result.text, flags.write);
      break;
    }

    case 'create-location-pack': {
      const theme = flags.theme;
      if (!theme) {
        console.error('--theme is required');
        process.exit(1);
      }

      const result = await createLocationPack(client, {
        theme,
        rulesetId: flags.ruleset,
        factions: flags.factions,
        sessionContext: sessionCtx,
      });

      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }

      await emit(result.yaml, flags.write);
      if (session) {
        const idMatch = result.yaml.match(/^id:\s*(\S+)/m);
        if (idMatch) addArtifact(session, 'packs', idMatch[1]);
        await saveSession(projectRoot, session);
      }
      break;
    }

    case 'create-encounter-pack': {
      const theme = flags.theme;
      if (!theme) {
        console.error('--theme is required');
        process.exit(1);
      }

      const result = await createEncounterPack(client, {
        theme,
        rulesetId: flags.ruleset,
        districtId: flags.district,
        factions: flags.factions,
        difficulty: flags.difficulty,
        sessionContext: sessionCtx,
      });

      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }

      await emit(result.yaml, flags.write);
      if (session) {
        const idMatch = result.yaml.match(/^id:\s*(\S+)/m);
        if (idMatch) addArtifact(session, 'packs', idMatch[1]);
        await saveSession(projectRoot, session);
      }
      break;
    }

    case 'explain-district-state': {
      let input: string;
      if (flags.stdin || !process.stdin.isTTY) {
        input = await readStdin();
      } else {
        console.error('Pipe district state as JSON, or use --stdin');
        process.exit(1);
      }

      let state: Record<string, unknown>;
      try {
        state = JSON.parse(input);
        if (!state.districtId || !state.metrics) throw new Error('missing districtId or metrics');
      } catch {
        console.error('Input must be JSON with districtId and metrics fields');
        process.exit(1);
      }

      const result = await explainDistrictState(client, state as never);
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      await emit(result.text, flags.write);
      break;
    }

    case 'explain-faction-alert': {
      let input: string;
      if (flags.stdin || !process.stdin.isTTY) {
        input = await readStdin();
      } else {
        console.error('Pipe faction state as JSON, or use --stdin');
        process.exit(1);
      }

      let state: Record<string, unknown>;
      try {
        state = JSON.parse(input);
        if (!state.factionId || state.alertLevel === undefined) throw new Error('missing factionId or alertLevel');
      } catch {
        console.error('Input must be JSON with factionId, alertLevel, and cohesion fields');
        process.exit(1);
      }

      const result = await explainFactionAlert(client, state as never);
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      await emit(result.text, flags.write);
      break;
    }

    case 'improve-content': {
      let input: string;
      if (flags.stdin || !process.stdin.isTTY) {
        input = await readStdin();
      } else {
        console.error('Pipe content YAML via stdin, or use --stdin');
        process.exit(1);
      }

      const goal = flags.goal;
      if (!goal) {
        console.error('--goal is required');
        process.exit(1);
      }

      const result = await improveContent(client, {
        content: input,
        goal,
        contentType: flags.contentType,
        sessionContext: sessionCtx,
      });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      await emit(result.yaml, flags.write);
      break;
    }

    case 'expand-pack': {
      let input: string;
      if (flags.stdin || !process.stdin.isTTY) {
        input = await readStdin();
      } else {
        console.error('Pipe pack YAML via stdin, or use --stdin');
        process.exit(1);
      }

      const goal = flags.goal;
      if (!goal) {
        console.error('--goal is required');
        process.exit(1);
      }

      const result = await expandPack(client, {
        content: input,
        goal,
        constraints: flags.constraints,
        sessionContext: sessionCtx,
      });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      await emit(result.yaml, flags.write);
      break;
    }

    case 'critique-content': {
      let input: string;
      if (flags.stdin || !process.stdin.isTTY) {
        input = await readStdin();
      } else {
        console.error('Pipe content YAML via stdin, or use --stdin');
        process.exit(1);
      }

      const result = await critiqueContent(client, {
        content: input,
        contentType: flags.contentType,
        focus: flags.focus,
        sessionContext: sessionCtx,
      });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }

      // Prose critique to stdout/write
      await emit(result.text, flags.write);

      // Structured findings to stderr for visibility
      if (result.issues.length > 0) {
        console.error(`\n--- ${result.issues.length} issue(s) found ---`);
        for (const issue of result.issues) {
          console.error(`  [${issue.severity}] ${issue.code}: ${issue.summary}`);
        }
      }
      if (result.suggestions.length > 0) {
        console.error(`\n--- ${result.suggestions.length} suggestion(s) ---`);
        for (const sug of result.suggestions) {
          console.error(`  [${sug.priority}] ${sug.code}: ${sug.action}`);
        }
      }
      if (result.summary) {
        console.error(`\n--- Summary ---\n  ${result.summary}`);
      }
      if (session && result.issues.length > 0) {
        addCritiqueIssues(session, result.issues);
        await saveSession(projectRoot, session);
      }
      break;
    }

    case 'normalize-content': {
      let input: string;
      if (flags.stdin || !process.stdin.isTTY) {
        input = await readStdin();
      } else {
        console.error('Pipe content YAML via stdin, or use --stdin');
        process.exit(1);
      }

      const result = await normalizeContent(client, {
        content: input,
        contentType: flags.contentType,
      });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      await emit(result.yaml, flags.write);
      break;
    }

    case 'diff-summary': {
      let input: string;
      if (flags.stdin || !process.stdin.isTTY) {
        input = await readStdin();
      } else {
        console.error('Pipe JSON with before and after fields, or use --stdin');
        process.exit(1);
      }

      let before: string;
      let after: string;
      try {
        const parsed = JSON.parse(input);
        before = parsed.before;
        after = parsed.after;
        if (!before || !after) throw new Error('missing before or after');
      } catch {
        console.error('Input must be JSON with before and after string fields');
        process.exit(1);
      }

      const result = await diffSummary(client, {
        before,
        after,
        labelBefore: flags.labelBefore,
        labelAfter: flags.labelAfter,
      });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      await emit(result.text, flags.write);
      break;
    }

    default:
      console.log('@ai-rpg-engine/ollama v0.6.0');
      console.log('');
      console.log('Session:');
      console.log('  session start <name>        Start a named design session');
      console.log('  session status              Show current session state');
      console.log('  session end                 End the current session');
      console.log('  session add-theme <text>    Add a theme to the active session');
      console.log('  session add-constraint <t>  Add a constraint to the active session');
      console.log('');
      console.log('Scaffold:');
      console.log('  create-room                 Generate a room definition');
      console.log('  create-faction              Generate a faction configuration');
      console.log('  create-quest                Generate a quest definition');
      console.log('  create-district             Generate a district configuration');
      console.log('  create-location-pack        Generate district + rooms bundle');
      console.log('  create-encounter-pack       Generate room + entities + quest bundle');
      console.log('');
      console.log('Iterate:');
      console.log('  improve-content             Revise content toward a goal (pipe YAML)');
      console.log('  expand-pack                 Add content to an existing pack (pipe YAML)');
      console.log('  critique-content            Senior designer review (pipe YAML)');
      console.log('  normalize-content           Clean up style + schema conformance (pipe YAML)');
      console.log('  diff-summary                Explain changes between two versions (pipe JSON)');
      console.log('');
      console.log('Diagnose:');
      console.log('  explain-validation-error    Explain validation errors (pipe JSON)');
      console.log('  explain-lint                Explain lint findings (pipe JSON)');
      console.log('  explain-belief-divergence   Compare two belief traces (pipe JSON)');
      console.log('  explain-district-state      Explain district metrics (pipe JSON)');
      console.log('  explain-faction-alert       Explain faction alert level (pipe JSON)');
      console.log('  summarize-belief-trace      Summarize a belief trace (pipe JSON)');
      console.log('');
      console.log('Flags:');
      console.log('  --model <name>       Ollama model (default: qwen2.5-coder)');
      console.log('  --url <url>          Ollama base URL (default: http://localhost:11434)');
      console.log('  --theme <text>       Theme for content generation');
      console.log('  --themes <texts>     Comma-separated themes (for session start)');
      console.log('  --goal <text>        Improvement/expansion goal');
      console.log('  --content-type <t>   Content type hint (room, district, quest, etc.)');
      console.log('  --focus <text>       Focus area for critique');
      console.log('  --session <name>     Session name (for session start)');
      console.log('  --ruleset <id>       Ruleset ID for context');
      console.log('  --district <id>      District ID for context');
      console.log('  --factions <ids>     Comma-separated faction IDs');
      console.log('  --districts <ids>    Comma-separated district IDs');
      console.log('  --zones <ids>        Comma-separated existing zone IDs');
      console.log('  --constraints <c>    Comma-separated constraints');
      console.log('  --difficulty <level>  Encounter difficulty hint');
      console.log('  --label-before <t>   Label for "before" version in diff');
      console.log('  --label-after <t>    Label for "after" version in diff');
      console.log('  --repair             Attempt to fix invalid generated content');
      console.log('  --write <path>       Write output to file instead of stdout');
      console.log('  --format <fmt>       Output format: plain, forensic, author');
      console.log('  --stdin              Read input from stdin');
      break;
  }
}
