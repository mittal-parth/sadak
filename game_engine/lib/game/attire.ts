/**
 * What an errand's host wears, from their job, their city and their voice:
 * an auto driver in his union khaki (grey in Delhi) with a towel on the
 * shoulder, a conductor in khaki with the leather cash bag, a ticket clerk
 * in a pressed shirt with an ID on a lanyard, a flower seller in her city's
 * sari, a cook in an apron, a sevadar with a covered head. A host whose voice
 * is a woman's is dressed as a woman, and a man's as a man.
 */

import type { Landmark } from "./assets";
import type { KitPiece, PersonOptions, PersonPreset, Headwear } from "./people";

/** The Sarvam v3 speakers with women's voices (lib/sarvam.ts). */
const WOMEN = new Set(["ritu", "priya", "neha", "pooja", "simran", "kavya", "ishita", "shreya", "roopa", "tanya", "shruti", "suhani", "kavitha", "rupali"]);

export const isWomansVoice = (speaker: string) => WOMEN.has(speaker.toLowerCase());

const KHAKI = 0xb89a64;
const KHAKI_DARK = 0x8a7550;

/** Each city's everyday sari, and the salwar suit where that is the norm. */
const SARI: Record<Landmark, number> = {
  delhi: 0xd4a017,
  mumbai: 0x2e8b57,
  chennai: 0xa31f34,
  bengaluru: 0x7b2d8b,
  kolkata: 0xf2efe6,
  hyderabad: 0x1f6f5c,
  kochi: 0xf1e6c8,
  ahmedabad: 0xb3262f,
  amritsar: 0xc2185b,
  bhubaneswar: 0x8e3a59,
};

/** Dhoti, veshti, mundu: what a man ties at the waist in the south and east. */
const WRAP: Partial<Record<Landmark, number>> = {
  chennai: 0xf4efe4,
  kochi: 0xf1e6c8,
  bhubaneswar: 0x3f5b3f,
  kolkata: 0x2f5f8f,
};

type Role = "auto" | "conductor" | "clerk" | "flowers" | "temple" | "caretaker" | "sevadar" | "waiter" | "cook";

function roleOf(role: string, kind: string): Role {
  const r = role.toLowerCase();
  if (kind === "auto" || r.includes("driver")) return "auto";
  if (r.includes("conductor") || (kind === "bus" && r.includes("ticket"))) return "conductor";
  if (kind === "counter" || r.includes("clerk")) return "clerk";
  if (r.includes("sevadar")) return "sevadar";
  if (r.includes("caretaker") || r.includes("masjid")) return "caretaker";
  // Sellers at a place of worship's gate: flowers, candles.
  if (r.includes("flower") || r.includes("candle")) return "flowers";
  if (kind === "temple" || r.includes("prasad") || r.includes("temple")) return "temple";
  if (r.includes("waiter")) return "waiter";
  return "cook";
}

/** Outfit for an errand host. `seed` keeps the face and build their own. */
export function attireFor(
  task: { role: string; kind: string; speaker: string },
  city: Landmark,
  seed: number
): PersonOptions {
  const female = isWomansVoice(task.speaker);
  const role = roleOf(task.role, task.kind);
  const base = { seed, female, carryProp: false };
  const woman = (kit: KitPiece[] = [], headwear?: Headwear, headColour?: number): PersonOptions => {
    const suit = city === "amritsar" || (city === "delhi" && role !== "flowers");
    const preset: PersonPreset = suit ? "salwar_kameez" : "sari";
    return { ...base, preset, cloth1: SARI[city], cloth2: suit ? 0xf2efe6 : SARI[city], kit, headwear, headColour };
  };
  // Sikh men in Amritsar wear the turban at any job.
  const sikh = city === "amritsar" && !female;
  const turban = (colour: number) => (sikh ? { headwear: "turban" as const, headColour: colour } : {});

  switch (role) {
    case "auto":
      if (female) return woman(["towel"]);
      return {
        ...base,
        preset: "shirt_trousers",
        // Delhi's autowallahs wear grey; most cities khaki.
        cloth1: city === "delhi" ? 0x8b949e : city === "kolkata" ? 0xd9d4c5 : KHAKI,
        cloth2: city === "delhi" ? 0x5b636b : city === "kolkata" ? 0x35302a : KHAKI_DARK,
        kit: ["towel"],
        ...turban(0x1f3a5f),
      };
    case "conductor":
      if (female) return woman(["ticketBag"]);
      return {
        ...base,
        preset: "shirt_trousers",
        // BMTC's conductors in blue; the rest in khaki.
        cloth1: city === "bengaluru" ? 0x6c8ebf : KHAKI,
        cloth2: city === "bengaluru" ? 0x2c3e50 : KHAKI_DARK,
        kit: ["ticketBag"],
        ...turban(0x2c3e50),
      };
    case "clerk":
      if (female) return woman(["lanyard"]);
      return { ...base, preset: "shirt_trousers", cloth1: 0xecebe6, cloth2: 0x2c3440, kit: ["lanyard"], ...turban(0x2c3e50) };
    case "sevadar":
      // Head covered in the gurdwara: a turban, or a dupatta for a woman.
      if (female) return { ...woman([], "dupatta", 0xff9933) };
      return { ...base, preset: "kurta_pyjama", cloth1: 0xf2efe6, cloth2: 0xf2efe6, headwear: "turban", headColour: 0xff9933 };
    case "flowers":
      if (female) return woman();
      return { ...base, preset: WRAP[city] ? "lungi" : "kurta_pyjama", cloth1: 0xf2efe6, cloth2: WRAP[city] ?? 0xf2efe6, ...turban(0xff9933) };
    case "temple":
      if (female) return woman();
      // White kurta or veshti with a saffron angavastram.
      return {
        ...base,
        preset: WRAP[city] ? "lungi" : "kurta_pyjama",
        cloth1: 0xf4efe4,
        cloth2: WRAP[city] ?? 0xf4efe4,
        kit: ["angavastram"],
        kitColour: city === "amritsar" ? 0x1f3a5f : 0xe8872a,
        ...turban(0xff9933),
      };
    case "caretaker":
      // A mosque's khadim: white kurta-pyjama and a crocheted cap.
      if (female) return woman([], "dupatta", 0xf2efe6);
      return { ...base, preset: "kurta_pyjama", cloth1: 0xf4f4f0, cloth2: 0xf4f4f0, headwear: "skullcap", headColour: 0xf4f4f0 };
    case "waiter":
      // An Irani cafe's waiter: white shirt, dark trousers, a crocheted cap.
      if (female) return woman(["apron"]);
      return { ...base, preset: "shirt_trousers", cloth1: 0xf4f4f0, cloth2: 0x24303a, headwear: "skullcap", headColour: 0xf4f4f0 };
    case "cook":
      if (female) return woman(["apron"]);
      return {
        ...base,
        preset: WRAP[city] ? "lungi" : "kurta_pyjama",
        cloth1: city === "mumbai" ? 0xe4e1d6 : 0xe8dcc0,
        cloth2: WRAP[city] ?? 0x4a4238,
        kit: ["apron"],
        // Mumbai's vendors in the white Gandhi topi.
        ...(city === "mumbai" ? { headwear: "topi" as const, headColour: 0xf4f4f0 } : turban(0xc0392b)),
      };
  }
}
