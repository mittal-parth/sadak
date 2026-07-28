import type { District, Phrase, LessonStep } from "./districts";

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

const charminarPhrases: Phrase[] = [
  { native: "నమస్కారం", roman: "Namaskaram", en: "Hello" },
  { native: "ఎంత?", roman: "Enta?", en: "How much?" },
  { native: "నాకు సహాయం కావాలి", roman: "Naaku sahaayam kaavaali", en: "I need help" },
  { native: "అర్థం కాలేదు", roman: "Artham kaaledu", en: "I do not understand" },
  { native: "నెమ్మదిగా చెప్పండి", roman: "Nemmadhiga cheppandi", en: "Please say it slowly" },
  { native: "ధన్యవాదాలు", roman: "Dhanyavaadaalu", en: "Thank you" },
];

export const charminarLane: District = {
  id: "charminar-lane",
  name: "Charminar Lane",
  city: "Hyderabad",
  blurb: "Mirchi smoke, afternoon haze, and an auto gone from the old city lane.",
  coverImage: "/covers/charminar-lane.jpg",
  language: "te-IN",
  languageLabel: "Telugu",
  native: "తెలుగు",
  script: "Telugu",
  premise: `Irfan Bhai's auto, loaded with wedding biryani orders for the evening,
vanished from the lane while he was arguing about parking. Three people on this
street saw pieces of it. None of them will simply tell you.`,
  theme: {
    sky: ["#3d2a4a", "#7a4a6a", "#c97a5a", "#e8a060", "#f5c890"],
    fog: 0xd4a574,
    fogNear: 55,
    ground: 0x9a8570,
    pavement: 0xb5a590,
    plaza: 0xc4b5a0,
    tarmac: 0x353840,
    lane: 0xe8d090,
    buildings: [0xd4a574, 0xc0392b, 0x8e6a4a, 0xa8c0a0, 0xe8b4a0, 0xc9a227, 0xb5651d],
    canopies: [0xe74c3c, 0x27ae60, 0xf39c12],
    leaf: 0x3d6b34,
    trunk: 0x5b4632,
    sunColour: 0xffd090,
    sunIntensity: 1.25,
    ambient: 0.65,
    hemiSky: 0xd8c8f0,
    hemiGround: 0xa08050,
    autos: 8,
    cars: 7,
    autoCanopy: 0xf5c518,
    exposure: 1.1,
    landmark: "bengaluru",
  },
  phrases: charminarPhrases,
  npcs: [
    {
      id: "irfan",
      name: "Irfan Bhai",
      role: "Auto Driver",
      speaker: "rahul",
      colour: 0xf39c12,
      pos: [-8, -6],
      provokes: "Mocking the biryani orders or rushing him past the wedding deadline.",
      persona: `Your auto with evening biryani orders was taken from the lane.
You are panicking about the wedding caterer who prepaid. If the player is calm
and practical you give the plate: green auto TS-09-AB-4410, last seen near the mirchi stall.`,
      mission: {
        title: "Biryani Deadline",
        brief: "Calm Irfan enough to get the auto description.",
        successCriteria:
          "The player stayed calm and practical, and Irfan gave the auto colour and number plate.",
        reward: 200,
      },
      clue: "Green auto, TS-09-AB-4410, taken near the mirchi stall.",
      lesson: phrasebookLesson(charminarPhrases),
    },
    {
      id: "shabana",
      name: "Shabana",
      role: "Mirchi Bajji Seller",
      speaker: "neha",
      colour: 0xe74c3c,
      pos: [10, -11],
      provokes: "Calling her snacks 'just fried stuff' or skipping a proper order.",
      persona: `You fry mirchi bajjis and saw the auto leave. You won't talk to
someone who won't buy properly. Order in Telugu politely and you say: two boys
in kurtas drove it toward the Charminar side gate.`,
      mission: {
        title: "Mirchi First",
        brief: "Order properly, then ask what she saw.",
        successCriteria:
          "The player ordered politely in character, and Shabana described the boys and direction.",
        reward: 200,
      },
      clue: "Two boys in kurtas took it toward the Charminar side gate.",
      lesson: phrasebookLesson(charminarPhrases),
    },
    {
      id: "nayeem",
      name: "Nayeem",
      role: "Pearl Shop Owner",
      speaker: "aditya",
      colour: 0x3498db,
      pos: [-13, 11],
      provokes: "Haggling like a tourist or treating the old city as a photo backdrop.",
      persona: `You sell pearls near the lane. You know who has the auto but you
respect discretion. Show you care about Irfan's livelihood not drama, and you
name Wasim at the scooter garage behind the mosque.`,
      mission: {
        title: "Not A Photo Op",
        brief: "Show you care about Irfan, not spectacle.",
        successCriteria:
          "The player focused on recovering the auto for Irfan, and Nayeem named Wasim and the garage.",
        reward: 200,
      },
      clue: "Wasim at the scooter garage behind the mosque has it.",
      requiresClues: 2,
      lesson: phrasebookLesson(charminarPhrases),
    },
    {
      id: "wasim",
      name: "Wasim",
      role: "Garage Mechanic",
      speaker: "kabir",
      colour: 0x2c3e50,
      pos: [13, 12],
      provokes: "Calling him a thief before hearing why the auto is there.",
      persona: `The auto is in your shop; cousins borrowed it without asking Irfan.
You fix scooters, you are not a thief. Separate you from the boys and offer a
face-saving return before the wedding, and you agree.`,
      mission: {
        title: "Cousins, Not Crooks",
        brief: "Give Wasim a way to return the auto without shame.",
        successCriteria:
          "The player distinguished Wasim from the borrowers and offered a face-saving return.",
        reward: 400,
      },
      clue: "Auto returned with biryani containers still intact.",
      requiresClues: 3,
      lesson: phrasebookLesson(charminarPhrases),
    },
  ],
  finale: {
    title: "BIRYANI SAVED",
    text: "The auto rolls back before sunset. The wedding gets its biryani. Irfan still argues about parking.",
  },
};

