import type { LessonStep } from "@/lib/game/districts";
import { streetLessonsFor } from "@/lib/game/street-task-lessons";
import {
  BARBER_INTERACT_LABEL,
  barberNpcFor,
  barberTaskId,
} from "@/lib/game/barber";
import { SIX_SEED_TASK_PACKS } from "./tasks-six";
import {
  lessonTierFor,
  type ComfortLevel,
  type LessonTier,
} from "@/lib/game/levels";

/** "counter": a ticket window (a local train, the metro, a ferry). "barber":
 *  the optional haircut. */
export type TaskKind = "auto" | "shop" | "temple" | "bus" | "counter" | "barber";

export type StreetTask = {
  id: string;
  districtId: string;
  kind: TaskKind;
  /** Map coordinates, metres from the district map's centre (+x east,
   *  +z south): the spot the map compiler reserved for this errand. */
  pos: [number, number];
  title: string;
  brief: string;
  reward: number;
  /** Shown on the E prompt when the player is in range. */
  interactLabel: string;
  name: string;
  role: string;
  speaker: string;
  colour: number;
  lessons: Record<LessonTier, LessonStep[]>;
  /** Shown on the completion card instead of a detective clue. */
  completionNote: string;
};

export type DistrictTaskPack = {
  districtId: string;
  finale: { title: string; text: string };
  tasks: StreetTask[];
};

/** What the dialogue UI needs — tasks and legacy NPCs share this shape. */
export type LessonTarget = {
  id: string;
  name: string;
  role: string;
  colour: number;
  title: string;
  brief: string;
  reward: number;
  speaker: string;
  lesson: LessonStep[];
  completionNote: string;
  errandLevel?: number;
  lessonTier?: LessonTier;
  /** Set for optional errands that pay XP instead of cash. */
  xpReward?: number;
};

/**
 * Every errand's own colour, by its place in the pack (auto, shop, temple,
 * bus, then the city's errand): its marker over the host's head, its dot on
 * the minimap and the full map, its chip in the errand list and its dialogue
 * header all share it. Distinct within a pack; the same slot is the same
 * colour in every city.
 */
export const ERRAND_COLOURS = [0xf5c518, 0xff7a1a, 0xe8364f, 0x2f8fff, 0xb05cff, 0x19c3b0, 0xff5fa2] as const;

/**
 * The haircut, as a StreetTask so it can ride the existing dialogue, grading
 * and TTS-cache pipeline unchanged.
 *
 * Built on demand rather than stored in a DistrictTaskPack: the packs live in
 * Supabase and drive errand progress, the four-errand finale and the district
 * picker's task count. The haircut is optional and pays XP only, so putting it
 * in a pack would make every city look like it needed five errands to finish.
 */
export function barberTaskFor(districtId: string): StreetTask {
  const npc = barberNpcFor(districtId);
  return {
    id: barberTaskId(districtId),
    districtId,
    kind: "barber",
    // The shop stands where the district map puts it (MapData.barber); the
    // haircut is a conversation, and nothing reads its position.
    pos: [0, 0],
    title: "A haircut",
    brief: npc.brief,
    reward: 0,
    interactLabel: BARBER_INTERACT_LABEL,
    name: npc.name,
    role: npc.role,
    speaker: npc.speaker,
    colour: 0x33406b,
    completionNote: "Hair cut, and you never switched to English.",
    lessons: streetLessonsFor(barberTaskId(districtId)),
  };
}

/**
 * The haircut sits outside the errand ladder, so its difficulty tracks the
 * player's comfort setting directly rather than a position in the pack.
 */
export function barberLessonFor(districtId: string, comfort: ComfortLevel): LessonStep[] {
  return barberTaskFor(districtId).lessons[comfort];
}

export function errandIndexForTask(taskId: string, tasks: StreetTask[]): number {
  const idx = tasks.findIndex((t) => t.id === taskId);
  return idx >= 0 ? idx : 0;
}

export function resolveTaskLesson(
  task: StreetTask,
  comfort: ComfortLevel,
  tasks: StreetTask[],
): LessonStep[] {
  const index = errandIndexForTask(task.id, tasks);
  const tier = lessonTierFor(comfort, index);
  return task.lessons[tier];
}

export function taskAsLessonTarget(
  task: StreetTask,
  lesson: LessonStep[],
  meta?: { errandLevel?: number; lessonTier?: LessonTier; xpReward?: number }
): LessonTarget {
  return {
    id: task.id,
    name: task.name,
    role: task.role,
    colour: task.colour,
    title: task.title,
    brief: task.brief,
    reward: task.reward,
    speaker: task.speaker,
    lesson,
    completionNote: task.completionNote,
    errandLevel: meta?.errandLevel,
    lessonTier: meta?.lessonTier,
    xpReward: meta?.xpReward,
  };
}

