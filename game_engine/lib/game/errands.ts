/**
 * THE LANGUAGE-TASK BIBLE
 *
 * The job-to-be-done is not "play a game", it is: complete a real Indian errand
 * end to end without switching to English. That is what turns a world into a
 * product — there is a task, it succeeds or fails on evidence, and it leaves an
 * artifact behind.
 *
 * Each errand states the outcome in terms of a real-world result (a fare
 * agreed, an order placed, a complaint lodged), never "the conversation went
 * well". The model grades against that outcome, and the phrases the player
 * actually used are recorded so they can be revised later.
 */

import type { LangCode } from "@/lib/sarvam";

export type ErrandId =
  | "auto_fare"
  | "chai_order"
  | "chemist_medicine"
  | "sabzi_haggle"
  | "address_directions"
  | "lost_bag";

/** A phrase the errand is designed to teach, tracked per player. */
export type TargetPhrase = {
  native: string;
  roman: string;
  en: string;
  /** Why this phrase, not a synonym: the thing it unlocks. */
  usedFor: string;
};

export type Errand = {
  id: ErrandId;
  /** Shown as the mission title. */
  title: string;
  /** The NPC who owns this errand. */
  npcId: string;
  district: string;
  language: LangCode;

  /** One line the player sees before starting. */
  brief: string;

  /**
   * The NPC as they behave DURING this errand. Deliberately separate from the
   * district bible's persona: there, Raju's auto has been stolen; here he is
   * driving it. Reusing the story persona made him grieve mid-negotiation.
   */
  persona: string;

  /**
   * The real-world outcome. This is the JTBD test: it is either achieved or it
   * is not, and it is checkable without judging conversational vibes.
   */
  outcome: string;

  /**
   * Concrete, checkable sub-goals. All must be true to complete the errand.
   * Written so a model can answer yes/no against the transcript.
   */
  checks: string[];

  /** What the player walks away able to say. */
  teaches: TargetPhrase[];

  /** The thing that makes it hard, and hard in an Indian-language-specific way. */
  difficulty: string;

  reward: number;
};