const fortKochiPhrases: Phrase[] = [
  { native: "നമസ്കാരം", roman: "Namaskaram", en: "Hello" },
  { native: "എത്ര?", roman: "Ethra?", en: "How much?" },
  { native: "എനിക്ക് സഹായം വേണം", roman: "Enikku sahaayam venam", en: "I need help" },
  { native: "മനസ്സിലായില്ല", roman: "Manassilaayilla", en: "I do not understand" },
  { native: "പതുക്കെ പറയൂ", roman: "Pathukke parayoo", en: "Please say it slowly" },
  { native: "നന്ദി", roman: "Nandi", en: "Thank you" },
];

export const fortKochi: District = {
  id: "fort-kochi",
  name: "Fort Kochi",
  city: "Kochi",
  blurb: "Sea breeze, Chinese nets, and a fish auto gone from the waterfront lane.",
  coverImage: "/covers/fort-kochi.jpg",
  language: "ml-IN",
  languageLabel: "Malayalam",
  native: "മലയാളം",
  script: "Malayalam",
  premise: `Saji Chettan's auto, the one that hauls ice and the morning catch to the
Chinese-net buyers, vanished from the lane while he was fixing a puncture.
Without it the fish spoils before noon. Three people on this street saw pieces
of it. The harbour is loud and nobody wants to be the one who spoke.`,
  theme: {
    sky: ["#0d4f7c", "#2e86c1", "#7fb8d8", "#cfe3ef", "#f4ecd8"],
    fog: 0xd5e2e8,
    fogNear: 75,
    ground: 0xc9b896,
    pavement: 0xbfb09a,
    plaza: 0xd4c4a8,
    tarmac: 0x3a3d42,
    lane: 0xf0ead6,
    buildings: [0xf2f0e6, 0xa8d0d8, 0xe8b4a0, 0xf5d76e, 0xc8dcc0, 0x8e6a4a, 0xd9a8b8],
    canopies: [0x2980b9, 0xf1c40f, 0x16a085],
    leaf: 0x3d7a42,
    trunk: 0x6b5340,
    sunColour: 0xfff4dc,
    sunIntensity: 1.5,
    ambient: 0.7,
    hemiSky: 0xd6ecf7,
    hemiGround: 0xc9b48a,
    autos: 7,
    cars: 6,
    autoCanopy: 0xf5c518,
    exposure: 1.18,
    landmark: "chennai",
  },
  phrases: fortKochiPhrases,
  npcs: [
    {
      id: "saji",
      name: "Saji Chettan",
      role: "Fish Auto Driver",
      speaker: "vijay",
      colour: 0x16a085,
      pos: [-8, -6],
      provokes: "Pitying him or suggesting he should have chained the auto.",
      persona: `Your green-and-yellow auto with the morning ice is gone. You are
not crying, you are calculating how much catch you will lose by ten o'clock.
If the player is practical and asks for plate and direction instead of drama,
you give it: KL-07-AB-5521, last seen near the net repair shed.`,
      mission: {
        title: "Ice Before Ten",
        brief: "Get the auto's plate and last sighting from Saji.",
        successCriteria:
          "The player stayed practical and Saji gave the auto number and where it was last seen.",
        reward: 200,
      },
      clue: "Green-yellow auto, KL-07-AB-5521, near the net repair shed.",
      lesson: phrasebookLesson(fortKochiPhrases),
    },
    {
      id: "mini",
      name: "Mini",
      role: "Puttu Stall Owner",
      speaker: "neha",
      colour: 0xe67e22,
      pos: [10, -11],
      provokes: "Ordering in English only or calling puttu 'steamed cake'.",
      persona: `You sell puttu by the lane and saw the auto leave. You will not
talk to someone who will not order properly in Malayalam. Order politely and
you say: a boy in a blue shirt drove it toward the ferry jetty.`,
      mission: {
        title: "Puttu First",
        brief: "Order at the stall, then ask what she saw.",
        successCriteria:
          "The player ordered politely in character and Mini described the driver and direction.",
        reward: 200,
      },
      clue: "Blue-shirt boy drove it toward the ferry jetty.",
      lesson: phrasebookLesson(fortKochiPhrases),
    },
    {
      id: "francis",
      name: "Francis",
      role: "Net Mender",
      speaker: "aditya",
      colour: 0x3498db,
      pos: [-13, 11],
      provokes: "Treating the nets as a photo prop or rushing past his work.",
      persona: `You mend Chinese fishing nets and know who has the auto because
he hid it behind your shed. You respect discretion. If the player shows they
want Saji's livelihood back, not a scene, you name Ramesh at the boat yard.`,
      mission: {
        title: "Respect The Nets",
        brief: "Show you care about the catch, not spectacle.",
        successCriteria:
          "The player focused on recovering the auto for Saji and Francis named Ramesh and the boat yard.",
        reward: 200,
      },
      clue: "Ramesh at the boat yard has it behind the net shed.",
      requiresClues: 2,
      lesson: phrasebookLesson(fortKochiPhrases),
    },
    {
      id: "ramesh",
      name: "Ramesh",
      role: "Boat Yard Hand",
      speaker: "kabir",
      colour: 0x2c3e50,
      pos: [13, 12],
      provokes: "Calling him a thief before hearing why the auto is there.",
      persona: `The auto is in your yard; your nephew borrowed it to haul nets
without asking Saji. You fix boats, you are not running a chop shop. Separate
you from the nephew and offer a face-saving return before the ice melts, and
you agree.`,
      mission: {
        title: "Nephew, Not Crook",
        brief: "Give Ramesh a way to return the auto without shame.",
        successCriteria:
          "The player distinguished Ramesh from the borrower and offered a face-saving return.",
        reward: 400,
      },
      clue: "Auto returned with the ice chest still full.",
      requiresClues: 3,
      lesson: phrasebookLesson(fortKochiPhrases),
    },
  ],
  finale: {
    title: "CATCH SAVED",
    text: "The auto rolls back before the ice melts. Saji says nothing about the nephew. The nets creak on.",
  },
};