const puraniSadak: DistrictTaskPack = {
  districtId: "purani-sadak",
  finale: {
    title: "PURANI SADAK SURVIVED",
    text: "Auto negotiated, chai ordered, flowers at the mandir, bus ticket in your pocket. You did a full Delhi morning without switching to English.",
  },
  tasks: [
    {
      id: "purani-sadak-auto",
      districtId: "purani-sadak",
      kind: "auto",
      pos: [283.6, -257.7],
      title: "Stop the auto",
      brief: "Hail Raju's parked auto, name the railway station, and get the fare under ₹150.",
      reward: 250,
      interactLabel: "Talk to auto driver",
      name: "Raju Bhai",
      role: "Auto Driver",
      speaker: "aditya",
      colour: 0xf5c518,
      completionNote: "Fare agreed — you're riding to New Delhi station.",
      lessons: streetLessonsFor("purani-sadak-auto"),
    },
    {
      id: "purani-sadak-shop",
      districtId: "purani-sadak",
      kind: "shop",
      pos: [5.6, -314.9],
      title: "Kachori at the stall",
      brief: "Buy two kachoris and a chai. Say kachori, not 'snack'.",
      reward: 180,
      interactLabel: "Order at the stall",
      name: "Vikram",
      role: "Kachori Wallah",
      speaker: "rohan",
      colour: 0xff7a1a,
      completionNote: "Two kachoris and cutting chai — breakfast sorted.",
      lessons: streetLessonsFor("purani-sadak-shop"),
    },
    {
      id: "purani-sadak-temple",
      districtId: "purani-sadak",
      kind: "temple",
      pos: [212.3, -305.5],
      title: "Flowers at the mandir",
      brief: "Buy marigold garlands for the temple. Ask the price before you pay.",
      reward: 200,
      interactLabel: "Buy at temple stall",
      name: "Sunita",
      role: "Flower Seller",
      speaker: "ritu",
      colour: 0xe8364f,
      completionNote: "Garlands in hand — ready for darshan.",
      lessons: streetLessonsFor("purani-sadak-temple"),
    },
    {
      id: "purani-sadak-bus",
      districtId: "purani-sadak",
      kind: "bus",
      pos: [276, -91.1],
      title: "Bus ticket",
      brief: "Buy a ticket to Chandni Chowk. Name the stop and ask the fare.",
      reward: 220,
      interactLabel: "Buy bus ticket",
      name: "Suresh",
      role: "Bus Conductor",
      speaker: "shubh",
      colour: 0x2f8fff,
      completionNote: "Ticket punched — next stop Chandni Chowk.",
      lessons: streetLessonsFor("purani-sadak-bus"),
    },
    {
      id: "purani-sadak-paranthe",
      districtId: "purani-sadak",
      kind: "shop",
      pos: [-280.9, -318.4],
      title: "Paranthe in the gali",
      brief: "Order stuffed paranthe in Paranthe Wali Gali. Ask for chutney and settle the bill.",
      reward: 230,
      interactLabel: "Order paranthe",
      name: "Mohan",
      role: "Paratha Wallah",
      speaker: "vijay",
      colour: 0xb05cff,
      completionNote: "Aloo paranthe, fried in ghee, in the lane that has made them since the Mughals.",
      lessons: streetLessonsFor("purani-sadak-paranthe"),
    },
  ],
};

