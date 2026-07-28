import type { LangCode } from "@/lib/sarvam";

/**
 * THE GAME BIBLE
 *
 * One idea, four cities: in every district a vehicle has been stolen, and the
 * only way to recover it is to talk to people who don't speak your language.
 *
 * Each district is a self-contained arc, three witnesses, each holding one
 * clue, then a gated confrontation that only unlocks once you hold all three.
 * NPC positions are offsets from the centre of the chowk, not world coords.
 */

export type Theme = {
  /** Five sky gradient stops, zenith → horizon. */
  sky: [string, string, string, string, string];
  fog: number;
  fogNear: number;
  ground: number;
  pavement: number;
  plaza: number;
  tarmac: number;
  lane: number;
  buildings: number[];
  canopies: [number, number, number];
  leaf: number;
  trunk: number;
  sunColour: number;
  sunIntensity: number;
  ambient: number;
  hemiSky: number;
  hemiGround: number;
  /**
   * Moving traffic, per vehicle class. These are deliberately low: the road
   * grid is only so long, and a lane packed bumper-to-bumper reads as a car
   * park, not a street. Traffic is spaced out into lane slots by the engine,
   * so raising these past roughly a dozen just tightens the gaps.
   */
  autos: number;
  cars: number;
  /** Canopy colour of the auto-rickshaws in this city. */
  autoCanopy: number;
  exposure: number;
  /** District-specific street furniture, so the cities do not read alike. */
  landmark: "delhi" | "chennai" | "bengaluru" | "kolkata";
};

export type Mission = {
  title: string;
  brief: string;
  /** The model grades itself against this each turn. */
  successCriteria: string;
  reward: number;
};

export type Npc = {
  id: string;
  name: string;
  role: string;
  speaker: string;
  colour: number;
  /** Offset from the chowk centre, in world units. */
  pos: [number, number];
  persona: string;
  mission: Mission;
  /** What the player learns when the mission passes. */
  clue: string;
  /** Number of clues needed before this NPC will engage. */
  requiresClues?: number;
  /** What makes this character call the cops on you. Feeds the wanted level. */
  provokes: string;
  /** The language drill for this NPC: 3-4 lines, easiest first. */
  lesson: LessonStep[];
};

/** A line the player can actually use, for the phrasebook. */
export type Phrase = { native: string; roman: string; en: string };

/**
 * One line of speech: native script (spoken by TTS / matched against STT),
 * roman transliteration (what the player actually reads on screen — the
 * script is always Latin, the words are the target language), and an English
 * gloss. `native` and `roman` must be word-aligned: word N of one is word N
 * of the other, so a per-word verdict on the native line can be painted onto
 * the roman line the player is looking at.
 */
export type LessonLine = { native: string; roman: string; en: string };

export type LessonStep = {
  /** Scripted, not model-generated: the target phrase has to be exact to grade it. */
  npc: LessonLine;
  /** Omitted for an interruption: an off-script beat the player just has to roll with. */
  prompt?: LessonLine;
  interruption?: boolean;
};

export type District = {
  id: string;
  name: string;
  city: string;
  blurb: string;
  language: LangCode;
  languageLabel: string;
  native: string;
  /** Named explicitly: the model otherwise drifts into romanised Latin. */
  script: string;
  /** The stolen vehicle at the heart of the arc. */
  premise: string;
  /** Cover art on the district picker (path under /public). */
  coverImage: string;
  theme: Theme;
  /** Survival phrases, shown in-game so a non-speaker can actually play. */
  phrases: Phrase[];
  npcs: Npc[];
  finale: { title: string; text: string };
};

/**
 * A safe fallback lesson built entirely from a district's own vetted
 * phrasebook (no new translations invented): the NPC's opening is one
 * phrase, the player's reply is another. Used where a district hasn't had a
 * hand-authored, NPC-specific lesson written yet.
 */
function phrasebookLesson(phrases: Phrase[]): LessonStep[] {
  const pairs: [number, number][] = [
    [0, 1],
    [2, 3],
    [4, 5],
  ];
  return pairs.map(([a, b]) => ({
    npc: { native: phrases[a].native, roman: phrases[a].roman, en: phrases[a].en },
    prompt: { native: phrases[b].native, roman: phrases[b].roman, en: phrases[b].en },
  }));
}

/* ------------------------------------------------------------------ *
 * 1. PURANI SADAK, Delhi, Hindi, golden hour
 * ------------------------------------------------------------------ */