export const ERRANDS: Errand[] = [
  {
    id: "auto_fare",
    title: "Agree a fare",
    npcId: "raju",
    district: "purani-sadak",
    language: "hi-IN",
    brief:
      "Raju will quote you a tourist price. Get to 150 rupees or less, in Hindi, without walking away.",
    persona: `You are Raju Bhai, an auto driver at the stand outside the station road. Twenty years on these streets. You size up every passenger in one glance and quote foreigners and outsiders double. You are never nasty about it, you enjoy the game: you sigh about petrol, you invoke your children, you name a number and wait. You open at 300 to the railway station. The fair price is 120. You come down in steps when pushed, and you respect anyone who pushes. You cave at 150 and say so plainly.`,
    outcome:
      "An agreed fare of 150 rupees or less to the railway station, stated out loud by Raju.",
    checks: [
      "The player asked the price in Hindi rather than English.",
      "The player pushed back on the first quote instead of accepting it.",
      "Raju verbally agreed to a number at or below 150.",
    ],
    teaches: [
      {
        native: "कितने का है?",
        roman: "Kitne ka hai?",
        en: "How much is it?",
        usedFor: "Opening any negotiation, anywhere in North India.",
      },
      {
        native: "बहुत महंगा है",
        roman: "Bahut mehenga hai",
        en: "That is too expensive",
        usedFor: "The single most useful pushback phrase there is.",
      },
      {
        native: "डेढ़ सौ में चलोगे?",
        roman: "Dedh sau mein chaloge?",
        en: "Will you go for 150?",
        usedFor: "Naming your price. 'Dedh sau' = 150, a number tourists never learn.",
      },
    ],
    difficulty:
      "Indian numbers are the trap. 'Dedh' (1.5x100), 'dhai' (2.5x100) and 'sawa' (1.25x) have no English equivalent, and Raju uses them deliberately.",
    reward: 250,
  },
  {
    id: "chai_order",
    title: "Order cutting chai",
    npcId: "kumar",
    district: "purani-sadak",
    language: "hi-IN",
    brief:
      "Order one cutting chai, less sugar, and pay. Ask for 'tea' and Kumar will mock you.",
    persona: `You run the chai stall by the bus stand. Fast, funny, permanently mid-pour, three glasses going at once. You answer in clipped half-sentences and often reply with a question. You gently mock anyone who says "tea" instead of chai. A cutting is 10 rupees, a full glass 15. You warm up instantly to anyone who orders properly.`,
    outcome: "A cutting chai ordered with a sugar preference stated, and paid for.",
    checks: [
      "The player used the word chai, not tea.",
      "The player specified a sugar preference (kam meethi / cheeni kam / bina cheeni).",
      "The player asked what it cost or handed over money.",
    ],
    teaches: [
      {
        native: "एक कटिंग चाय देना",
        roman: "Ek cutting chai dena",
        en: "One half-cup of chai, please",
        usedFor: "'Cutting' means half a glass. Ordering a full one marks you out.",
      },
      {
        native: "चीनी कम",
        roman: "Cheeni kam",
        en: "Less sugar",
        usedFor: "Two words that work at every stall in the country.",
      },
      {
        native: "कितने पैसे हुए?",
        roman: "Kitne paise hue?",
        en: "What do I owe you?",
        usedFor: "Closing any small transaction.",
      },
    ],
    difficulty:
      "Kumar speaks fast, clips his words, and answers a question with a question. Following him is the skill.",
    reward: 150,
  },
  {
    id: "chemist_medicine",
    title: "Buy medicine for a fever",
    npcId: "lakshmi",
    district: "purani-sadak",
    language: "hi-IN",
    brief:
      "Describe a fever and a headache, and buy what the chemist offers. Do not ask her to diagnose you.",
    persona: `You run the small medical shop on the corner. Brisk, competent, slightly impatient because there is a queue. You ask what the symptom is, you hand over paracetamol, and you state the dosage fast: "din mein do baar, khaane ke baad". If the customer does not repeat it back, you say it again more slowly, because you have seen what happens when people guess. You never diagnose anything serious; for that you send them to the doctor.`,
    outcome: "A specific medicine bought, with the dosage understood and repeated back correctly.",
    checks: [
      "The player described a symptom in Hindi (bukhar, sir dard).",
      "The player asked how to take it (kitni baar / kab lena hai).",
      "The player repeated the dosage back, showing they understood it.",
    ],
    teaches: [
      {
        native: "मुझे बुखार है",
        roman: "Mujhe bukhaar hai",
        en: "I have a fever",
        usedFor: "The sentence you need most and panic about most.",
      },
      {
        native: "दिन में कितनी बार?",
        roman: "Din mein kitni baar?",
        en: "How many times a day?",
        usedFor: "Dosage. Getting this wrong actually matters.",
      },
      {
        native: "खाने के बाद",
        roman: "Khaane ke baad",
        en: "After food",
        usedFor: "The answer you will hear, so you must recognise it.",
      },
    ],
    difficulty:
      "Numbers and times come back at you fast, and you must repeat them correctly or she makes you say it again.",
    reward: 300,
  },
  {
    id: "sabzi_haggle",
    title: "Buy a kilo of tomatoes",
    npcId: "vendor",
    district: "purani-sadak",
    language: "hi-IN",
    brief: "Buy one kilo of tomatoes at a fair price. Check the weight.",
    persona: `You sell vegetables from a thela on the market lane. Loud, cheerful, a little bit crooked. Tomatoes are 60 a kilo and you open at 80. Your weighing is generous to yourself unless the customer watches. You enjoy a customer who argues and you drop the price for one who makes you laugh.`,
    outcome: "One kilo bought at a price the player negotiated down from the first quote.",
    checks: [
      "The player asked for a specific quantity using kilo or aadha kilo.",
      "The player challenged either the price or the weight.",
      "A final price was agreed and stated.",
    ],
    teaches: [
      {
        native: "एक किलो टमाटर",
        roman: "Ek kilo tamatar",
        en: "One kilo of tomatoes",
        usedFor: "Quantity plus item: the core shape of every market sentence.",
      },
      {
        native: "थोड़ा कम कीजिए",
        roman: "Thoda kam kijiye",
        en: "Make it a bit less",
        usedFor: "Polite haggling. Rudeness gets you a worse price.",
      },
      {
        native: "तौल के दिखाइए",
        roman: "Taul ke dikhaiye",
        en: "Weigh it in front of me",
        usedFor: "The phrase that stops you being short-changed.",
      },
    ],
    difficulty:
      "The vendor quotes per kilo but weighs short. Catching it requires listening to the number, not just the tone.",
    reward: 200,
  },
  {
    id: "address_directions",
    title: "Find the address",
    npcId: "havaldar",
    district: "purani-sadak",
    language: "hi-IN",
    brief:
      "You are lost. Get directions to Chandni Chowk and repeat them back so you actually remember.",
    persona: `You are Havaldar Singh, a constable at the chowk, bored and hot. You give directions in a rapid chain of landmarks locals know and outsiders do not: "seedhe jaiye, laal masjid ke baad baayen, phir Gupta sweets se right". You do not slow down unless you are asked to. You are not unkind, just brisk.`,
    outcome: "Directions obtained and repeated back correctly, including at least one landmark.",
    checks: [
      "The player asked for directions in Hindi.",
      "The player repeated at least one turn or landmark back.",
      "The player confirmed the distance or time.",
    ],
    teaches: [
      {
        native: "यह कहाँ है?",
        roman: "Yeh kahaan hai?",
        en: "Where is this?",
        usedFor: "Opening. Works with a written address held up.",
      },
      {
        native: "सीधे जाइए, फिर बाएँ",
        roman: "Seedhe jaiye, phir baayen",
        en: "Go straight, then left",
        usedFor: "You must RECOGNISE this, not just say it.",
      },
      {
        native: "कितनी दूर है?",
        roman: "Kitni door hai?",
        en: "How far is it?",
        usedFor: "Deciding whether to walk or take an auto.",
      },
    ],
    difficulty:
      "Directions come as a rapid chain with landmarks you do not know. You have to interrupt and ask him to slow down.",
    reward: 250,
  },
  {
    id: "lost_bag",
    title: "Report a lost bag",
    npcId: "havaldar",
    district: "purani-sadak",
    language: "hi-IN",
    brief:
      "Report your bag missing. Describe it, say where you lost it, and get a complaint number.",
    persona: `You are Havaldar Singh at the chowki desk. You have heard a hundred lost-bag stories today and you assume this is another one. You deflect first: ask where exactly, ask when exactly, ask what was inside. Only when the person is specific and persistent do you write it up and give a complaint number. You are procedural, not corrupt.`,
    outcome: "A complaint lodged with a description, a location, and a reference number given back.",
    checks: [
      "The player described the bag (colour or contents).",
      "The player said where and roughly when it went missing.",
      "The player received and repeated a complaint number.",
    ],
    teaches: [
      {
        native: "मेरा बैग खो गया है",
        roman: "Mera bag kho gaya hai",
        en: "My bag is lost",
        usedFor: "Reporting anything missing.",
      },
      {
        native: "उसमें पासपोर्ट था",
        roman: "Usmein passport tha",
        en: "My passport was in it",
        usedFor: "Raising urgency. Changes how you are treated.",
      },
      {
        native: "शिकायत नंबर मिल सकता है?",
        roman: "Shikayat number mil sakta hai?",
        en: "Can I get a complaint number?",
        usedFor: "The artifact. Without it nothing was actually filed.",
      },
    ],
    difficulty:
      "Havaldar is bored and deflects. You have to be specific and persistent, in a second language, under mild hostility.",
    reward: 350,
  },
];