const dadarChowkPhrases: Phrase[] = [
  { native: "नमस्कार", roman: "Namaskar", en: "Hello" },
  { native: "किती?", roman: "Kiti?", en: "How much?" },
  { native: "मला मदत हवी आहे", roman: "Mala madat havi aahe", en: "I need help" },
  { native: "समजले नाही", roman: "Samajle naahi", en: "I do not understand" },
  { native: "हळूहळू सांगा", roman: "Halu-halu saanga", en: "Please say it slowly" },
  { native: "धन्यवाद", roman: "Dhanyavaad", en: "Thank you" },
];

export const dadarChowk: District = {
  id: "dadar-chowk",
  name: "Dadar Chowk",
  city: "Mumbai",
  blurb: "Local trains, vada pav steam, and a share-auto gone from the square.",
  coverImage: "/covers/dadar-chowk.jpg",
  language: "mr-IN",
  languageLabel: "Marathi",
  native: "मराठी",
  script: "Devanagari",
  premise: `Sunil dada's share-auto, the one that does the Dadar–Bandra run every
morning, was taken from the chowk while he was at the station toilet. Three
people on this street saw a piece of what happened. In Mumbai nobody simply
tells a stranger anything.`,
  theme: {
    sky: ["#1b3b5a", "#4a7fa0", "#8899aa", "#c98b4b", "#f0c07a"],
    fog: 0xb8c4cc,
    fogNear: 55,
    ground: 0x8a8070,
    pavement: 0x9a9080,
    plaza: 0xa89f8f,
    tarmac: 0x33363b,
    lane: 0xd6c98a,
    buildings: [0xd9c8a9, 0x7f8c8d, 0xb5651d, 0x3498db, 0xd68f8f, 0xe8d6b3, 0x5d6d7e],
    canopies: [0xe74c3c, 0x27ae60, 0xf39c12],
    leaf: 0x2f6b34,
    trunk: 0x5b4632,
    sunColour: 0xffcf94,
    sunIntensity: 1.3,
    ambient: 0.65,
    hemiSky: 0xbfd8ef,
    hemiGround: 0x908060,
    autos: 10,
    cars: 8,
    autoCanopy: 0xf5c518,
    exposure: 1.08,
    landmark: "delhi",
  },
  phrases: dadarChowkPhrases,
  npcs: [
    {
      id: "sunil",
      name: "Sunil Dada",
      role: "Share-Auto Driver",
      speaker: "rahul",
      colour: 0xf39c12,
      pos: [-8, -6],
      provokes: "Joking about Mumbai traffic or implying he left the keys in.",
      persona: `Your share-auto is gone and forty regulars will miss the Bandra run.
You are angry at the city, not sad. If the player is direct and respects your
route, you give the plate: black-yellow MH-01-CD-7788, last seen near the bridge.`,
      mission: {
        title: "Bandra Run",
        brief: "Get Sunil to give the auto description.",
        successCriteria:
          "The player was direct and respectful and Sunil gave colour and number plate.",
        reward: 200,
      },
      clue: "Black-yellow auto, MH-01-CD-7788, near the bridge.",
      lesson: phrasebookLesson(dadarChowkPhrases),
    },
    {
      id: "prajakta",
      name: "Prajakta",
      role: "Vada Pav Stall",
      speaker: "neha",
      colour: 0xe74c3c,
      pos: [10, -11],
      provokes: "Calling it 'Indian burger' or skipping the order.",
      persona: `You fry vada pav at the chowk and saw the auto leave. You won't
chat with someone who won't buy properly. Order in Marathi and you say: two
college boys in jerseys took it toward Shivaji Park.`,
      mission: {
        title: "Vada First",
        brief: "Order properly, then ask what she saw.",
        successCriteria:
          "The player ordered politely and Prajakta described the boys and direction.",
        reward: 200,
      },
      clue: "Two boys in jerseys took it toward Shivaji Park.",
      lesson: phrasebookLesson(dadarChowkPhrases),
    },
    {
      id: "ameya",
      name: "Ameya",
      role: "Flower Vendor",
      speaker: "aditya",
      colour: 0x3498db,
      pos: [-13, 11],
      provokes: "Haggling like a tourist at Siddhivinayak season.",
      persona: `You sell garlands near the chowk. You know who has the auto but
you respect people who aren't looking for a fight. Show you want Sunil's
livelihood back and you name Kunal at the garage behind the station.`,
      mission: {
        title: "Not A Fight",
        brief: "Show you want the auto back, not a scene.",
        successCriteria:
          "The player focused on recovery for Sunil and Ameya named Kunal and the garage.",
        reward: 200,
      },
      clue: "Kunal at the garage behind the station has it.",
      requiresClues: 2,
      lesson: phrasebookLesson(dadarChowkPhrases),
    },
    {
      id: "kunal",
      name: "Kunal",
      role: "Garage Mechanic",
      speaker: "kabir",
      colour: 0x2c3e50,
      pos: [13, 12],
      provokes: "Calling him a chor before hearing why the auto is there.",
      persona: `The auto is in your shop; your younger brother borrowed it for a
match without asking Sunil. You fix bikes, you are not a thief. Separate you
from your brother and offer a face-saving return before the evening run, and
you agree.`,
      mission: {
        title: "Brother, Not Chor",
        brief: "Give Kunal a way to return the auto without shame.",
        successCriteria:
          "The player distinguished Kunal from the borrower and offered a face-saving return.",
        reward: 400,
      },
      clue: "Auto returned before the evening Bandra run.",
      requiresClues: 3,
      lesson: phrasebookLesson(dadarChowkPhrases),
    },
  ],
  finale: {
    title: "RUN RESTORED",
    text: "The share-auto is back on the Dadar stand before rush hour. Sunil still complains about the toilet queue.",
  },
};