const puraniSadak: District = {
  id: "purani-sadak",
  name: "Purani Sadak",
  city: "Old Delhi",
  blurb: "Dust, gold light, and an auto that isn't where it was left.",
  coverImage: "/covers/purani-sadak.png",
  language: "hi-IN",
  languageLabel: "Hindi",
  native: "हिन्दी",
  script: "Devanagari",
  premise: `Raju Bhai's auto-rickshaw, his only asset, bought on a loan he has
not finished paying, was taken from outside the chai stall before dawn. Three
people on this street saw a piece of what happened. None of them will simply
tell you.`,
  theme: {
    sky: ["#1b3b5a", "#4a7fa0", "#c98b4b", "#e8a04f", "#f0c07a"],
    fog: 0xd9a066,
    fogNear: 60,
    ground: 0x9c8f77,
    pavement: 0xb9ae97,
    plaza: 0xc2b49a,
    tarmac: 0x33363b,
    lane: 0xd6c98a,
    buildings: [0xd9c8a9, 0xc9a227, 0xb5651d, 0xa8c3a0, 0xd68f8f, 0xe8d6b3, 0xcfa27b],
    canopies: [0xe74c3c, 0x27ae60, 0xe67e22],
    leaf: 0x2f6b34,
    trunk: 0x5b4632,
    sunColour: 0xffcf94,
    sunIntensity: 1.35,
    ambient: 0.62,
    hemiSky: 0xbfd8ef,
    hemiGround: 0xb08040,
    autos: 9,
    cars: 6,
    autoCanopy: 0xf5c518,
    exposure: 1.12,
    landmark: "delhi",
  },
  phrases: [
    { native: "नमस्ते", roman: "Namaste", en: "Hello" },
    { native: "कितने का है?", roman: "Kitne ka hai?", en: "How much is it?" },
    { native: "बहुत महंगा है", roman: "Bahut mehenga hai", en: "That is too expensive" },
    { native: "एक कटिंग चाय देना", roman: "Ek cutting chai dena", en: "One cutting chai, please" },
    { native: "मुझे मदद चाहिए", roman: "Mujhe madad chahiye", en: "I need help" },
    { native: "माफ़ कीजिए", roman: "Maaf kijiye", en: "I am sorry" },
  ],
  npcs: [
    {
      id: "raju",
      name: "Raju Bhai",
      role: "Auto Driver",
      speaker: "aditya",
      colour: 0xf4d03f,
      pos: [-8, -6],
      provokes: "Being rushed, mocked for his loan, or told the auto is not worth chasing.",
      persona: `You are Raju Bhai, an auto driver whose auto was stolen this
morning. You are distraught and talking too fast, you keep circling back to the
loan instalment due on Friday. You are not thinking straight and you interrupt
yourself. If the player is brisk or impatient you get more agitated and give
nothing. If the player calms you down or shows genuine sympathy, you steady
yourself and remember the details: a green-and-yellow auto, number DL-1RN-4412,
parked outside Kumar's chai stall since 4am.`,
      mission: {
        title: "Saans Le, Bhai",
        brief: "Calm Raju down enough that he can describe the stolen auto.",
        successCriteria:
          "The player showed patience or sympathy rather than rushing him, and Raju has given the auto's colour and number plate.",
        reward: 200,
      },
      clue: "Green-and-yellow auto, DL-1RN-4412, taken from outside the chai stall before dawn.",
      lesson: [
        {
          npc: { native: "नमस्ते! क्या हुआ?", roman: "Namaste! Kya hua?", en: "Hello! What happened?" },
          prompt: { native: "आप ठीक हैं?", roman: "Aap theek hain?", en: "Are you okay?" },
        },
        {
          npc: { native: "अरे, वो कुत्ता भाग गया!", roman: "Arre, wo kutta bhaag gaya!", en: "Hey, that dog ran off!" },
          interruption: true,
        },
        {
          npc: { native: "मेरा ऑटो चोरी हो गया!", roman: "Mera auto chori ho gaya!", en: "My auto got stolen!" },
          prompt: { native: "धीरे बोलिए, सब बताइए", roman: "Dheere boliye, sab bataiye", en: "Speak slowly, tell me everything" },
        },
        {
          npc: { native: "ऑटो हरा-पीला था, नंबर याद नहीं", roman: "Auto hara-peela tha, number yaad nahin", en: "The auto was green-yellow, I don't remember the number" },
          prompt: { native: "कोई बात नहीं, आराम से याद कीजिए", roman: "Koi baat nahin, aaraam se yaad kijiye", en: "No worries, remember it calmly" },
        },
      ],
    },
    {
      id: "kumar",
      name: "Kumar",
      role: "Chai Wallah",
      speaker: "rohan",
      colour: 0x27ae60,
      pos: [10, -12],
      provokes: "Being called a witness, asking for 'tea', or implying he is hiding something.",
      persona: `You run the chai stall the auto was parked outside. You open at
4am so you saw the whole thing, but you are wary of getting involved with police
matters and you are permanently busy. You mock anyone who asks for "tea" instead
of chai. You will not talk to someone who hasn't bought anything, but once the
player orders properly and treats you like a person rather than a witness, you
lean in: a man in a red helmet took it around 5am and went towards the flower
market.`,
      mission: {
        title: "Cutting Chai",
        brief: "Order a cutting chai properly, then get Kumar to talk.",
        successCriteria:
          "The player ordered chai politely (not 'tea') and treated Kumar as a person, and Kumar has revealed the red helmet and the direction the thief went.",
        reward: 200,
      },
      clue: "A man in a red helmet drove it towards the flower market around 5am.",
      lesson: [
        {
          npc: { native: "क्या चाहिए?", roman: "Kya chahiye?", en: "What do you need?" },
          prompt: { native: "एक कटिंग चाय दीजिए", roman: "Ek cutting chai dijiye", en: "One cutting chai, please" },
        },
        {
          npc: { native: "ठीक है, बैठिए", roman: "Theek hai, baithiye", en: "Okay, sit down" },
          prompt: { native: "धन्यवाद, आपने ऑटो देखा?", roman: "Dhanyavaad, aapne auto dekha?", en: "Thank you, did you see the auto?" },
        },
        {
          npc: { native: "हाँ, लाल हेलमेट वाला आदमी था", roman: "Haan, laal helmet waala aadmi tha", en: "Yes, it was a man in a red helmet" },
          prompt: { native: "वो किधर गया, बता सकते हैं?", roman: "Wo kidhar gaya, bata sakte hain?", en: "Where did he go, can you tell me?" },
        },
      ],
    },
    {
      id: "lakshmi",
      name: "Lakshmi Amma",
      role: "Flower Seller",
      speaker: "ritu",
      colour: 0xe74c3c,
      pos: [-14, 11],
      provokes: "Rudeness, refusing to answer her, or insulting her family or her flowers.",
      persona: `You have sold flowers on this corner for thirty years and you
know every face on the street. You are warm, motherly and incurably nosy, you
want to know where the player is from, whether they have eaten, and why they are
not married. You will not give up information to a stranger, but the moment the
player answers one of your personal questions properly you treat them as family
and tell them everything: the red helmet belongs to Bunty, who parks behind the
old cinema.`,
      mission: {
        title: "Amma Knows Everyone",
        brief: "Answer Amma's nosy question honestly, and she'll name the thief.",
        successCriteria:
          "The player answered a personal question about themselves properly rather than deflecting, and Lakshmi has named Bunty and the cinema.",
        reward: 200,
      },
      clue: "The red helmet is Bunty. He parks behind the old cinema.",
      lesson: [
        {
          npc: { native: "बेटा, कहाँ से हो?", roman: "Beta, kahaan se ho?", en: "Child, where are you from?" },
          prompt: { native: "मैं दिल्ली से हूँ", roman: "Main Dilli se hoon", en: "I am from Delhi" },
        },
        {
          npc: { native: "खाना खाया या नहीं?", roman: "Khaana khaya ya nahin?", en: "Have you eaten or not?" },
          prompt: { native: "हाँ खाया, आप बताइए बंटी के बारे में", roman: "Haan khaya, aap bataiye Bunty ke baare mein", en: "Yes I ate, please tell me about Bunty" },
        },
        {
          npc: { native: "अच्छा बच्चे हो, सुनो", roman: "Achha bachche ho, suno", en: "You're a good kid, listen" },
          prompt: { native: "कृपया धीरे-धीरे बताइए, मैं समझ जाऊँगा", roman: "Kripya dheere-dheere bataiye, main samajh jaunga", en: "Please tell slowly, I will understand" },
        },
      ],
    },
    {
      id: "havaldar",
      name: "Havaldar Singh",
      role: "Traffic Constable",
      speaker: "shubh",
      colour: 0x5d6d7e,
      pos: [13, 13],
      provokes: "Any offer of money or hint of a bribe. This enrages him instantly.",
      persona: `You are a traffic constable at the chowk: stern, theatrical and
deeply bored. You have heard a hundred stolen-vehicle stories and you assume
this is another time-waster. You are NOT corrupt, if the player offers money or
hints at a bribe, you become genuinely angry and throw them out. What moves you
is a specific, evidenced case: a number plate, a name, and a location, delivered
plainly. Given all three you drop the act, radio it in, and recover the auto.`,
      mission: {
        title: "No Chalan Today",
        brief: "Lay out the plate, the name and the location. Do NOT offer a bribe.",
        successCriteria:
          "The player presented the number plate, the name Bunty, and the cinema location, and did NOT offer any bribe or money. Havaldar has agreed to act.",
        reward: 400,
      },
      clue: "The auto is recovered behind the old cinema. Raju gets it back before Friday.",
      requiresClues: 3,
      lesson: [
        {
          npc: { native: "क्या समस्या है?", roman: "Kya samasya hai?", en: "What's the problem?" },
          prompt: { native: "मेरा ऑटो चोरी हुआ है", roman: "Mera auto chori hua hai", en: "My auto has been stolen" },
        },
        {
          npc: { native: "नंबर प्लेट बताओ", roman: "Number plate batao", en: "Tell me the number plate" },
          prompt: { native: "बंटी का नाम, पुराना सिनेमा जगह", roman: "Bunty ka naam, purana cinema jagah", en: "Bunty's name, old cinema location" },
        },
        {
          npc: { native: "ठीक है, मैं देखता हूँ", roman: "Theek hai, main dekhta hoon", en: "Okay, I will look into it" },
          prompt: { native: "कृपया जल्दी मदद कीजिए, धन्यवाद", roman: "Kripya jaldi madad kijiye, dhanyavaad", en: "Please help quickly, thank you" },
        },
      ],
    },
  ],
  finale: {
    title: "AUTO RECOVERED",
    text: "Bunty is picked up behind the cinema by evening. Raju makes Friday's instalment. He will not let you pay for a ride on this street again.",
  },
};