const marinaNagar: DistrictTaskPack = {
  districtId: "marina-nagar",
  finale: {
    title: "MARINA MORNING DONE",
    text: "Share auto, masala dosa, temple coconut, bus to the beach — a Chennai day in Tamil.",
  },
  tasks: [
    {
      id: "marina-nagar-auto",
      districtId: "marina-nagar",
      kind: "auto",
      pos: [-278.6, 91.1],
      title: "Share auto to T Nagar",
      brief: "Split the auto fare with another passenger. Ask where they are going first.",
      reward: 250,
      interactLabel: "Hail the auto",
      name: "Murugan",
      role: "Auto Driver",
      speaker: "vijay",
      colour: 0xf5c518,
      completionNote: "Share auto to T Nagar — meter plus split fare.",
      lessons: streetLessonsFor("marina-nagar-auto"),
    },
    {
      id: "marina-nagar-shop",
      districtId: "marina-nagar",
      kind: "shop",
      pos: [-180.7, 136.6],
      title: "Masala dosa",
      brief: "Order a masala dosa and filter coffee at the tiffin stall.",
      reward: 180,
      interactLabel: "Order at tiffin stall",
      name: "Anbu",
      role: "Tiffin Master",
      speaker: "rohan",
      colour: 0xff7a1a,
      completionNote: "Crisp dosa and kaapi — Marina breakfast.",
      lessons: streetLessonsFor("marina-nagar-shop"),
    },
    {
      id: "marina-nagar-temple",
      districtId: "marina-nagar",
      kind: "temple",
      pos: [-210.6, 107.6],
      title: "Coconut at the temple",
      brief: "Buy a coconut for archana at the shore temple stall.",
      reward: 200,
      interactLabel: "Buy prasad",
      name: "Iyer",
      role: "Temple Stall",
      speaker: "kavitha",
      colour: 0xe8364f,
      completionNote: "Coconut and kumkum — ready for archana.",
      lessons: streetLessonsFor("marina-nagar-temple"),
    },
    {
      id: "marina-nagar-bus",
      districtId: "marina-nagar",
      kind: "bus",
      pos: [-305.3, 177],
      title: "Beach bus ticket",
      brief: "Get a ticket to Marina Beach on the city bus.",
      reward: 220,
      interactLabel: "Buy bus ticket",
      name: "Dass",
      role: "Conductor",
      speaker: "shubh",
      colour: 0x2f8fff,
      completionNote: "Ticket to Marina Beach — keep it for checking.",
      lessons: streetLessonsFor("marina-nagar-bus"),
    },
    {
      id: "marina-nagar-sundal",
      districtId: "marina-nagar",
      kind: "shop",
      pos: [302.5, 98.1],
      title: "Sundal on Marina Beach",
      brief: "Buy a packet of sundal from the beach seller. Ask for raw mango on top.",
      reward: 210,
      interactLabel: "Buy sundal",
      name: "Valli",
      role: "Sundal Seller",
      speaker: "kavitha",
      colour: 0xb05cff,
      completionNote: "Hot sundal with raw mango, eaten with the sea wind.",
      lessons: streetLessonsFor("marina-nagar-sundal"),
    },
  ],
};

const majesticCross: DistrictTaskPack = {
  districtId: "majestic-cross",
  finale: {
    title: "MAJESTIC ERRANDS DONE",
    text: "Auto to Majestic, idli-vada, temple flowers, BMTC ticket — Bengaluru without English.",
  },
  tasks: [
    {
      id: "majestic-cross-auto",
      districtId: "majestic-cross",
      kind: "auto",
      pos: [279.2, -60],
      title: "Auto to Majestic",
      brief: "Negotiate with Shankar's auto to Majestic bus stand. Push back on the first quote.",
      reward: 250,
      interactLabel: "Stop the auto",
      name: "Shankar",
      role: "Auto Driver",
      speaker: "vijay",
      colour: 0xf5c518,
      completionNote: "Auto to Majestic — fare settled in Kannada.",
      lessons: streetLessonsFor("majestic-cross-auto"),
    },
    {
      id: "majestic-cross-shop",
      districtId: "majestic-cross",
      kind: "shop",
      pos: [243.3, 48.3],
      title: "Idli and vada",
      brief: "Order two idlis and a vada at Girija's tiffin cart.",
      reward: 180,
      interactLabel: "Order tiffin",
      name: "Girija",
      role: "Tiffin Cart",
      speaker: "shruti",
      colour: 0xff7a1a,
      completionNote: "Hot idli-vada and chutney — classic Bengaluru.",
      lessons: streetLessonsFor("majestic-cross-shop"),
    },
    {
      id: "majestic-cross-temple",
      districtId: "majestic-cross",
      kind: "temple",
      pos: [238.3, -2.2],
      title: "Temple flowers",
      brief: "Buy jasmine garland at the temple entrance.",
      reward: 200,
      interactLabel: "Buy flowers",
      name: "Lakshmi",
      role: "Flower Seller",
      speaker: "ritu",
      colour: 0xe8364f,
      completionNote: "Mallige garland for the deity.",
      lessons: streetLessonsFor("majestic-cross-temple"),
    },
    {
      id: "majestic-cross-bus",
      districtId: "majestic-cross",
      kind: "bus",
      pos: [94.8, -58.6],
      title: "BMTC ticket",
      brief: "Buy a bus ticket to Shivajinagar at the Majestic stop.",
      reward: 220,
      interactLabel: "Buy bus ticket",
      name: "Rafi",
      role: "Conductor",
      speaker: "gokul",
      colour: 0x2f8fff,
      completionNote: "BMTC ticket to Shivajinagar.",
      lessons: streetLessonsFor("majestic-cross-bus"),
    },
    {
      id: "majestic-cross-metro",
      districtId: "majestic-cross",
      kind: "counter",
      pos: [-90.2, 41.5],
      title: "Metro token at Majestic",
      brief: "Buy a Namma Metro token to MG Road. Token, not card.",
      reward: 240,
      interactLabel: "Buy metro token",
      name: "Ravi",
      role: "Ticket Clerk",
      speaker: "dev",
      colour: 0xb05cff,
      completionNote: "Token for MG Road — Purple Line, downstairs.",
      lessons: streetLessonsFor("majestic-cross-metro"),
    },
  ],
};