const manekChowkPhrases: Phrase[] = [
  { native: "નમસ્તે", roman: "Namaste", en: "Hello" },
  { native: "કેટલા?", roman: "Ketlaa?", en: "How much?" },
  { native: "મને મદદ જોઈએ", roman: "Mane madad joie", en: "I need help" },
  { native: "સમજાયું નહીં", roman: "Samjaayu nahin", en: "I do not understand" },
  { native: "ધીમેથી કહો", roman: "Dheemethi kaho", en: "Please say it slowly" },
  { native: "આભાર", roman: "Aabhaar", en: "Thank you" },
];

export const manekChowk: District = {
  id: "manek-chowk",
  name: "Manek Chowk",
  city: "Ahmedabad",
  blurb: "Night-market glow, fafda crackle, and a delivery scooter gone from the square.",
  coverImage: "/covers/manek-chowk.jpg",
  language: "gu-IN",
  languageLabel: "Gujarati",
  native: "ગુજરાતી",
  script: "Gujarati",
  premise: `Jignesh bhai's delivery scooter, loaded with sweet-shop boxes for the
morning wedding orders, vanished from Manek Chowk while he was arguing about
parking. Three people on this street saw pieces of it. In the old city nobody
simply tells a stranger anything.`,
  theme: {
    sky: ["#3d2a4a", "#7a4a6a", "#c97a5a", "#e8a060", "#f5c890"],
    fog: 0xd4a574,
    fogNear: 58,
    ground: 0x9a8570,
    pavement: 0xb5a590,
    plaza: 0xc4b5a0,
    tarmac: 0x353840,
    lane: 0xe8d090,
    buildings: [0xd4a574, 0xc0392b, 0xf39c12, 0xa8c0a0, 0xe8b4a0, 0xc9a227, 0xb5651d],
    canopies: [0xe74c3c, 0x27ae60, 0xf39c12],
    leaf: 0x3d6b34,
    trunk: 0x5b4632,
    sunColour: 0xffd090,
    sunIntensity: 1.28,
    ambient: 0.64,
    hemiSky: 0xd8c8f0,
    hemiGround: 0xa08050,
    autos: 8,
    cars: 7,
    autoCanopy: 0xf5c518,
    exposure: 1.1,
    landmark: "delhi",
  },
  phrases: manekChowkPhrases,
  npcs: [
    {
      id: "jignesh",
      name: "Jignesh Bhai",
      role: "Sweet Delivery",
      speaker: "rahul",
      colour: 0xf39c12,
      pos: [-8, -6],
      provokes: "Mocking the wedding orders or rushing him past the delivery deadline.",
      persona: `Your scooter with mithai boxes for the morning wedding is gone.
You are panicking about the caterer who prepaid. If the player is calm and
practical you give the details: red scooter GJ-01-HX-3344, last seen near the
jewellery lane.`,
      mission: {
        title: "Mithai Deadline",
        brief: "Calm Jignesh enough to get the scooter description.",
        successCriteria:
          "The player stayed calm and practical and Jignesh gave colour and number plate.",
        reward: 200,
      },
      clue: "Red scooter, GJ-01-HX-3344, near the jewellery lane.",
      lesson: phrasebookLesson(manekChowkPhrases),
    },
    {
      id: "heena",
      name: "Heena",
      role: "Fafda-Jalebi Stall",
      speaker: "neha",
      colour: 0xe74c3c,
      pos: [10, -11],
      provokes: "Calling fafda 'crackers' or skipping a proper order.",
      persona: `You fry fafda and jalebi at the chowk and saw the scooter leave.
You won't talk to someone who won't buy properly. Order in Gujarati politely
and you say: two boys on another scooter towed it toward the pol gate.`,
      mission: {
        title: "Fafda First",
        brief: "Order properly, then ask what she saw.",
        successCriteria:
          "The player ordered politely and Heena described the boys and direction.",
        reward: 200,
      },
      clue: "Two boys towed it toward the pol gate on another scooter.",
      lesson: phrasebookLesson(manekChowkPhrases),
    },
    {
      id: "mitesh",
      name: "Mitesh",
      role: "Jewellery Shop",
      speaker: "aditya",
      colour: 0x3498db,
      pos: [-13, 11],
      provokes: "Haggling like a tourist or treating the pol as a backdrop.",
      persona: `You sell silver near the chowk. You know who has the scooter but
you respect discretion. Show you care about Jignesh's order not drama, and you
name Dhaval at the scooter garage behind the clock tower.`,
      mission: {
        title: "Not A Backdrop",
        brief: "Show you care about the delivery, not spectacle.",
        successCriteria:
          "The player focused on recovering the scooter for Jignesh and Mitesh named Dhaval and the garage.",
        reward: 200,
      },
      clue: "Dhaval at the garage behind the clock tower has it.",
      requiresClues: 2,
      lesson: phrasebookLesson(manekChowkPhrases),
    },
    {
      id: "dhaval",
      name: "Dhaval",
      role: "Scooter Mechanic",
      speaker: "kabir",
      colour: 0x2c3e50,
      pos: [13, 12],
      provokes: "Calling him a thief before hearing why the scooter is there.",
      persona: `The scooter is in your shop; cousins borrowed it without asking
Jignesh. You fix scooters, you are not a thief. Separate you from the cousins
and offer a face-saving return before the wedding, and you agree.`,
      mission: {
        title: "Cousins, Not Crooks",
        brief: "Give Dhaval a way to return the scooter without shame.",
        successCriteria:
          "The player distinguished Dhaval from the borrowers and offered a face-saving return.",
        reward: 400,
      },
      clue: "Scooter returned with mithai boxes still sealed.",
      requiresClues: 3,
      lesson: phrasebookLesson(manekChowkPhrases),
    },
  ],
  finale: {
    title: "MITHAI SAVED",
    text: "The scooter rolls back before the wedding breakfast. Jignesh still argues about parking.",
  },
};