/* ------------------------------------------------------------------ *
 * 2. MARINA NAGAR, Chennai, Tamil, hard coastal light
 * ------------------------------------------------------------------ */

const marinaPhrases: Phrase[] = [
  { native: "வணக்கம்", roman: "Vanakkam", en: "Hello" },
  { native: "எவ்வளவு?", roman: "Evvalavu?", en: "How much?" },
  { native: "எனக்கு உதவி வேண்டும்", roman: "Enakku udhavi vendum", en: "I need help" },
  { native: "புரியவில்லை", roman: "Puriyavillai", en: "I do not understand" },
  { native: "மெதுவாக சொல்லுங்க", roman: "Meduvaa sollunga", en: "Please say it slowly" },
  { native: "நன்றி", roman: "Nandri", en: "Thank you" },
];

const marinaNagar: District = {
  id: "marina-nagar",
  name: "Marina Nagar",
  city: "Chennai",
  blurb: "Salt air, white light, and a fish tempo gone from the shore road.",
  coverImage: "/covers/marina-nagar.png",
  language: "ta-IN",
  languageLabel: "Tamil",
  native: "தமிழ்",
  script: "Tamil",
  premise: `Selvi Akka's tempo van, the one that carries the morning catch to
market, vanished from the shore road while the boats were coming in. Without it
the catch rots by noon. Three people saw fragments. The sea is loud and nobody
wants to be the one who spoke.`,
  theme: {
    sky: ["#0d4f7c", "#2e86c1", "#7fb8d8", "#cfe3ef", "#f4ecd8"],
    fog: 0xd5e2e8,
    fogNear: 80,
    ground: 0xd8c9a3,
    pavement: 0xcfc3a8,
    plaza: 0xdccfb0,
    tarmac: 0x3a3d42,
    lane: 0xf0ead6,
    buildings: [0xf2f0e6, 0xa8d0d8, 0xe8b4a0, 0xf5d76e, 0xc8dcc0, 0xe0e4e8, 0xd9a8b8],
    canopies: [0x2980b9, 0xf1c40f, 0x16a085],
    leaf: 0x3d7a42,
    trunk: 0x6b5340,
    sunColour: 0xfff4dc,
    sunIntensity: 1.55,
    ambient: 0.72,
    hemiSky: 0xd6ecf7,
    hemiGround: 0xc9b48a,
    autos: 7,
    cars: 7,
    autoCanopy: 0xf5c518,
    exposure: 1.2,
    landmark: "chennai",
  },
  phrases: marinaPhrases,
  npcs: [
    {
      id: "selvi",
      name: "Selvi Akka",
      role: "Fish Seller",
      speaker: "kavitha",
      colour: 0x16a085,
      pos: [-9, -7],
      provokes: "Flattery, condescension, or suggesting she was careless with her own van.",
      persona: `You sell fish at the shore market and your tempo van is gone.
You are furious rather than sad, and your fury is aimed at everyone including
the player. You are sharp-tongued and you test people, you assume anyone asking
questions is a journalist or an insurance man. If the player matches your bluntness
honestly instead of being sugary, you respect it and give the details: a blue
Ashok Leyland tempo, TN-09-BK-2231, loaded with the morning ice.`,
      mission: {
        title: "The Catch Won't Wait",
        brief: "Match Selvi's bluntness and get the tempo's description.",
        successCriteria:
          "The player was direct and honest rather than flattering, and Selvi has given the tempo's colour and number plate.",
        reward: 200,
      },
      clue: "Blue tempo, TN-09-BK-2231, still loaded with the morning ice.",
      lesson: phrasebookLesson(marinaPhrases),
    },
    {
      id: "anbu",
      name: "Anbu",
      role: "Bajji Vendor",
      speaker: "tarun",
      colour: 0xe67e22,
      pos: [11, -11],
      provokes: "Being cut off mid-story, or being told his chatter is wasting time.",
      persona: `You fry bajjis on the beach road and you talk constantly, about
cricket, about the weather, about your brother in Dubai. You saw the tempo leave
but you bury it under chatter and will not get to the point unless the player
actually engages with your digressions. Rush you and you just start a new story.
Play along once and you deliver it: it went north towards the harbour gate, and
the driver was not Selvi's usual boy.`,
      mission: {
        title: "Let Him Finish",
        brief: "Humour Anbu's rambling, and he'll get to what he saw.",
        successCriteria:
          "The player engaged with Anbu's tangent instead of pushing him, and Anbu has said the tempo went north to the harbour gate with an unfamiliar driver.",
        reward: 200,
      },
      clue: "The tempo went north to the harbour gate. The driver was a stranger.",
      lesson: phrasebookLesson(marinaPhrases),
    },
    {
      id: "iyer",
      name: "Iyer Sir",
      role: "Temple Priest",
      speaker: "anand",
      colour: 0xf4d03f,
      pos: [-13, 12],
      provokes: "Threats of revenge, or disrespect towards the temple.",
      persona: `You are the priest at the small shore temple. You are gentle,
unhurried and speak in proverbs. You know who took the tempo because he came to
you afterwards, and you are bound by that. You will not name him to someone
seeking revenge, but if the player convinces you their aim is to get Selvi's
livelihood back rather than to punish anyone, you tell them: Dass, the boat
owner, took it, and it is behind the ice factory.`,
      mission: {
        title: "Not For Revenge",
        brief: "Convince Iyer you want the tempo back, not punishment.",
        successCriteria:
          "The player made clear their goal is recovering Selvi's livelihood rather than revenge, and Iyer has named Dass and the ice factory.",
        reward: 200,
      },
      clue: "Dass the boat owner took it. It is parked behind the ice factory.",
      requiresClues: 2,
      lesson: phrasebookLesson(marinaPhrases),
    },
    {
      id: "dass",
      name: "Dass",
      role: "Boat Owner",
      speaker: "vijay",
      colour: 0x8e44ad,
      pos: [14, 12],
      provokes: "Being called a thief outright before his debt is acknowledged.",
      persona: `You are a boat owner who took Selvi's tempo. You are not a
career thief, Selvi's late husband owed you for a season of diesel and you
decided to collect it yourself. You are defensive and proud, and you will deny
everything to anyone who accuses you outright. If the player shows they
understand you were owed, and offers a way to settle it that isn't theft, you
relent and return the tempo. Accusation hardens you; acknowledgement moves you.`,
      mission: {
        title: "The Diesel Debt",
        brief: "Get Dass to return the tempo, accusing him will only harden him.",
        successCriteria:
          "The player acknowledged Dass was genuinely owed money rather than only accusing him, and Dass has agreed to return the tempo.",
        reward: 400,
      },
      clue: "Dass returns the tempo. The debt goes to the panchayat instead.",
      requiresClues: 3,
      lesson: phrasebookLesson(marinaPhrases),
    },
  ],
  finale: {
    title: "TEMPO RETURNED",
    text: "The catch reaches the market by eleven. The diesel debt goes to the panchayat, where it should have gone a year ago. Selvi still doesn't thank you, but she sends fish.",
  },
};

