import type { LessonStep } from "@/lib/game/districts";
import { streetLessonsFor } from "@/lib/game/street-task-lessons";
import { SIX_SEED_TASK_PACKS } from "./tasks-six";
import {
  lessonTierFor,
  type ComfortLevel,
  type LessonTier,
} from "@/lib/game/levels";

export type TaskKind = "auto" | "shop" | "temple" | "bus";

export type StreetTask = {
  id: string;
  districtId: string;
  kind: TaskKind;
  /** Offset from the chowk centre, same as NPC positions. */
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
  lesson: LessonStep[];
  completionNote: string;
  errandLevel?: number;
  lessonTier?: LessonTier;
};

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
  meta?: { errandLevel: number; lessonTier: LessonTier }
): LessonTarget {
  return {
    id: task.id,
    name: task.name,
    role: task.role,
    colour: task.colour,
    title: task.title,
    brief: task.brief,
    reward: task.reward,
    lesson,
    completionNote: task.completionNote,
    errandLevel: meta?.errandLevel,
    lessonTier: meta?.lessonTier,
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
      pos: [20, -3],
      title: "Stop the auto",
      brief: "Hail Raju's parked auto, name the railway station, and get the fare under ₹150.",
      reward: 250,
      interactLabel: "Talk to auto driver",
      name: "Raju Bhai",
      role: "Auto Driver",
      speaker: "aditya",
      colour: 0xf4d03f,
      completionNote: "Fare agreed — you're riding to New Delhi station.",
      lessons: streetLessonsFor("purani-sadak-auto"),
    },
    {
      id: "purani-sadak-shop",
      districtId: "purani-sadak",
      kind: "shop",
      pos: [-20, 5],
      title: "Kachori at the stall",
      brief: "Buy two kachoris and a chai. Say kachori, not 'snack'.",
      reward: 180,
      interactLabel: "Order at the stall",
      name: "Vikram",
      role: "Kachori Wallah",
      speaker: "rohan",
      colour: 0xe67e22,
      completionNote: "Two kachoris and cutting chai — breakfast sorted.",
      lessons: streetLessonsFor("purani-sadak-shop"),
    },
    {
      id: "purani-sadak-temple",
      districtId: "purani-sadak",
      kind: "temple",
      pos: [8, 79.5],
      title: "Flowers at the mandir",
      brief: "Buy marigold garlands for the temple. Ask the price before you pay.",
      reward: 200,
      interactLabel: "Buy at temple stall",
      name: "Sunita",
      role: "Flower Seller",
      speaker: "ritu",
      colour: 0xe74c3c,
      completionNote: "Garlands in hand — ready for darshan.",
      lessons: streetLessonsFor("purani-sadak-temple"),
    },
    {
      id: "purani-sadak-bus",
      districtId: "purani-sadak",
      kind: "bus",
      pos: [-6, -79.5],
      title: "Bus ticket",
      brief: "Buy a ticket to Chandni Chowk. Name the stop and ask the fare.",
      reward: 220,
      interactLabel: "Buy bus ticket",
      name: "Suresh",
      role: "Bus Conductor",
      speaker: "shubh",
      colour: 0x5d6d7e,
      completionNote: "Ticket punched — next stop Chandni Chowk.",
      lessons: streetLessonsFor("purani-sadak-bus"),
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
      pos: [18, -6],
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
      pos: [-18, 8],
      title: "Masala dosa",
      brief: "Order a masala dosa and filter coffee at the tiffin stall.",
      reward: 180,
      interactLabel: "Order at tiffin stall",
      name: "Anbu",
      role: "Tiffin Master",
      speaker: "rohan",
      colour: 0x16a085,
      completionNote: "Crisp dosa and kaapi — Marina breakfast.",
      lessons: streetLessonsFor("marina-nagar-shop"),
    },
    {
      id: "marina-nagar-temple",
      districtId: "marina-nagar",
      kind: "temple",
      pos: [10, 79.5],
      title: "Coconut at the temple",
      brief: "Buy a coconut for archana at the shore temple stall.",
      reward: 200,
      interactLabel: "Buy prasad",
      name: "Iyer",
      role: "Temple Stall",
      speaker: "kavitha",
      colour: 0x8e44ad,
      completionNote: "Coconut and kumkum — ready for archana.",
      lessons: streetLessonsFor("marina-nagar-temple"),
    },
    {
      id: "marina-nagar-bus",
      districtId: "marina-nagar",
      kind: "bus",
      pos: [-8, -79.5],
      title: "Beach bus ticket",
      brief: "Get a ticket to Marina Beach on the city bus.",
      reward: 220,
      interactLabel: "Buy bus ticket",
      name: "Dass",
      role: "Conductor",
      speaker: "shubh",
      colour: 0x2980b9,
      completionNote: "Ticket to Marina Beach — keep it for checking.",
      lessons: streetLessonsFor("marina-nagar-bus"),
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
      pos: [22, -4],
      title: "Auto to Majestic",
      brief: "Negotiate with Shankar's auto to Majestic bus stand. Push back on the first quote.",
      reward: 250,
      interactLabel: "Stop the auto",
      name: "Shankar",
      role: "Auto Driver",
      speaker: "vijay",
      colour: 0x2980b9,
      completionNote: "Auto to Majestic — fare settled in Kannada.",
      lessons: streetLessonsFor("majestic-cross-auto"),
    },
    {
      id: "majestic-cross-shop",
      districtId: "majestic-cross",
      kind: "shop",
      pos: [-19, 6],
      title: "Idli and vada",
      brief: "Order two idlis and a vada at Girija's tiffin cart.",
      reward: 180,
      interactLabel: "Order tiffin",
      name: "Girija",
      role: "Tiffin Cart",
      speaker: "shruti",
      colour: 0x8e44ad,
      completionNote: "Hot idli-vada and chutney — classic Bengaluru.",
      lessons: streetLessonsFor("majestic-cross-shop"),
    },
    {
      id: "majestic-cross-temple",
      districtId: "majestic-cross",
      kind: "temple",
      pos: [5, 79.5],
      title: "Temple flowers",
      brief: "Buy jasmine garland at the temple entrance.",
      reward: 200,
      interactLabel: "Buy flowers",
      name: "Lakshmi",
      role: "Flower Seller",
      speaker: "ritu",
      colour: 0xe74c3c,
      completionNote: "Mallige garland for the deity.",
      lessons: streetLessonsFor("majestic-cross-temple"),
    },
    {
      id: "majestic-cross-bus",
      districtId: "majestic-cross",
      kind: "bus",
      pos: [-4, -79.5],
      title: "BMTC ticket",
      brief: "Buy a bus ticket to Shivajinagar at the Majestic stop.",
      reward: 220,
      interactLabel: "Buy bus ticket",
      name: "Rafi",
      role: "Conductor",
      speaker: "gokul",
      colour: 0x27ae60,
      completionNote: "BMTC ticket to Shivajinagar.",
      lessons: streetLessonsFor("majestic-cross-bus"),
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
      pos: [19, -5],
      title: "Auto to Howrah",
      brief: "Tell Bikash-da you need Howrah station and agree a fair fare.",
      reward: 250,
      interactLabel: "Hail the auto",
      name: "Bikash-da",
      role: "Auto Driver",
      speaker: "soham",
      colour: 0xf4d03f,
      completionNote: "Howrah-bound — fare settled.",
      lessons: streetLessonsFor("park-gully-auto"),
    },
    {
      id: "park-gully-shop",
      districtId: "park-gully",
      kind: "shop",
      pos: [-17, 7],
      title: "Singara and kachori",
      brief: "Order singara and kachori from Mitali's shop corner.",
      reward: 180,
      interactLabel: "Order snacks",
      name: "Mitali",
      role: "Snack Shop",
      speaker: "ishita",
      colour: 0xc0392b,
      completionNote: "Singara-kachori and cha — para snack.",
      lessons: streetLessonsFor("park-gully-shop"),
    },
    {
      id: "park-gully-temple",
      districtId: "park-gully",
      kind: "temple",
      pos: [7, 79.5],
      title: "Prasad at the mandir",
      brief: "Buy prasad packet at the Kali temple gate.",
      reward: 200,
      interactLabel: "Buy prasad",
      name: "Paritosh",
      role: "Temple Stall",
      speaker: "ashutosh",
      colour: 0x7f8c8d,
      completionNote: "Prasad in hand — join the queue.",
      lessons: streetLessonsFor("park-gully-temple"),
    },
    {
      id: "park-gully-bus",
      districtId: "park-gully",
      kind: "bus",
      pos: [-5, -79.5],
      title: "Tram ticket",
      brief: "Buy a tram ticket to Esplanade at the stop.",
      reward: 220,
      interactLabel: "Buy tram ticket",
      name: "Nazrul",
      role: "Ticket Seller",
      speaker: "soham",
      colour: 0x16a085,
      completionNote: "Tram ticket to Esplanade — validate before boarding.",
      lessons: streetLessonsFor("park-gully-bus"),
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
