// Command: create-room — theme in, schema-valid YAML room out
// Repair loop lives in generateWithRepair (single correction pass).

import type { OllamaTextClient } from '../client.js';
import { createRoomPrompt } from '../prompts/create-room.js';
import { validateGeneratedRoom } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type { GeneratedTextResult };

export type CreateRoomInput = {
  theme: string;
  rulesetId?: string;
  districtId?: string;
  existingZones?: string[];
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export async function createRoom(
  client: OllamaTextClient,
  input: CreateRoomInput,
): Promise<GeneratedTextResult> {
  return generateWithRepair({
    client,
    system: createRoomPrompt.system,
    prompt: createRoomPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      districtId: input.districtId,
      existingZones: input.existingZones,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'room',
    validate: validateGeneratedRoom,
  });
}