/* ------------------------------------------------------------------ *
 * 3. MAJESTIC CROSS, Bengaluru, Kannada, monsoon overcast
 * ------------------------------------------------------------------ */

const majesticPhrases: Phrase[] = [
  { native: "ನಮಸ್ಕಾರ", roman: "Namaskara", en: "Hello" },
  { native: "ಎಷ್ಟು?", roman: "Eshtu?", en: "How much?" },
  { native: "ಸ್ವಲ್ಪ ಸಹಾಯ ಮಾಡಿ", roman: "Swalpa sahaya maadi", en: "Please help me a little" },
  { native: "ಗೊತ್ತಿಲ್ಲ", roman: "Gottilla", en: "I do not know" },
  { native: "ನಿಧಾನವಾಗಿ ಹೇಳಿ", roman: "Nidhaanavaagi heli", en: "Please say it slowly" },
  { native: "ಧನ್ಯವಾದ", roman: "Dhanyavaada", en: "Thank you" },
];

const majesticCross: District = {
  id: "majestic-cross",
  name: "Majestic Cross",
  city: "Bengaluru",
  blurb: "Wet tarmac, grey light, and a delivery scooter that never came back.",
  coverImage: "/covers/majestic-cross.png",
  language: "kn-IN",
  languageLabel: "Kannada",
  native: "ಕನ್ನಡ",
  script: "Kannada",
  premise: `Manju delivers food on a scooter that is rented by the hour and
insured by nobody. It went missing during the evening rain, with the day's cash
bag still under the seat. He has eleven hours before the rental company calls it
theft and puts it on him.`,
  theme: {
    sky: ["#39414d", "#5a6672", "#828c96", "#a8b2ba", "#c4ccd2"],
    fog: 0x9aa3ab,
    fogNear: 45,
    ground: 0x6f7468,
    pavement: 0x8d8f86,
    plaza: 0x969a90,
    tarmac: 0x24272b,
    lane: 0xb8bcc0,
    buildings: [0x8d9a94, 0xa89f8c, 0x7f8c99, 0xb0a89a, 0x94a08a, 0xa0968e, 0x86928c],
    canopies: [0x2c3e50, 0x7f8c8d, 0x34495e],
    leaf: 0x2a5c30,
    trunk: 0x4a3a2e,
    sunColour: 0xd8e0e8,
    sunIntensity: 0.7,
    ambient: 0.85,
    hemiSky: 0xb8c4cc,
    hemiGround: 0x6a6f66,
    autos: 8,
    cars: 9,
    autoCanopy: 0xe8c518,
    exposure: 1.0,
    landmark: "bengaluru",
  },
  phrases: majesticPhrases,
  npcs: [
    {
      id: "manju",
      name: "Manju",
      role: "Delivery Rider",
      speaker: "gokul",
      colour: 0xe74c3c,
      pos: [-8, -8],
      provokes: "Being pitied, called careless, or lectured about responsibility.",
      persona: `You deliver food on a rented scooter that disappeared in last
night's rain with the day's cash under the seat. You are young, exhausted and
ashamed, you keep insisting it was your fault for leaving it running. You
deflect help because you assume the player will judge you. If the player treats
you without condescension, you stop apologising and give the facts: a white
Activa, KA-01-JX-7788, left outside the coffee stall for four minutes.`,
      mission: {
        title: "Eleven Hours",
        brief: "Get past Manju's shame and pull out the scooter's details.",
        successCriteria:
          "The player treated Manju without judgement or condescension, and Manju has given the scooter's model and number plate.",
        reward: 200,
      },
      clue: "White Activa, KA-01-JX-7788, cash bag under the seat, left running for four minutes.",
      lesson: phrasebookLesson(majesticPhrases),
    },
    {
      id: "girija",
      name: "Girija",
      role: "Coffee Stall Owner",
      speaker: "shruti",
      colour: 0x8e44ad,
      pos: [12, -10],
      provokes: "Sentimentality, or blaming the world instead of admitting fault.",
      persona: `You run the filter coffee stall the scooter was parked outside.
You are dry, funny and utterly unsentimental. You saw it go but you think Manju
is careless and half-deserved it, and you say so. You will not help someone who
just wants to blame the world. If the player concedes that Manju was careless
AND still deserves help, you approve of the honesty and tell them: it was pushed,
not ridden, by two boys towards the garage lane.`,
      mission: {
        title: "She Saw It Go",
        brief: "Admit Manju was careless, Girija only respects honesty.",
        successCriteria:
          "The player acknowledged Manju's own carelessness while still arguing he deserves help, and Girija has said it was pushed by two boys towards the garage lane.",
        reward: 200,
      },
      clue: "It was pushed, not ridden, two boys took it towards the garage lane.",
      lesson: phrasebookLesson(majesticPhrases),
    },
    {
      id: "shankar",
      name: "Shankar",
      role: "Auto Stand Leader",
      speaker: "vijay",
      colour: 0x2980b9,
      pos: [-13, 11],
      provokes: "Talking down to autowallahs or dismissing the stand as irrelevant.",
      persona: `You run the auto stand and nothing moves on this road without
you knowing. You are territorial and you dislike app-based delivery riders, who
you think have ruined the street. You will help, but only if the player shows
respect for the stand and doesn't talk down to autowallahs. Given that respect
you say it plainly: the boys took it to Rafi's garage to be repainted tonight.`,
      mission: {
        title: "Respect The Stand",
        brief: "Show Shankar respect for the auto stand and he'll point the way.",
        successCriteria:
          "The player showed genuine respect for the auto stand rather than dismissing it, and Shankar has named Rafi's garage and the repaint.",
        reward: 200,
      },
      clue: "The boys took it to Rafi's garage to be repainted tonight.",
      lesson: phrasebookLesson(majesticPhrases),
    },
    {
      id: "rafi",
      name: "Rafi",
      role: "Garage Mechanic",
      speaker: "rehan",
      colour: 0x27ae60,
      pos: [13, 12],
      provokes: "Being accused of theft, or threats to report him.",
      persona: `You run a garage and the scooter is in your workshop, half
masked for a repaint. You did not steal it and you did not ask questions, which
you know is its own kind of answer. You are guarded, and an accusation of being
a thief will make you shut the shutter. But you have a rule about the cash bag,
you never touched it. If the player separates you from the boys who brought it
and gives you a way to hand it back without losing face, you do.`,
      mission: {
        title: "Half A Repaint",
        brief: "Give Rafi a way to hand it back without calling him a thief.",
        successCriteria:
          "The player distinguished Rafi from the actual thieves and offered him a face-saving way out, and Rafi has agreed to return the scooter and the cash bag.",
        reward: 400,
      },
      clue: "Rafi hands back the scooter and the untouched cash bag before the deadline.",
      requiresClues: 2,
      lesson: phrasebookLesson(majesticPhrases),
    },
  ],
  finale: {
    title: "SCOOTER RECOVERED",
    text: "The Activa comes back half-masked in primer, cash bag untouched. Manju makes the rental deadline with two hours spare. Rafi never admits anything and never has to.",
  },
};

