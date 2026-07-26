export type NpcTurn = { role: "user" | "assistant"; content: string };

export type NpcMemoryMap = Record<string, NpcTurn[]>;

export const NPC_MEMORY_MAX_TURNS = 12;

export function memoryKey(districtId: string, characterId: string): string {
  return `${districtId}:${characterId}`;
}

/** Append new turns and keep only the most recent lines for prompts. */
export function mergeTurns(existing: NpcTurn[], incoming: NpcTurn[]): NpcTurn[] {
  if (!incoming.length) return existing;
  const merged = [...existing, ...incoming];
  if (merged.length <= NPC_MEMORY_MAX_TURNS) return merged;
  return merged.slice(-NPC_MEMORY_MAX_TURNS);
}