export function errandById(id: ErrandId): Errand | undefined {
  return ERRANDS.find((e) => e.id === id);
}

export function errandsForNpc(npcId: string): Errand[] {
  return ERRANDS.filter((e) => e.npcId === npcId);
}

/* ------------------------------------------------------------------ *
 * The artifact
 * ------------------------------------------------------------------ */

/** Recorded for each phrase the player actually produced. */
export type PhraseUse = {
  phrase: string;
  /** Did they say it unprompted, or only after the NPC modelled it? */
  prompted: boolean;
  at: string;
};

/**
 * What the player leaves with. This is the usable output: not a score, but a
 * record of the errand they completed and the language they genuinely used,
 * which is revisable afterwards.
 */
export type ErrandReceipt = {
  errandId: ErrandId;
  ref: string;
  completedAt: string;
  outcomeAchieved: boolean;
  /** Which checks passed, in order. */
  checksPassed: boolean[];
  /** Target phrases the player actually produced. */
  phrasesUsed: PhraseUse[];
  /** Target phrases they never managed, i.e. what to revise. */
  phrasesMissed: string[];
  /** Times the player fell back to English. Lower is better. */
  englishFallbacks: number;
  turns: number;
  transcript: Array<{ who: "player" | "npc"; text: string }>;
};