/* ------------------------------------------------------------------ *
 * 4. PARK GULLY, Kolkata, Bengali, rain-washed dusk
 * ------------------------------------------------------------------ */

const parkGullyPhrases: Phrase[] = [
  { native: "নমস্কার", roman: "Nomoshkar", en: "Hello" },
  { native: "কত?", roman: "Koto?", en: "How much?" },
  { native: "একটু সাহায্য করুন", roman: "Ektu shahajjo korun", en: "Please help a little" },
  { native: "আমি বুঝতে পারছি না", roman: "Ami bujhte parchi na", en: "I do not understand" },
  { native: "আস্তে বলুন", roman: "Aste bolun", en: "Please speak slowly" },
  { native: "ধন্যবাদ", roman: "Dhonnobad", en: "Thank you" },
];

const parkGully: District = {
  id: "park-gully",
  name: "Park Gully",
  city: "Kolkata",
  blurb: "Wet red brick, failing light, and a yellow taxi that didn't come home.",
  coverImage: "/covers/park-gully.png",
  language: "bn-IN",
  languageLabel: "Bengali",
  native: "বাংলা",
  script: "Bengali",
  premise: `Bikash-da has driven the same yellow Ambassador for twenty-six years.
It went missing from the para on the night before Puja, with his father's
photograph still clipped to the sun visor. He wants the photograph more than the
car, though he will not say so.`,
  theme: {
    sky: ["#241a33", "#4d3352", "#8f4a4f", "#c96a48", "#e59f6a"],
    fog: 0xb87a5a,
    fogNear: 50,
    ground: 0x7a6a5c,
    pavement: 0xa39181,
    plaza: 0xab9887,
    tarmac: 0x2f2c2e,
    lane: 0xc9b98a,
    buildings: [0xb5544a, 0xd4a55c, 0x8a9c6a, 0xc98f6a, 0xa06858, 0xd8c48a, 0x94766a],
    canopies: [0xc0392b, 0xd4a55c, 0x8a6a4a],
    leaf: 0x2c5e33,
    trunk: 0x4a382a,
    sunColour: 0xffb878,
    sunIntensity: 1.05,
    ambient: 0.6,
    hemiSky: 0xa88ab0,
    hemiGround: 0x8a6048,
    autos: 6,
    cars: 8,
    autoCanopy: 0xf5c518,
    exposure: 1.15,
    landmark: "kolkata",
  },
  phrases: parkGullyPhrases,
  npcs: [
    {
      id: "bikash",
      name: "Bikash-da",
      role: "Taxi Driver",
      speaker: "soham",
      colour: 0xf4d03f,
      pos: [-9, -6],
      provokes: "Pity, or treating the Ambassador as merely an old car.",
      persona: `You have driven the same yellow Ambassador for twenty-six years
and it is gone. You are dignified and understated, you refuse to appear
distressed about a mere vehicle, and you steer the conversation to Puja
preparations instead. What you actually cannot bear is that your late father's
photograph was clipped to the sun visor. You will not volunteer this. Only if the
player asks gently about what was inside the car do you admit it, and give the
plate: WB-04-2847.`,
      mission: {
        title: "What Was Inside",
        brief: "Ask gently about what was in the car, not just the car.",
        successCriteria:
          "The player asked about the contents or what mattered to him personally, and Bikash has admitted the photograph and given the number plate.",
        reward: 200,
      },
      clue: "Yellow Ambassador, WB-04-2847. His father's photograph is clipped to the sun visor.",
      lesson: phrasebookLesson(parkGullyPhrases),
    },
    {
      id: "mitali",
      name: "Mitali",
      role: "Sweet Shop Owner",
      speaker: "ishita",
      colour: 0xc0392b,
      pos: [11, -12],
      provokes: "Being boring, or interrogating her like a policeman.",
      persona: `You run the sweet shop on the corner and the whole para passes
through it. You are quick, teasing, and you enjoy making people work for
information. You will not answer a plain question plainly, you want the player
to be interesting. Bore you and you go back to the sandesh. Make you laugh, or
tell you something you didn't know, and you give it up: the taxi was driven off
by someone who knew where the spare key was kept.`,
      mission: {
        title: "Make Her Laugh",
        brief: "Be interesting, not efficient. Mitali rewards charm.",
        successCriteria:
          "The player amused Mitali or told her something genuinely interesting rather than only interrogating her, and she has revealed the thief knew where the spare key was.",
        reward: 200,
      },
      clue: "Whoever took it knew where the spare key was kept, not a stranger.",
      lesson: phrasebookLesson(parkGullyPhrases),
    },
    {
      id: "paritosh",
      name: "Paritosh Dadu",
      role: "Rowak Elder",
      speaker: "ashutosh",
      colour: 0x7f8c8d,
      pos: [-14, 11],
      provokes: "Disrespect towards elders, or rushing him.",
      persona: `You are eighty-one and you sit on the rowak watching the para
from morning to night. You are wry and slightly deaf and you will happily
discuss the decline of Bengali football for an hour. You know exactly who took
it, Bikash's own nephew, Nazrul, and you are protecting the family's name. You
will only speak if the player convinces you that keeping the secret will hurt
Bikash more than the truth will.`,
      mission: {
        title: "The Para Remembers",
        brief: "Convince Dadu that silence hurts Bikash more than the truth.",
        successCriteria:
          "The player argued convincingly that protecting the secret harms Bikash more than revealing it, and Paritosh has named Nazrul as the nephew who took it.",
        reward: 200,
      },
      clue: "Bikash's own nephew Nazrul took it. He runs a garage two lanes over.",
      requiresClues: 1,
      lesson: phrasebookLesson(parkGullyPhrases),
    },
    {
      id: "nazrul",
      name: "Nazrul",
      role: "Garage Owner",
      speaker: "kabir",
      colour: 0x27ae60,
      pos: [14, 11],
      provokes: "Being called a thief, or threatening to tell Bikash before he is ready.",
      persona: `You are Bikash's nephew and you took his taxi. You did not steal
it to sell it, you took it because the engine was failing and your uncle would
never accept help or admit he could not afford the rebuild, so you did it behind
his back and planned to return it after Puja. You are ashamed and braced for an
accusation. If the player treats this as theft you shut down completely. If they
grasp that this was clumsy love, you break, and you ask them to help you tell
him.`,
      mission: {
        title: "Clumsy Love",
        brief: "This isn't a theft. Work out what it actually is.",
        successCriteria:
          "The player recognised Nazrul acted out of care rather than greed, and Nazrul has admitted the engine rebuild and agreed to face Bikash.",
        reward: 400,
      },
      clue: "Nazrul rebuilt the engine as a gift. The photograph never left the visor.",
      requiresClues: 3,
      lesson: phrasebookLesson(parkGullyPhrases),
    },
  ],
  finale: {
    title: "COMING HOME",
    text: "The Ambassador comes back on the second day of Puja with a rebuilt engine and the photograph exactly where it was. Bikash-da says nothing at all about the engine, which is how you know.",
  },
};

/** Authoring / seed only — runtime loads from Supabase. */
export const SEED_DISTRICTS: District[] = [
  puraniSadak,
  marinaNagar,
  majesticCross,
  parkGully,
];

export function totalReward(d: District): number {
  return d.npcs.reduce((s, n) => s + n.mission.reward, 0);
}

/** Clues needed before the gated final NPC will engage. */
export const CLUES_TO_UNLOCK = 3;
