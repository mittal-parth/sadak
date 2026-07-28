import type { LessonStep } from "@/lib/game/districts";
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
      lessons: {
        easy: [
        {
          npc: {
            native: "कहाँ जाना है?",
            roman: "Kahaan jaana hai?",
            en: "Where do you want to go?",
          },
          prompt: {
            native: "नई दिल्ली रेलवे स्टेशन",
            roman: "Nayi Dilli railway station",
            en: "New Delhi railway station",
          },
        },
        {
          npc: {
            native: "ठीक है, कितने दोगे?",
            roman: "Theek hai, kitne doge?",
            en: "Fine, what will you pay?",
          },
          prompt: {
            native: "डेढ़ सौ में चलोगे?",
            roman: "Dedh sau mein chaloge?",
            en: "Will you go for 150?",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "कहाँ जाना है?",
            roman: "Kahaan jaana hai?",
            en: "Where do you want to go?",
          },
          prompt: {
            native: "नई दिल्ली रेलवे स्टेशन",
            roman: "Nayi Dilli railway station",
            en: "New Delhi railway station",
          },
        },
        {
          npc: {
            native: "तीन सौ! पेट्रोल महंगा है भाई",
            roman: "Teen sau! Petrol mehenga hai bhai",
            en: "Three hundred! Petrol is expensive, brother",
          },
          prompt: {
            native: "हाँ समझा, पर थोड़ा कम कीजिए",
            roman: "Haan samjha, par thoda kam kijiye",
            en: "I understand, but please reduce it a bit",
          },
        },
        {
          npc: {
            native: "ठीक है, कितने दोगे?",
            roman: "Theek hai, kitne doge?",
            en: "Fine, what will you pay?",
          },
          prompt: {
            native: "डेढ़ सौ में चलोगे?",
            roman: "Dedh sau mein chaloge?",
            en: "Will you go for 150?",
          },
        },
        {
          npc: {
            native: "चलो, बैठ जाओ",
            roman: "Chalo, baith jao",
            en: "Come on, get in",
          },
          prompt: {
            native: "धन्यवाद, चलिए",
            roman: "Dhanyavaad, chaliye",
            en: "Thank you, let's go",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "कहाँ जाना है?",
            roman: "Kahaan jaana hai?",
            en: "Where do you want to go?",
          },
          prompt: {
            native: "नई दिल्ली रेलवे स्टेशन",
            roman: "Nayi Dilli railway station",
            en: "New Delhi railway station",
          },
        },
        {
          npc: {
            native: "तीन सौ! पेट्रोल महंगा है भाई",
            roman: "Teen sau! Petrol mehenga hai bhai",
            en: "Three hundred! Petrol is expensive, brother",
          },
          prompt: {
            native: "हाँ समझा, पर थोड़ा कम कीजिए",
            roman: "Haan samjha, par thoda kam kijiye",
            en: "I understand, but please reduce it a bit",
          },
        },
        {
          npc: {
            native: "ठीक है, कितने दोगे?",
            roman: "Theek hai, kitne doge?",
            en: "Fine, what will you pay?",
          },
          prompt: {
            native: "डेढ़ सौ में चलोगे?",
            roman: "Dedh sau mein chaloge?",
            en: "Will you go for 150?",
          },
        },
        {
          npc: {
            native: "मीटर से चलोगे?",
            roman: "Meter se chaloge?",
            en: "Will you go by meter?",
          },
          prompt: {
            native: "नहीं, पक्का किराया",
            roman: "Nahin, pakka kiraya",
            en: "No, fixed fare",
          },
        },
        {
          npc: {
            native: "चलो, बैठ जाओ",
            roman: "Chalo, baith jao",
            en: "Come on, get in",
          },
          prompt: {
            native: "धन्यवाद, चलिए",
            roman: "Dhanyavaad, chaliye",
            en: "Thank you, let's go",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "क्या लेंगे?",
            roman: "Kya lenge?",
            en: "What will you have?",
          },
          prompt: {
            native: "दो कचौड़ी दीजिए",
            roman: "Do kachaudi dijiye",
            en: "Two kachoris, please",
          },
        },
        {
          npc: {
            native: "चालीस रुपये",
            roman: "Chalees rupaye",
            en: "Forty rupees",
          },
          prompt: {
            native: "कितने पैसे हुए?",
            roman: "Kitne paise hue?",
            en: "What do I owe you?",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "क्या लेंगे?",
            roman: "Kya lenge?",
            en: "What will you have?",
          },
          prompt: {
            native: "दो कचौड़ी दीजिए",
            roman: "Do kachaudi dijiye",
            en: "Two kachoris, please",
          },
        },
        {
          npc: {
            native: "अरे, वो बिल्ली फिर आ गई!",
            roman: "Arre, wo billi phir aa gayi!",
            en: "Hey, that cat is back again!",
          },
          prompt: {
            native: "कोई बात नहीं, कचौड़ी दीजिए",
            roman: "Koi baat nahin, kachaudi dijiye",
            en: "No problem, give me the kachoris",
          },
        },
        {
          npc: {
            native: "चाय भी?",
            roman: "Chai bhi?",
            en: "Chai as well?",
          },
          prompt: {
            native: "हाँ, एक कटिंग चाय",
            roman: "Haan, ek cutting chai",
            en: "Yes, one cutting chai",
          },
        },
        {
          npc: {
            native: "चालीस रुपये",
            roman: "Chalees rupaye",
            en: "Forty rupees",
          },
          prompt: {
            native: "कितने पैसे हुए?",
            roman: "Kitne paise hue?",
            en: "What do I owe you?",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "क्या लेंगे?",
            roman: "Kya lenge?",
            en: "What will you have?",
          },
          prompt: {
            native: "दो कचौड़ी दीजिए",
            roman: "Do kachaudi dijiye",
            en: "Two kachoris, please",
          },
        },
        {
          npc: {
            native: "अरे, वो बिल्ली फिर आ गई!",
            roman: "Arre, wo billi phir aa gayi!",
            en: "Hey, that cat is back again!",
          },
          prompt: {
            native: "कोई बात नहीं, कचौड़ी दीजिए",
            roman: "Koi baat nahin, kachaudi dijiye",
            en: "No problem, give me the kachoris",
          },
        },
        {
          npc: {
            native: "चाय भी?",
            roman: "Chai bhi?",
            en: "Chai as well?",
          },
          prompt: {
            native: "हाँ, एक कटिंग चाय",
            roman: "Haan, ek cutting chai",
            en: "Yes, one cutting chai",
          },
        },
        {
          npc: {
            native: "मीठी चाय या सादी?",
            roman: "Meethi chai ya saadi?",
            en: "Sweet tea or plain?",
          },
          prompt: {
            native: "सादी चाय",
            roman: "Saadi chai",
            en: "Plain tea",
          },
        },
        {
          npc: {
            native: "चालीस रुपये",
            roman: "Chalees rupaye",
            en: "Forty rupees",
          },
          prompt: {
            native: "कितने पैसे हुए?",
            roman: "Kitne paise hue?",
            en: "What do I owe you?",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "मंदिर के लिए फूल?",
            roman: "Mandir ke liye phool?",
            en: "Flowers for the temple?",
          },
          prompt: {
            native: "हाँ, दो गenda की माला",
            roman: "Haan, do genda ki maala",
            en: "Yes, two marigold garlands",
          },
        },
        {
          npc: {
            native: "चालीस में ले लो",
            roman: "Chalees mein le lo",
            en: "Take it for forty",
          },
          prompt: {
            native: "धन्यवाद, ये लीजिए",
            roman: "Dhanyavaad, ye lijiye",
            en: "Thank you, here you go",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "मंदिर के लिए फूल?",
            roman: "Mandir ke liye phool?",
            en: "Flowers for the temple?",
          },
          prompt: {
            native: "हाँ, दो गenda की माला",
            roman: "Haan, do genda ki maala",
            en: "Yes, two marigold garlands",
          },
        },
        {
          npc: {
            native: "घंटी बज रही है, जल्दी कीजिए",
            roman: "Ghanti baj rahi hai, jaldi kijiye",
            en: "The bell is ringing, hurry up",
          },
          prompt: {
            native: "हाँ जल्दी, पहले दाम बताइए",
            roman: "Haan jaldi, pehle daam bataiye",
            en: "Yes hurry, tell me the price first",
          },
        },
        {
          npc: {
            native: "पचास रुपये",
            roman: "Pachaas rupaye",
            en: "Fifty rupees",
          },
          prompt: {
            native: "कितने का है?",
            roman: "Kitne ka hai?",
            en: "How much is it?",
          },
        },
        {
          npc: {
            native: "चालीस में ले लो",
            roman: "Chalees mein le lo",
            en: "Take it for forty",
          },
          prompt: {
            native: "धन्यवाद, ये लीजिए",
            roman: "Dhanyavaad, ye lijiye",
            en: "Thank you, here you go",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "मंदिर के लिए फूल?",
            roman: "Mandir ke liye phool?",
            en: "Flowers for the temple?",
          },
          prompt: {
            native: "हाँ, दो गenda की माला",
            roman: "Haan, do genda ki maala",
            en: "Yes, two marigold garlands",
          },
        },
        {
          npc: {
            native: "घंटी बज रही है, जल्दी कीजिए",
            roman: "Ghanti baj rahi hai, jaldi kijiye",
            en: "The bell is ringing, hurry up",
          },
          prompt: {
            native: "हाँ जल्दी, पहले दाम बताइए",
            roman: "Haan jaldi, pehle daam bataiye",
            en: "Yes hurry, tell me the price first",
          },
        },
        {
          npc: {
            native: "पचास रुपये",
            roman: "Pachaas rupaye",
            en: "Fifty rupees",
          },
          prompt: {
            native: "कितने का है?",
            roman: "Kitne ka hai?",
            en: "How much is it?",
          },
        },
        {
          npc: {
            native: "और कुछ चाहिए?",
            roman: "Aur kuch chahiye?",
            en: "Need anything else?",
          },
          prompt: {
            native: "नहीं, बस इतना",
            roman: "Nahin, bas itna",
            en: "No, just this",
          },
        },
        {
          npc: {
            native: "चालीस में ले लो",
            roman: "Chalees mein le lo",
            en: "Take it for forty",
          },
          prompt: {
            native: "धन्यवाद, ये लीजिए",
            roman: "Dhanyavaad, ye lijiye",
            en: "Thank you, here you go",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "कहाँ जाना है?",
            roman: "Kahaan jaana hai?",
            en: "Where are you going?",
          },
          prompt: {
            native: "चांदनी चौक",
            roman: "Chandni Chowk",
            en: "Chandni Chowk",
          },
        },
        {
          npc: {
            native: "लो, टिकट",
            roman: "Lo, ticket",
            en: "Here, your ticket",
          },
          prompt: {
            native: "धन्यवाद",
            roman: "Dhanyavaad",
            en: "Thank you",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "कहाँ जाना है?",
            roman: "Kahaan jaana hai?",
            en: "Where are you going?",
          },
          prompt: {
            native: "चांदनी चौक",
            roman: "Chandni Chowk",
            en: "Chandni Chowk",
          },
        },
        {
          npc: {
            native: "पीछे से चढ़ो, भीड़ है",
            roman: "Peeche se chadho, bheed hai",
            en: "Board from the back, it's crowded",
          },
          prompt: {
            native: "ठीक है, पीछे से चढ़ता हूँ",
            roman: "Theek hai, peeche se chadhta hoon",
            en: "Okay, I'll board from the back",
          },
        },
        {
          npc: {
            native: "बीस रुपये",
            roman: "Bees rupaye",
            en: "Twenty rupees",
          },
          prompt: {
            native: "एक टिकट दीजिए",
            roman: "Ek ticket dijiye",
            en: "One ticket, please",
          },
        },
        {
          npc: {
            native: "लो, टिकट",
            roman: "Lo, ticket",
            en: "Here, your ticket",
          },
          prompt: {
            native: "धन्यवाद",
            roman: "Dhanyavaad",
            en: "Thank you",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "कहाँ जाना है?",
            roman: "Kahaan jaana hai?",
            en: "Where are you going?",
          },
          prompt: {
            native: "चांदनी चौक",
            roman: "Chandni Chowk",
            en: "Chandni Chowk",
          },
        },
        {
          npc: {
            native: "पीछे से चढ़ो, भीड़ है",
            roman: "Peeche se chadho, bheed hai",
            en: "Board from the back, it's crowded",
          },
          prompt: {
            native: "ठीक है, पीछे से चढ़ता हूँ",
            roman: "Theek hai, peeche se chadhta hoon",
            en: "Okay, I'll board from the back",
          },
        },
        {
          npc: {
            native: "बीस रुपये",
            roman: "Bees rupaye",
            en: "Twenty rupees",
          },
          prompt: {
            native: "एक टिकट दीजिए",
            roman: "Ek ticket dijiye",
            en: "One ticket, please",
          },
        },
        {
          npc: {
            native: "छोटे नोट हैं?",
            roman: "Chhote note hain?",
            en: "Do you have small notes?",
          },
          prompt: {
            native: "हाँ, ये लीजिए",
            roman: "Haan, ye lijiye",
            en: "Yes, here you go",
          },
        },
        {
          npc: {
            native: "लो, टिकट",
            roman: "Lo, ticket",
            en: "Here, your ticket",
          },
          prompt: {
            native: "धन्यवाद",
            roman: "Dhanyavaad",
            en: "Thank you",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "எங்க போகணும்?",
            roman: "Enga poganum?",
            en: "Where do you need to go?",
          },
          prompt: {
            native: "டி நகர்",
            roman: "T Nagar",
            en: "T Nagar",
          },
        },
        {
          npc: {
            native: "சரி, ஏறுங்க",
            roman: "Sari, erunga",
            en: "Okay, get in",
          },
          prompt: {
            native: "நன்றி",
            roman: "Nandri",
            en: "Thank you",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "எங்க போகணும்?",
            roman: "Enga poganum?",
            en: "Where do you need to go?",
          },
          prompt: {
            native: "டி நகர்",
            roman: "T Nagar",
            en: "T Nagar",
          },
        },
        {
          npc: {
            native: "இவரும் டி நகர் தான்!",
            roman: "Ivarum T Nagar dhaan!",
            en: "This person is also going to T Nagar!",
          },
          prompt: {
            native: "சரி, பகிர்ந்து போகலாம்",
            roman: "Sari, pagirndhu pogalaam",
            en: "Okay, we can share the ride",
          },
        },
        {
          npc: {
            native: "எழுபது ரூபாய்",
            roman: "Ezhupathi rupaai",
            en: "Seventy rupees",
          },
          prompt: {
            native: "பகிர்ந்து கொள்ளலாமா?",
            roman: "Pagirndhu kollalaamaa?",
            en: "Can we share?",
          },
        },
        {
          npc: {
            native: "சரி, ஏறுங்க",
            roman: "Sari, erunga",
            en: "Okay, get in",
          },
          prompt: {
            native: "நன்றி",
            roman: "Nandri",
            en: "Thank you",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "எங்க போகணும்?",
            roman: "Enga poganum?",
            en: "Where do you need to go?",
          },
          prompt: {
            native: "டி நகர்",
            roman: "T Nagar",
            en: "T Nagar",
          },
        },
        {
          npc: {
            native: "இவரும் டி நகர் தான்!",
            roman: "Ivarum T Nagar dhaan!",
            en: "This person is also going to T Nagar!",
          },
          prompt: {
            native: "சரி, பகிர்ந்து போகலாம்",
            roman: "Sari, pagirndhu pogalaam",
            en: "Okay, we can share the ride",
          },
        },
        {
          npc: {
            native: "எழுபது ரூபாய்",
            roman: "Ezhupathi rupaai",
            en: "Seventy rupees",
          },
          prompt: {
            native: "பகிர்ந்து கொள்ளலாமா?",
            roman: "Pagirndhu kollalaamaa?",
            en: "Can we share?",
          },
        },
        {
          npc: {
            native: "மீட்டர் போடலாமா?",
            roman: "Meter podalaamaa?",
            en: "Shall we use the meter?",
          },
          prompt: {
            native: "சரி, மீட்டர்",
            roman: "Sari, meter",
            en: "Okay, meter",
          },
        },
        {
          npc: {
            native: "சரி, ஏறுங்க",
            roman: "Sari, erunga",
            en: "Okay, get in",
          },
          prompt: {
            native: "நன்றி",
            roman: "Nandri",
            en: "Thank you",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "என்ன வேணும்?",
            roman: "Enna venum?",
            en: "What do you want?",
          },
          prompt: {
            native: "ஒரு மசாலா தோசை",
            roman: "Oru masala dosai",
            en: "One masala dosa",
          },
        },
        {
          npc: {
            native: "எழுபத்து ஐந்து ரூபாய்",
            roman: "Ezhupathu aindhu rupaai",
            en: "Seventy-five rupees",
          },
          prompt: {
            native: "எவ்வளavu?",
            roman: "Evvalavu?",
            en: "How much?",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "என்ன வேணும்?",
            roman: "Enna venum?",
            en: "What do you want?",
          },
          prompt: {
            native: "ஒரு மசாலா தோசை",
            roman: "Oru masala dosai",
            en: "One masala dosa",
          },
        },
        {
          npc: {
            native: "சுட சுட வரும்!",
            roman: "Suda suda varum!",
            en: "It'll come piping hot!",
          },
          prompt: {
            native: "சரி, காத்திருக்கிறேன்",
            roman: "Sari, kaathirukkiren",
            en: "Okay, I'll wait",
          },
        },
        {
          npc: {
            native: "காபி?",
            roman: "Kaapi?",
            en: "Coffee?",
          },
          prompt: {
            native: "ஆம், ஒரு காபி",
            roman: "Aam, oru kaapi",
            en: "Yes, one coffee",
          },
        },
        {
          npc: {
            native: "எழுபத்து ஐந்து ரூபாய்",
            roman: "Ezhupathu aindhu rupaai",
            en: "Seventy-five rupees",
          },
          prompt: {
            native: "எவ்வளavu?",
            roman: "Evvalavu?",
            en: "How much?",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "என்ன வேணும்?",
            roman: "Enna venum?",
            en: "What do you want?",
          },
          prompt: {
            native: "ஒரு மசாலா தோசை",
            roman: "Oru masala dosai",
            en: "One masala dosa",
          },
        },
        {
          npc: {
            native: "சுட சுட வரும்!",
            roman: "Suda suda varum!",
            en: "It'll come piping hot!",
          },
          prompt: {
            native: "சரி, காத்திருக்கிறேன்",
            roman: "Sari, kaathirukkiren",
            en: "Okay, I'll wait",
          },
        },
        {
          npc: {
            native: "காபி?",
            roman: "Kaapi?",
            en: "Coffee?",
          },
          prompt: {
            native: "ஆம், ஒரு காபி",
            roman: "Aam, oru kaapi",
            en: "Yes, one coffee",
          },
        },
        {
          npc: {
            native: "சட்னி extra?",
            roman: "Chutney extra?",
            en: "Extra chutney?",
          },
          prompt: {
            native: "ஆம், கொடுங்க",
            roman: "Aam, kodunga",
            en: "Yes, give some",
          },
        },
        {
          npc: {
            native: "எழுபத்து ஐந்து ரூபாய்",
            roman: "Ezhupathu aindhu rupaai",
            en: "Seventy-five rupees",
          },
          prompt: {
            native: "எவ்வளavu?",
            roman: "Evvalavu?",
            en: "How much?",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "தேங்காய் வேணுமா?",
            roman: "Thengai venumaa?",
            en: "Do you want a coconut?",
          },
          prompt: {
            native: "ஆம், ஒரு தேங்காய்",
            roman: "Aam, oru thengai",
            en: "Yes, one coconut",
          },
        },
        {
          npc: {
            native: "எடுத்துக்கோங்க",
            roman: "Eduthukkonga",
            en: "Take it",
          },
          prompt: {
            native: "நன்றி",
            roman: "Nandri",
            en: "Thank you",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "தேங்காய் வேணுமா?",
            roman: "Thengai venumaa?",
            en: "Do you want a coconut?",
          },
          prompt: {
            native: "ஆம், ஒரு தேங்காய்",
            roman: "Aam, oru thengai",
            en: "Yes, one coconut",
          },
        },
        {
          npc: {
            native: "பூஜை நேரம் ஆரம்பம்!",
            roman: "Poojai neram aarambam!",
            en: "Puja time is starting!",
          },
          prompt: {
            native: "சரி, சீக்கிரம் பண்ணுங்க",
            roman: "Sari, seekiram pannunga",
            en: "Okay, please hurry",
          },
        },
        {
          npc: {
            native: "முப்பது ரூபாய்",
            roman: "Muppathu rupaai",
            en: "Thirty rupees",
          },
          prompt: {
            native: "எவ்வளavu?",
            roman: "Evvalavu?",
            en: "How much?",
          },
        },
        {
          npc: {
            native: "எடுத்துக்கோங்க",
            roman: "Eduthukkonga",
            en: "Take it",
          },
          prompt: {
            native: "நன்றி",
            roman: "Nandri",
            en: "Thank you",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "தேங்காய் வேணுமா?",
            roman: "Thengai venumaa?",
            en: "Do you want a coconut?",
          },
          prompt: {
            native: "ஆம், ஒரு தேங்காய்",
            roman: "Aam, oru thengai",
            en: "Yes, one coconut",
          },
        },
        {
          npc: {
            native: "பூஜை நேரம் ஆரம்பம்!",
            roman: "Poojai neram aarambam!",
            en: "Puja time is starting!",
          },
          prompt: {
            native: "சரி, சீக்கிரம் பண்ணுங்க",
            roman: "Sari, seekiram pannunga",
            en: "Okay, please hurry",
          },
        },
        {
          npc: {
            native: "முப்பது ரூபாய்",
            roman: "Muppathu rupaai",
            en: "Thirty rupees",
          },
          prompt: {
            native: "எவ்வளavu?",
            roman: "Evvalavu?",
            en: "How much?",
          },
        },
        {
          npc: {
            native: "குங்குமம் வேணுமா?",
            roman: "Kungumam venumaa?",
            en: "Want kumkum too?",
          },
          prompt: {
            native: "ஆம், கொடுங்க",
            roman: "Aam, kodunga",
            en: "Yes, please",
          },
        },
        {
          npc: {
            native: "எடுத்துக்கோங்க",
            roman: "Eduthukkonga",
            en: "Take it",
          },
          prompt: {
            native: "நன்றி",
            roman: "Nandri",
            en: "Thank you",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "எங்க போறீங்க?",
            roman: "Enga poringa?",
            en: "Where are you going?",
          },
          prompt: {
            native: "மெரினா beach",
            roman: "Marina Beach",
            en: "Marina Beach",
          },
        },
        {
          npc: {
            native: "போங்க",
            roman: "Ponga",
            en: "Go ahead",
          },
          prompt: {
            native: "நன்றி",
            roman: "Nandri",
            en: "Thank you",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "எங்க போறீங்க?",
            roman: "Enga poringa?",
            en: "Where are you going?",
          },
          prompt: {
            native: "மெரினா beach",
            roman: "Marina Beach",
            en: "Marina Beach",
          },
        },
        {
          npc: {
            native: "பின்னாடி ஏறுங்க!",
            roman: "Pinnadi erunga!",
            en: "Board from the back!",
          },
          prompt: {
            native: "சரி, பின்னாடி ஏறுகிறேன்",
            roman: "Sari, pinnadi erukiren",
            en: "Okay, I'm boarding from the back",
          },
        },
        {
          npc: {
            native: "பதினைந்து ரூபாய்",
            roman: "Pathinaidu rupaai",
            en: "Fifteen rupees",
          },
          prompt: {
            native: "ஒரு டிக்கெட்",
            roman: "Oru ticket",
            en: "One ticket",
          },
        },
        {
          npc: {
            native: "போங்க",
            roman: "Ponga",
            en: "Go ahead",
          },
          prompt: {
            native: "நன்றி",
            roman: "Nandri",
            en: "Thank you",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "எங்க போறீங்க?",
            roman: "Enga poringa?",
            en: "Where are you going?",
          },
          prompt: {
            native: "மெரினா beach",
            roman: "Marina Beach",
            en: "Marina Beach",
          },
        },
        {
          npc: {
            native: "பின்னாடி ஏறுங்க!",
            roman: "Pinnadi erunga!",
            en: "Board from the back!",
          },
          prompt: {
            native: "சரி, பின்னாடி ஏறுகிறேன்",
            roman: "Sari, pinnadi erukiren",
            en: "Okay, I'm boarding from the back",
          },
        },
        {
          npc: {
            native: "பதினைந்து ரூபாய்",
            roman: "Pathinaidu rupaai",
            en: "Fifteen rupees",
          },
          prompt: {
            native: "ஒரு டிக்கெட்",
            roman: "Oru ticket",
            en: "One ticket",
          },
        },
        {
          npc: {
            native: "சில்லறை இருக்கா?",
            roman: "Sillara irukkaa?",
            en: "Got change?",
          },
          prompt: {
            native: "ஆம், இதோ",
            roman: "Aam, itho",
            en: "Yes, here",
          },
        },
        {
          npc: {
            native: "போங்க",
            roman: "Ponga",
            en: "Go ahead",
          },
          prompt: {
            native: "நன்றி",
            roman: "Nandri",
            en: "Thank you",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "ಎಲ್ಲಿಗೆ?",
            roman: "Ellige?",
            en: "Where to?",
          },
          prompt: {
            native: "ಮೆಜೆಸ್ಟಿಕ್ ಬಸ್ ಸ್ಟ್ಯಾಂಡ್",
            roman: "Majestic bus stand",
            en: "Majestic bus stand",
          },
        },
        {
          npc: {
            native: "ಒಪ್ಪಿಗೆ, ಬನ್ನಿ",
            roman: "Oppige, banni",
            en: "Agreed, come",
          },
          prompt: {
            native: "ಧನ್ಯವಾದ",
            roman: "Dhanyavaada",
            en: "Thank you",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "ಎಲ್ಲಿಗೆ?",
            roman: "Ellige?",
            en: "Where to?",
          },
          prompt: {
            native: "ಮೆಜೆಸ್ಟಿಕ್ ಬಸ್ ಸ್ಟ್ಯಾಂಡ್",
            roman: "Majestic bus stand",
            en: "Majestic bus stand",
          },
        },
        {
          npc: {
            native: "ಟ್ರಾಫಿಕ್ ಜಾಸ್ತಿ ಇದೆ!",
            roman: "Traffic jaasti ide!",
            en: "Traffic is heavy!",
          },
          prompt: {
            native: "ಸರಿ, ಸಮಯ ಆಗುತ್ತೆ",
            roman: "Sari, samaya agutte",
            en: "Okay, time is tight",
          },
        },
        {
          npc: {
            native: "ನೂರು ರೂಪಾಯಿ",
            roman: "Nuru rupaayi",
            en: "Hundred rupees",
          },
          prompt: {
            native: "ಎಷ್ಟು?",
            roman: "Eshtu?",
            en: "How much?",
          },
        },
        {
          npc: {
            native: "ಒಪ್ಪಿಗೆ, ಬನ್ನಿ",
            roman: "Oppige, banni",
            en: "Agreed, come",
          },
          prompt: {
            native: "ಧನ್ಯವಾದ",
            roman: "Dhanyavaada",
            en: "Thank you",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "ಎಲ್ಲಿಗೆ?",
            roman: "Ellige?",
            en: "Where to?",
          },
          prompt: {
            native: "ಮೆಜೆಸ್ಟಿಕ್ ಬಸ್ ಸ್ಟ್ಯಾಂಡ್",
            roman: "Majestic bus stand",
            en: "Majestic bus stand",
          },
        },
        {
          npc: {
            native: "ಟ್ರಾಫಿಕ್ ಜಾಸ್ತಿ ಇದೆ!",
            roman: "Traffic jaasti ide!",
            en: "Traffic is heavy!",
          },
          prompt: {
            native: "ಸರಿ, ಸಮಯ ಆಗುತ್ತೆ",
            roman: "Sari, samaya agutte",
            en: "Okay, time is tight",
          },
        },
        {
          npc: {
            native: "ನೂರು ರೂಪಾಯಿ",
            roman: "Nuru rupaayi",
            en: "Hundred rupees",
          },
          prompt: {
            native: "ಎಷ್ಟು?",
            roman: "Eshtu?",
            en: "How much?",
          },
        },
        {
          npc: {
            native: "ಮೀಟರ್ ಹಾಕೋವಾ?",
            roman: "Meter haakova?",
            en: "Shall I put the meter?",
          },
          prompt: {
            native: "ಇಲ್ಲ, ಫಿಕ್ಸ್",
            roman: "Illa, fix",
            en: "No, fixed",
          },
        },
        {
          npc: {
            native: "ಒಪ್ಪಿಗೆ, ಬನ್ನಿ",
            roman: "Oppige, banni",
            en: "Agreed, come",
          },
          prompt: {
            native: "ಧನ್ಯವಾದ",
            roman: "Dhanyavaada",
            en: "Thank you",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "ಏನು ಬೇಕು?",
            roman: "Enu beku?",
            en: "What do you want?",
          },
          prompt: {
            native: "ಎರಡು ಇಡ್ಲಿ ಒಂದು ವಡೆ",
            roman: "Eradu idli ondu vade",
            en: "Two idlis and one vada",
          },
        },
        {
          npc: {
            native: "ನಲವತ್ತು ರೂಪಾಯಿ",
            roman: "Nalavattu rupaayi",
            en: "Forty rupees",
          },
          prompt: {
            native: "ಎಷ್ಟು?",
            roman: "Eshtu?",
            en: "How much?",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "ಏನು ಬೇಕು?",
            roman: "Enu beku?",
            en: "What do you want?",
          },
          prompt: {
            native: "ಎರಡು ಇಡ್ಲಿ ಒಂದು ವಡೆ",
            roman: "Eradu idli ondu vade",
            en: "Two idlis and one vada",
          },
        },
        {
          npc: {
            native: "ಬಿಸಿ ಬಿಸಿ!",
            roman: "Bisi bisi!",
            en: "Hot hot!",
          },
          prompt: {
            native: "ಸರಿ, ಕಾಯುತ್ತೇನೆ",
            roman: "Sari, kayuttene",
            en: "Okay, I'll wait",
          },
        },
        {
          npc: {
            native: "ಕಾಫಿ?",
            roman: "Kaafi?",
            en: "Coffee?",
          },
          prompt: {
            native: "ಇಲ್ಲ, ಧನ್ಯವಾದ",
            roman: "Illa, dhanyavaada",
            en: "No, thank you",
          },
        },
        {
          npc: {
            native: "ನಲವತ್ತು ರೂಪಾಯಿ",
            roman: "Nalavattu rupaayi",
            en: "Forty rupees",
          },
          prompt: {
            native: "ಎಷ್ಟು?",
            roman: "Eshtu?",
            en: "How much?",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "ಏನು ಬೇಕು?",
            roman: "Enu beku?",
            en: "What do you want?",
          },
          prompt: {
            native: "ಎರಡು ಇಡ್ಲಿ ಒಂದು ವಡೆ",
            roman: "Eradu idli ondu vade",
            en: "Two idlis and one vada",
          },
        },
        {
          npc: {
            native: "ಬಿಸಿ ಬಿಸಿ!",
            roman: "Bisi bisi!",
            en: "Hot hot!",
          },
          prompt: {
            native: "ಸರಿ, ಕಾಯುತ್ತೇನೆ",
            roman: "Sari, kayuttene",
            en: "Okay, I'll wait",
          },
        },
        {
          npc: {
            native: "ಕಾಫಿ?",
            roman: "Kaafi?",
            en: "Coffee?",
          },
          prompt: {
            native: "ಇಲ್ಲ, ಧನ್ಯವಾದ",
            roman: "Illa, dhanyavaada",
            en: "No, thank you",
          },
        },
        {
          npc: {
            native: "ಚಟ್ನಿ ಜಾಸ್ತಿ?",
            roman: "Chutney jaasti?",
            en: "Extra chutney?",
          },
          prompt: {
            native: "ಹೌದು, ಕೊಡಿ",
            roman: "Haudu, kodi",
            en: "Yes, give some",
          },
        },
        {
          npc: {
            native: "ನಲವತ್ತು ರೂಪಾಯಿ",
            roman: "Nalavattu rupaayi",
            en: "Forty rupees",
          },
          prompt: {
            native: "ಎಷ್ಟು?",
            roman: "Eshtu?",
            en: "How much?",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "ಮಲ್ಲಿಗೆ?",
            roman: "Mallige?",
            en: "Jasmine?",
          },
          prompt: {
            native: "ಹೌದು, ಒಂದು ಮಾಲೆ",
            roman: "Haudu, ondu maale",
            en: "Yes, one garland",
          },
        },
        {
          npc: {
            native: "ತೆಗೆದುಕೊಳ್ಳಿ",
            roman: "Tegedukolli",
            en: "Take it",
          },
          prompt: {
            native: "ಧನ್ಯವಾದ",
            roman: "Dhanyavaada",
            en: "Thank you",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "ಮಲ್ಲಿಗೆ?",
            roman: "Mallige?",
            en: "Jasmine?",
          },
          prompt: {
            native: "ಹೌದು, ಒಂದು ಮಾಲೆ",
            roman: "Haudu, ondu maale",
            en: "Yes, one garland",
          },
        },
        {
          npc: {
            native: "ಘಂಟೆ ಬರುತ್ತಿದೆ!",
            roman: "Ghante baruttide!",
            en: "The bell is ringing!",
          },
          prompt: {
            native: "ಸರಿ, ಬೇಗ ಬರುತ್ತೇನೆ",
            roman: "Sari, bega baruttene",
            en: "Okay, I'll come quickly",
          },
        },
        {
          npc: {
            native: "ಮೂವತ್ತು ರೂಪಾಯಿ",
            roman: "Muvattu rupaayi",
            en: "Thirty rupees",
          },
          prompt: {
            native: "ಎಷ್ಟು?",
            roman: "Eshtu?",
            en: "How much?",
          },
        },
        {
          npc: {
            native: "ತೆಗೆದುಕೊಳ್ಳಿ",
            roman: "Tegedukolli",
            en: "Take it",
          },
          prompt: {
            native: "ಧನ್ಯವಾದ",
            roman: "Dhanyavaada",
            en: "Thank you",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "ಮಲ್ಲಿಗೆ?",
            roman: "Mallige?",
            en: "Jasmine?",
          },
          prompt: {
            native: "ಹೌದು, ಒಂದು ಮಾಲೆ",
            roman: "Haudu, ondu maale",
            en: "Yes, one garland",
          },
        },
        {
          npc: {
            native: "ಘಂಟೆ ಬರುತ್ತಿದೆ!",
            roman: "Ghante baruttide!",
            en: "The bell is ringing!",
          },
          prompt: {
            native: "ಸರಿ, ಬೇಗ ಬರುತ್ತೇನೆ",
            roman: "Sari, bega baruttene",
            en: "Okay, I'll come quickly",
          },
        },
        {
          npc: {
            native: "ಮೂವತ್ತು ರೂಪಾಯಿ",
            roman: "Muvattu rupaayi",
            en: "Thirty rupees",
          },
          prompt: {
            native: "ಎಷ್ಟು?",
            roman: "Eshtu?",
            en: "How much?",
          },
        },
        {
          npc: {
            native: "ಕುಂಕುಮ ಬೇಕಾ?",
            roman: "Kunkuma bekaa?",
            en: "Want kumkum?",
          },
          prompt: {
            native: "ಹೌದು",
            roman: "Haudu",
            en: "Yes",
          },
        },
        {
          npc: {
            native: "ತೆಗೆದುಕೊಳ್ಳಿ",
            roman: "Tegedukolli",
            en: "Take it",
          },
          prompt: {
            native: "ಧನ್ಯವಾದ",
            roman: "Dhanyavaada",
            en: "Thank you",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "ಎಲ್ಲಿಗೆ?",
            roman: "Ellige?",
            en: "Where to?",
          },
          prompt: {
            native: "ಶಿವಾಜಿನಗರ",
            roman: "Shivajinagar",
            en: "Shivajinagar",
          },
        },
        {
          npc: {
            native: "ಹೋಗಿ",
            roman: "Hogi",
            en: "Go",
          },
          prompt: {
            native: "ಧನ್ಯವಾದ",
            roman: "Dhanyavaada",
            en: "Thank you",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "ಎಲ್ಲಿಗೆ?",
            roman: "Ellige?",
            en: "Where to?",
          },
          prompt: {
            native: "ಶಿವಾಜಿನಗರ",
            roman: "Shivajinagar",
            en: "Shivajinagar",
          },
        },
        {
          npc: {
            native: "ಹಿಂದಿನ ಬಾಗಿಲು!",
            roman: "Hindina baagilu!",
            en: "Back door!",
          },
          prompt: {
            native: "ಸರಿ, ಹಿಂದಿನ ಬಾಗಿಲಿನಿಂದ",
            roman: "Sari, hindina baagilinda",
            en: "Okay, from the back door",
          },
        },
        {
          npc: {
            native: "ಇಪ್ಪತ್ತು ರೂಪಾಯಿ",
            roman: "Ippattu rupaayi",
            en: "Twenty rupees",
          },
          prompt: {
            native: "ಒಂದು ಟಿಕೆಟ್",
            roman: "Ondu ticket",
            en: "One ticket",
          },
        },
        {
          npc: {
            native: "ಹೋಗಿ",
            roman: "Hogi",
            en: "Go",
          },
          prompt: {
            native: "ಧನ್ಯವಾದ",
            roman: "Dhanyavaada",
            en: "Thank you",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "ಎಲ್ಲಿಗೆ?",
            roman: "Ellige?",
            en: "Where to?",
          },
          prompt: {
            native: "ಶಿವಾಜಿನಗರ",
            roman: "Shivajinagar",
            en: "Shivajinagar",
          },
        },
        {
          npc: {
            native: "ಹಿಂದಿನ ಬಾಗಿಲು!",
            roman: "Hindina baagilu!",
            en: "Back door!",
          },
          prompt: {
            native: "ಸರಿ, ಹಿಂದಿನ ಬಾಗಿಲಿನಿಂದ",
            roman: "Sari, hindina baagilinda",
            en: "Okay, from the back door",
          },
        },
        {
          npc: {
            native: "ಇಪ್ಪತ್ತು ರೂಪಾಯಿ",
            roman: "Ippattu rupaayi",
            en: "Twenty rupees",
          },
          prompt: {
            native: "ಒಂದು ಟಿಕೆಟ್",
            roman: "Ondu ticket",
            en: "One ticket",
          },
        },
        {
          npc: {
            native: "ಚಿಲ್ಲರೆ ಇದೆಯಾ?",
            roman: "Chillare ideyaa?",
            en: "Got change?",
          },
          prompt: {
            native: "ಹೌದು, ತೆಗೆದುಕೊಳ್ಳಿ",
            roman: "Haudu, tegedukolli",
            en: "Yes, take it",
          },
        },
        {
          npc: {
            native: "ಹೋಗಿ",
            roman: "Hogi",
            en: "Go",
          },
          prompt: {
            native: "ಧನ್ಯವಾದ",
            roman: "Dhanyavaada",
            en: "Thank you",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "কোথায় যাবেন?",
            roman: "Kothay jaben?",
            en: "Where will you go?",
          },
          prompt: {
            native: "হাওড়া স্টেশন",
            roman: "Howrah station",
            en: "Howrah station",
          },
        },
        {
          npc: {
            native: "ঠিক আছে, উঠুন",
            roman: "Thik ache, uthun",
            en: "Okay, get in",
          },
          prompt: {
            native: "ধন্যবাদ",
            roman: "Dhonnobad",
            en: "Thank you",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "কোথায় যাবেন?",
            roman: "Kothay jaben?",
            en: "Where will you go?",
          },
          prompt: {
            native: "হাওড়া স্টেশন",
            roman: "Howrah station",
            en: "Howrah station",
          },
        },
        {
          npc: {
            native: "বৃষ্টি হচ্ছে, ভিজবেন!",
            roman: "Brishti hocche, vijben!",
            en: "It's raining, you'll get wet!",
          },
          prompt: {
            native: "ঠিক আছে, ছাতা আছে",
            roman: "Thik ache, chhata ache",
            en: "Okay, I have an umbrella",
          },
        },
        {
          npc: {
            native: "দুশো টাকা",
            roman: "Dusho taka",
            en: "Two hundred rupees",
          },
          prompt: {
            native: "কত?",
            roman: "Koto?",
            en: "How much?",
          },
        },
        {
          npc: {
            native: "ঠিক আছে, উঠুন",
            roman: "Thik ache, uthun",
            en: "Okay, get in",
          },
          prompt: {
            native: "ধন্যবাদ",
            roman: "Dhonnobad",
            en: "Thank you",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "কোথায় যাবেন?",
            roman: "Kothay jaben?",
            en: "Where will you go?",
          },
          prompt: {
            native: "হাওড়া স্টেশন",
            roman: "Howrah station",
            en: "Howrah station",
          },
        },
        {
          npc: {
            native: "বৃষ্টি হচ্ছে, ভিজবেন!",
            roman: "Brishti hocche, vijben!",
            en: "It's raining, you'll get wet!",
          },
          prompt: {
            native: "ঠিক আছে, ছাতা আছে",
            roman: "Thik ache, chhata ache",
            en: "Okay, I have an umbrella",
          },
        },
        {
          npc: {
            native: "দুশো টাকা",
            roman: "Dusho taka",
            en: "Two hundred rupees",
          },
          prompt: {
            native: "কত?",
            roman: "Koto?",
            en: "How much?",
          },
        },
        {
          npc: {
            native: "মিটার চালাবেন?",
            roman: "Meter chalaben?",
            en: "Run the meter?",
          },
          prompt: {
            native: "না, ঠিক ভাড়া",
            roman: "Na, thik bhara",
            en: "No, fixed fare",
          },
        },
        {
          npc: {
            native: "ঠিক আছে, উঠুন",
            roman: "Thik ache, uthun",
            en: "Okay, get in",
          },
          prompt: {
            native: "ধন্যবাদ",
            roman: "Dhonnobad",
            en: "Thank you",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "কী নেবেন?",
            roman: "Ki neben?",
            en: "What will you take?",
          },
          prompt: {
            native: "দুটো শিঙ্গারা আর একটা কচুরি",
            roman: "Duto shingara ar ekta kachori",
            en: "Two singaras and one kachori",
          },
        },
        {
          npc: {
            native: "চল্লিশ টাকা",
            roman: "Chollish taka",
            en: "Forty taka",
          },
          prompt: {
            native: "কত?",
            roman: "Koto?",
            en: "How much?",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "কী নেবেন?",
            roman: "Ki neben?",
            en: "What will you take?",
          },
          prompt: {
            native: "দুটো শিঙ্গারা আর একটা কচুরি",
            roman: "Duto shingara ar ekta kachori",
            en: "Two singaras and one kachori",
          },
        },
        {
          npc: {
            native: "গরম গরম!",
            roman: "Garam garam!",
            en: "Hot hot!",
          },
          prompt: {
            native: "ঠিক আছে, অপেক্ষা করছি",
            roman: "Thik ache, opekkha korchi",
            en: "Okay, I'm waiting",
          },
        },
        {
          npc: {
            native: "চা?",
            roman: "Cha?",
            en: "Tea?",
          },
          prompt: {
            native: "হ্যাঁ, এক কাপ",
            roman: "Hyaa, ek kap",
            en: "Yes, one cup",
          },
        },
        {
          npc: {
            native: "চল্লিশ টাকা",
            roman: "Chollish taka",
            en: "Forty taka",
          },
          prompt: {
            native: "কত?",
            roman: "Koto?",
            en: "How much?",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "কী নেবেন?",
            roman: "Ki neben?",
            en: "What will you take?",
          },
          prompt: {
            native: "দুটো শিঙ্গারা আর একটা কচুরি",
            roman: "Duto shingara ar ekta kachori",
            en: "Two singaras and one kachori",
          },
        },
        {
          npc: {
            native: "গরম গরম!",
            roman: "Garam garam!",
            en: "Hot hot!",
          },
          prompt: {
            native: "ঠিক আছে, অপেক্ষা করছি",
            roman: "Thik ache, opekkha korchi",
            en: "Okay, I'm waiting",
          },
        },
        {
          npc: {
            native: "চা?",
            roman: "Cha?",
            en: "Tea?",
          },
          prompt: {
            native: "হ্যাঁ, এক কাপ",
            roman: "Hyaa, ek kap",
            en: "Yes, one cup",
          },
        },
        {
          npc: {
            native: "মিষ্টি চা নাকি?",
            roman: "Mishti cha naki?",
            en: "Sweet tea or not?",
          },
          prompt: {
            native: "না, সাদা চা",
            roman: "Na, sada cha",
            en: "No, plain tea",
          },
        },
        {
          npc: {
            native: "চল্লিশ টাকা",
            roman: "Chollish taka",
            en: "Forty taka",
          },
          prompt: {
            native: "কত?",
            roman: "Koto?",
            en: "How much?",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "প্রসাদ নেবেন?",
            roman: "Prasad neben?",
            en: "Will you take prasad?",
          },
          prompt: {
            native: "হ্যাঁ, এক পacket",
            roman: "Hyaa, ek packet",
            en: "Yes, one packet",
          },
        },
        {
          npc: {
            native: "নিন",
            roman: "Nin",
            en: "Take it",
          },
          prompt: {
            native: "ধন্যবাদ",
            roman: "Dhonnobad",
            en: "Thank you",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "প্রসাদ নেবেন?",
            roman: "Prasad neben?",
            en: "Will you take prasad?",
          },
          prompt: {
            native: "হ্যাঁ, এক পacket",
            roman: "Hyaa, ek packet",
            en: "Yes, one packet",
          },
        },
        {
          npc: {
            native: "ঘণ্টা বাজছে!",
            roman: "Ghonta bajche!",
            en: "The bell is ringing!",
          },
          prompt: {
            native: "ঠিক আছে, তাড়াতাড়ি আসছি",
            roman: "Thik ache, taratari aschi",
            en: "Okay, coming quickly",
          },
        },
        {
          npc: {
            native: "পঁচিশ টাকা",
            roman: "Pochish taka",
            en: "Twenty-five taka",
          },
          prompt: {
            native: "কত?",
            roman: "Koto?",
            en: "How much?",
          },
        },
        {
          npc: {
            native: "নিন",
            roman: "Nin",
            en: "Take it",
          },
          prompt: {
            native: "ধন্যবাদ",
            roman: "Dhonnobad",
            en: "Thank you",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "প্রসাদ নেবেন?",
            roman: "Prasad neben?",
            en: "Will you take prasad?",
          },
          prompt: {
            native: "হ্যাঁ, এক পacket",
            roman: "Hyaa, ek packet",
            en: "Yes, one packet",
          },
        },
        {
          npc: {
            native: "ঘণ্টা বাজছে!",
            roman: "Ghonta bajche!",
            en: "The bell is ringing!",
          },
          prompt: {
            native: "ঠিক আছে, তাড়াতাড়ি আসছি",
            roman: "Thik ache, taratari aschi",
            en: "Okay, coming quickly",
          },
        },
        {
          npc: {
            native: "পঁচিশ টাকা",
            roman: "Pochish taka",
            en: "Twenty-five taka",
          },
          prompt: {
            native: "কত?",
            roman: "Koto?",
            en: "How much?",
          },
        },
        {
          npc: {
            native: "সিঁদুর লাগবে?",
            roman: "Sindur lagbe?",
            en: "Need vermillion?",
          },
          prompt: {
            native: "হ্যাঁ, দিন",
            roman: "Hyaa, din",
            en: "Yes, give it",
          },
        },
        {
          npc: {
            native: "নিন",
            roman: "Nin",
            en: "Take it",
          },
          prompt: {
            native: "ধন্যবাদ",
            roman: "Dhonnobad",
            en: "Thank you",
          },
        }
      ],
      },
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
      lessons: {
        easy: [
        {
          npc: {
            native: "কোথায়?",
            roman: "Kothay?",
            en: "Where to?",
          },
          prompt: {
            native: "এসপ্ল্যানেড",
            roman: "Esplanade",
            en: "Esplanade",
          },
        },
        {
          npc: {
            native: "যান",
            roman: "Jan",
            en: "Go",
          },
          prompt: {
            native: "ধন্যবাদ",
            roman: "Dhonnobad",
            en: "Thank you",
          },
        }
      ],
        medium: [
        {
          npc: {
            native: "কোথায়?",
            roman: "Kothay?",
            en: "Where to?",
          },
          prompt: {
            native: "এসপ্ল্যানেড",
            roman: "Esplanade",
            en: "Esplanade",
          },
        },
        {
          npc: {
            native: "টram আসছে!",
            roman: "Tram asche!",
            en: "Tram is coming!",
          },
          prompt: {
            native: "ঠিক আছে, টram এ উঠব",
            roman: "Thik ache, tram e uthbo",
            en: "Okay, I'll board the tram",
          },
        },
        {
          npc: {
            native: "দশ টাকা",
            roman: "Dash taka",
            en: "Ten taka",
          },
          prompt: {
            native: "একটা ticket",
            roman: "Ekta ticket",
            en: "One ticket",
          },
        },
        {
          npc: {
            native: "যান",
            roman: "Jan",
            en: "Go",
          },
          prompt: {
            native: "ধন্যবাদ",
            roman: "Dhonnobad",
            en: "Thank you",
          },
        },
      ],
        hard: [
        {
          npc: {
            native: "কোথায়?",
            roman: "Kothay?",
            en: "Where to?",
          },
          prompt: {
            native: "এসপ্ল্যানেড",
            roman: "Esplanade",
            en: "Esplanade",
          },
        },
        {
          npc: {
            native: "টram আসছে!",
            roman: "Tram asche!",
            en: "Tram is coming!",
          },
          prompt: {
            native: "ঠিক আছে, টram এ উঠব",
            roman: "Thik ache, tram e uthbo",
            en: "Okay, I'll board the tram",
          },
        },
        {
          npc: {
            native: "দশ টাকা",
            roman: "Dash taka",
            en: "Ten taka",
          },
          prompt: {
            native: "একটা ticket",
            roman: "Ekta ticket",
            en: "One ticket",
          },
        },
        {
          npc: {
            native: "খুচরো আছে?",
            roman: "Khuchro ache?",
            en: "Got change?",
          },
          prompt: {
            native: "হ্যাঁ, নিন",
            roman: "Hyaa, nin",
            en: "Yes, take it",
          },
        },
        {
          npc: {
            native: "যান",
            roman: "Jan",
            en: "Go",
          },
          prompt: {
            native: "ধন্যবাদ",
            roman: "Dhonnobad",
            en: "Thank you",
          },
        }
      ],
      },
    },
  ],
};

/** Authoring / seed only — runtime loads from Supabase. */
export const SEED_TASK_PACKS: DistrictTaskPack[] = [
  puraniSadak,
  marinaNagar,
  majesticCross,
  parkGully,
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
