import type { Npc } from "@/lib/game/districts";

/**
 * Sarvam Prism questions for one NPC conversation.
 *
 * The voice worker posts this object unchanged (it arrives in the LiveKit
 * brief). The typed path in /api/talk builds the same object per turn.
 * `agent.py` only reads the answers, so the wording lives here.
 *
 * A yes is "met" more likely than "not". Exactly 0.5 stays incomplete: Prism
 * jitters slightly between identical calls, and a coin flip should not clear
 * a mission.
 */
export const MISSION_YES = 0.5;

export type MissionQuestions = {
  mission_complete: {
    type: "noul";
    instructions: string;
    criteria: { true: string; false: string };
  };
  anger: {
    type: "score";
    instructions: string;
    criteria: [string, string, string];
  };
};

export function missionQuestions(npc: Npc, languageLabel: string): MissionQuestions {
  return {
    mission_complete: {
      type: "noul",
      instructions:
        `The player is talking to ${npc.name}, ${npc.role}. ` +
        `Has the player genuinely met this objective across the whole conversation? ` +
        `"${npc.mission.successCriteria}" ` +
        `A greeting, or the player merely asking, is never enough. ` +
        `Do not pass it early, and do not withhold it once it has actually been earned. ` +
        `The player is a beginner in ${languageLabel}; fumbling the grammar is not failure.`,
      criteria: {
        true: "The objective has actually been earned in the conversation.",
        false: "The objective has not been earned yet.",
      },
    },
    anger: {
      type: "score",
      instructions:
        `How badly did the player's LAST message cross this line? "${npc.provokes}" ` +
        `Judge only that last player line. Never punish bad grammar or a thick accent. ` +
        `Most turns are the lowest level.`,
      criteria: [
        "Fine. Normal conversation, or merely clumsy.",
        "Genuinely rude, insulting, or pushy.",
        "Outrageous. A bribe, a threat, or open contempt.",
      ],
    },
  };
}

export type MissionVerdict = { missionComplete: boolean; anger: number };

type PrismAnswer = { type?: string; noul?: unknown; score?: unknown };

/** Reads a Prism `answers` object. Null when the shape is not the two questions above. */
export function readMissionVerdict(answers: Record<string, PrismAnswer> | null | undefined): MissionVerdict | null {
  const mission = answers?.mission_complete;
  const anger = answers?.anger;
  if (mission?.type !== "noul" || typeof mission.noul !== "number") return null;
  if (anger?.type !== "score" || typeof anger.score !== "number") return null;
  return {
    missionComplete: mission.noul > MISSION_YES,
    anger: Math.max(0, Math.min(2, Math.round(anger.score))),
  };
}