const hallBazaarPhrases: Phrase[] = [
  { native: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", roman: "Sat sri akaal", en: "Hello" },
  { native: "ਕਿੰਨੇ ਦਾ?", roman: "Kinne da?", en: "How much?" },
  { native: "ਮੈਨੂੰ ਮਦਦ ਚਾਹੀਦੀ ਹੈ", roman: "Mainu madad chaahidi hai", en: "I need help" },
  { native: "ਸਮਝ ਨਹੀਂ ਆਇਆ", roman: "Samjh nahin aaya", en: "I do not understand" },
  { native: "ਹੌਲੀ ਹੌਲੀ ਦੱਸੋ", roman: "Haouli haouli daso", en: "Please say it slowly" },
  { native: "ਧੰਨਵਾਦ", roman: "Dhannvaad", en: "Thank you" },
];

export const hallBazaar: District = {
  id: "hall-bazaar",
  name: "Hall Bazaar",
  city: "Amritsar",
  blurb: "Golden Temple bells, lassi steam, and a cycle-cart gone from the bazaar lane.",
  coverImage: "/covers/hall-bazaar.jpg",
  language: "pa-IN",
  languageLabel: "Punjabi",
  native: "ਪੰਜਾਬੀ",
  script: "Gurmukhi",
  premise: `Gurpreet ji's cycle-cart, the one that carries karah prasad tins to
the gurdwara stalls before sangat arrives, was taken from Hall Bazaar while he
was in langar. Three people on this street saw a piece of what happened. In
Amritsar nobody simply tells a stranger anything.`,
  theme: {
    sky: ["#1b3b5a", "#4a7fa0", "#c98b4b", "#e8a04f", "#f0c07a"],
    fog: 0xe8c878,
    fogNear: 62,
    ground: 0xa89068,
    pavement: 0xb9a578,
    plaza: 0xc9b888,
    tarmac: 0x33363b,
    lane: 0xf0d890,
    buildings: [0xf5d76e, 0xc9a227, 0xd4af37, 0xa8c3a0, 0xe8b4a0, 0xd68f8f, 0xcfa27b],
    canopies: [0xf39c12, 0x27ae60, 0xe74c3c],
    leaf: 0x3d6b34,
    trunk: 0x5b4632,
    sunColour: 0xffe0a0,
    sunIntensity: 1.4,
    ambient: 0.68,
    hemiSky: 0xffe8c0,
    hemiGround: 0xb08040,
    autos: 8,
    cars: 6,
    autoCanopy: 0xf5c518,
    exposure: 1.14,
    landmark: "delhi",
  },
  phrases: hallBazaarPhrases,
  npcs: [
    {
      id: "gurpreet",
      name: "Gurpreet Ji",
      role: "Prasad Cart",
      speaker: "rahul",
      colour: 0xf39c12,
      pos: [-8, -6],
      provokes: "Joking about langar portions or implying he was careless.",
      persona: `Your cycle-cart with karah prasad tins is gone and sangat will
arrive in an hour. You are worried, not loud. If the player is respectful and
practical you give the details: green cart PB-02-AB-9912, last seen near the
lassi lane.`,
      mission: {
        title: "Before Sangat",
        brief: "Get Gurpreet to describe the cart.",
        successCriteria:
          "The player was respectful and practical and Gurpreet gave colour and identifying details.",
        reward: 200,
      },
      clue: "Green cart, PB-02-AB-9912, near the lassi lane.",
      lesson: phrasebookLesson(hallBazaarPhrases),
    },
    {
      id: "simran",
      name: "Simran",
      role: "Lassi Stall",
      speaker: "neha",
      colour: 0xe74c3c,
      pos: [10, -11],
      provokes: "Calling lassi 'yogurt drink' or skipping the order.",
      persona: `You churn lassi by the bazaar and saw the cart leave. You won't
talk to someone who won't buy properly. Order in Punjabi politely and you say:
two boys in white kurta took it toward the clock tower.`,
      mission: {
        title: "Lassi First",
        brief: "Order properly, then ask what she saw.",
        successCriteria:
          "The player ordered politely and Simran described the boys and direction.",
        reward: 200,
      },
      clue: "Two boys in white kurta took it toward the clock tower.",
      lesson: phrasebookLesson(hallBazaarPhrases),
    },
    {
      id: "harjeet",
      name: "Harjeet",
      role: "Kirpan Smith",
      speaker: "aditya",
      colour: 0x3498db,
      pos: [-13, 11],
      provokes: "Treating the bazaar as a photo walk only.",
      persona: `You work metal near the bazaar. You know who has the cart because
he wheeled it behind your shed. You respect people who aren't looking for a
fight. Show you want the prasad delivered and you name Balbir at the cart shed
behind Hall Gate.`,
      mission: {
        title: "Not A Photo Walk",
        brief: "Show you want the cart back for sangat, not a scene.",
        successCriteria:
          "The player focused on the prasad delivery and Harjeet named Balbir and the shed.",
        reward: 200,
      },
      clue: "Balbir at the cart shed behind Hall Gate has it.",
      requiresClues: 2,
      lesson: phrasebookLesson(hallBazaarPhrases),
    },
    {
      id: "balbir",
      name: "Balbir",
      role: "Cart Repair",
      speaker: "kabir",
      colour: 0x2c3e50,
      pos: [13, 12],
      provokes: "Calling him a thief before hearing why the cart is there.",
      persona: `The cart is in your shed; your nephew borrowed it to move steel
without asking Gurpreet. You fix carts, you are not a thief. Separate you from
your nephew and offer a face-saving return before sangat, and you agree.`,
      mission: {
        title: "Nephew, Not Thief",
        brief: "Give Balbir a way to return the cart without shame.",
        successCriteria:
          "The player distinguished Balbir from the borrower and offered a face-saving return.",
        reward: 400,
      },
      clue: "Cart returned with prasad tins still sealed.",
      requiresClues: 3,
      lesson: phrasebookLesson(hallBazaarPhrases),
    },
  ],
  finale: {
    title: "PRASAD DELIVERED",
    text: "The cart is back before sangat fills the lane. Gurpreet still says nothing about the nephew.",
  },
};

const lingarajLanePhrases: Phrase[] = [
  { native: "ନମସ୍କାର", roman: "Namaskaar", en: "Hello" },
  { native: "କେତେ?", roman: "Kete?", en: "How much?" },
  { native: "ମୋତେ ସାହାଯ୍ୟ ଦରକାର", roman: "Mote sahaayya darakaar", en: "I need help" },
  { native: "ବୁଝିଲି ନାହିଁ", roman: "Bujhili nahin", en: "I do not understand" },
  { native: "ଧୀରେ କୁହ", roman: "Dheere kuha", en: "Please say it slowly" },
  { native: "ଧନ୍ୟବାଦ", roman: "Dhanyabaad", en: "Thank you" },
];

export const lingarajLane: District = {
  id: "lingaraj-lane",
  name: "Lingaraj Lane",
  city: "Bhubaneswar",
  blurb: "Temple bells, pakhala steam, and a flower tempo gone from the lane.",
  coverImage: "/covers/lingaraj-lane.jpg",
  language: "od-IN",
  languageLabel: "Odia",
  native: "ଓଡ଼ିଆ",
  script: "Odia",
  premise: `Biju bhai's tempo, loaded with marigold garlands for Lingaraj before
the morning arati, vanished from the lane while he was at the tea stall. Three
people on this street saw pieces of it. Near the temple nobody simply tells a
stranger anything.`,
  theme: {
    sky: ["#2a1f3d", "#5a4a6a", "#8a6a5a", "#c98b6b", "#e8c8a0"],
    fog: 0xc8a888,
    fogNear: 65,
    ground: 0x9a8578,
    pavement: 0xab9688,
    plaza: 0xbcaa98,
    tarmac: 0x3a3840,
    lane: 0xe8d8b0,
    buildings: [0xd4a574, 0xc0392b, 0x8e6a4a, 0xa8c0a0, 0xe8b4a0, 0x7f8c8d, 0xb5651d],
    canopies: [0xe74c3c, 0xf39c12, 0x27ae60],
    leaf: 0x3d6b34,
    trunk: 0x5b4632,
    sunColour: 0xffc880,
    sunIntensity: 1.22,
    ambient: 0.66,
    hemiSky: 0xe8d0c0,
    hemiGround: 0x907050,
    autos: 7,
    cars: 6,
    autoCanopy: 0xf5c518,
    exposure: 1.1,
    landmark: "kolkata",
  },
  phrases: lingarajLanePhrases,
  npcs: [
    {
      id: "biju",
      name: "Biju Bhai",
      role: "Flower Tempo Driver",
      speaker: "rahul",
      colour: 0xf39c12,
      pos: [-8, -6],
      provokes: "Rushing him past arati or treating the flowers as decoration only.",
      persona: `Your tempo with garlands for Lingaraj is gone and arati is in an
hour. You are frantic about the priest who prepaid. If the player is calm and
practical you give the plate: blue tempo OD-02-AB-6610, last seen near the
pakhala stall.`,
      mission: {
        title: "Before Arati",
        brief: "Calm Biju enough to get the tempo description.",
        successCriteria:
          "The player stayed calm and practical and Biju gave colour and number plate.",
        reward: 200,
      },
      clue: "Blue tempo, OD-02-AB-6610, near the pakhala stall.",
      lesson: phrasebookLesson(lingarajLanePhrases),
    },
    {
      id: "purnima",
      name: "Purnima",
      role: "Pakhala Stall",
      speaker: "neha",
      colour: 0xe74c3c,
      pos: [10, -11],
      provokes: "Calling pakhala 'leftover rice' or skipping the order.",
      persona: `You serve pakhala by the lane and saw the tempo leave. You won't
talk to someone who won't order properly. Order in Odia politely and you say:
two boys in dhotis drove it toward the tank road gate.`,
      mission: {
        title: "Pakhala First",
        brief: "Order properly, then ask what she saw.",
        successCriteria:
          "The player ordered politely and Purnima described the boys and direction.",
        reward: 200,
      },
      clue: "Two boys in dhotis drove it toward the tank road gate.",
      lesson: phrasebookLesson(lingarajLanePhrases),
    },
    {
      id: "niranjan",
      name: "Niranjan",
      role: "Temple Flower Seller",
      speaker: "aditya",
      colour: 0x3498db,
      pos: [-13, 11],
      provokes: "Haggling during arati season or disrespect toward the shrine.",
      persona: `You sell flowers near Lingaraj. You know who has the tempo but
you respect discretion. Show you care about Biju's delivery not drama, and you
name Subhash at the garage behind the temple tank.`,
      mission: {
        title: "Respect The Shrine",
        brief: "Show you care about the garlands, not spectacle.",
        successCriteria:
          "The player focused on recovering the tempo for Biju and Niranjan named Subhash and the garage.",
        reward: 200,
      },
      clue: "Subhash at the garage behind the temple tank has it.",
      requiresClues: 2,
      lesson: phrasebookLesson(lingarajLanePhrases),
    },
    {
      id: "subhash",
      name: "Subhash",
      role: "Garage Hand",
      speaker: "kabir",
      colour: 0x2c3e50,
      pos: [13, 12],
      provokes: "Calling him a thief before hearing why the tempo is there.",
      persona: `The tempo is in your yard; cousins borrowed it without asking
Biju. You fix tempos, you are not a thief. Separate you from the cousins and
offer a face-saving return before arati, and you agree.`,
      mission: {
        title: "Cousins, Not Crooks",
        brief: "Give Subhash a way to return the tempo without shame.",
        successCriteria:
          "The player distinguished Subhash from the borrowers and offered a face-saving return.",
        reward: 400,
      },
      clue: "Tempo returned with garlands still fresh.",
      requiresClues: 3,
      lesson: phrasebookLesson(lingarajLanePhrases),
    },
  ],
  finale: {
    title: "ARATI SAVED",
    text: "The tempo rolls back before the bell. Biju still argues about tea breaks.",
  },
};

export const SIX_SEED_DISTRICTS: District[] = [
  charminarLane,
  fortKochi,
  dadarChowk,
  manekChowk,
  hallBazaar,
  lingarajLane,
];