const parkGully: DistrictTaskPack = {
  districtId: "park-gully",
  finale: {
    title: "PARA ERRANDS DONE",
    text: "Yellow taxi fare, singara-kachori, temple prasad, tram ticket — Kolkata in Bengali.",
  },
  tasks: [
    {
      id: "park-gully-auto",
      districtId: "park-gully",
      kind: "auto",
      pos: [-151.5, -316.3],
      title: "Auto to Howrah",
      brief: "Tell Bikash-da you need Howrah station and agree a fair fare.",
      reward: 250,
      interactLabel: "Hail the auto",
      name: "Bikash-da",
      role: "Auto Driver",
      speaker: "soham",
      colour: 0xf5c518,
      completionNote: "Howrah-bound — fare settled.",
      lessons: streetLessonsFor("park-gully-auto"),
    },
    {
      id: "park-gully-shop",
      districtId: "park-gully",
      kind: "shop",
      pos: [-222.9, -194.9],
      title: "Singara and kachori",
      brief: "Order singara and kachori from Mitali's shop corner.",
      reward: 180,
      interactLabel: "Order snacks",
      name: "Mitali",
      role: "Snack Shop",
      speaker: "ishita",
      colour: 0xff7a1a,
      completionNote: "Singara-kachori and cha — para snack.",
      lessons: streetLessonsFor("park-gully-shop"),
    },
    {
      id: "park-gully-temple",
      districtId: "park-gully",
      kind: "temple",
      pos: [-184.6, -153.4],
      title: "Prasad at the mandir",
      brief: "Buy prasad packet at the Kali temple gate.",
      reward: 200,
      interactLabel: "Buy prasad",
      name: "Paritosh",
      role: "Temple Stall",
      speaker: "ashutosh",
      colour: 0xe8364f,
      completionNote: "Prasad in hand — join the queue.",
      lessons: streetLessonsFor("park-gully-temple"),
    },
    {
      id: "park-gully-bus",
      districtId: "park-gully",
      kind: "bus",
      pos: [-287.8, -211],
      title: "Tram ticket",
      brief: "Buy a tram ticket to Esplanade at the stop.",
      reward: 220,
      interactLabel: "Buy tram ticket",
      name: "Nazrul",
      role: "Ticket Seller",
      speaker: "soham",
      colour: 0x2f8fff,
      completionNote: "Tram ticket to Esplanade — validate before boarding.",
      lessons: streetLessonsFor("park-gully-bus"),
    },
    {
      id: "park-gully-roll",
      districtId: "park-gully",
      kind: "shop",
      pos: [35.4, -37.1],
      title: "Kathi roll on Park Street",
      brief: "Order an egg roll from the Park Street roll counter. Onion and chilli, your call.",
      reward: 220,
      interactLabel: "Order a roll",
      name: "Babu",
      role: "Roll Wallah",
      speaker: "rohan",
      colour: 0xb05cff,
      completionNote: "Egg roll, extra onion — the Park Street way.",
      lessons: streetLessonsFor("park-gully-roll"),
    },
  ],
};

/** Authoring / seed only — runtime loads from Supabase. */
export const SEED_TASK_PACKS: DistrictTaskPack[] = [
  puraniSadak,
  marinaNagar,
  majesticCross,
  parkGully,
  ...SIX_SEED_TASK_PACKS,
];

export function findTaskById(
  tasks: StreetTask[],
  taskId: string,
): StreetTask | undefined {
  return tasks.find((t) => t.id === taskId);
}

export function totalTaskRewardForTasks(tasks: StreetTask[]): number {
  return tasks.reduce((s, t) => s + t.reward, 0);
}
