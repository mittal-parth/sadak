import type { StreetTaskLessons } from "./types";
import { s } from "./types";

export const LESSONS: Record<string, StreetTaskLessons> = {
  "fort-kochi-auto": {
    easy: [
      s("എവിടെ പോകണം?", "Evide pokanam?", "Where do you want to go?", "എറണാകുളം South", "Ernakulam South", "Ernakulam South"),
      s("ശരി, എത്ര തരും?", "Shari, ethra tarum?", "Fine, what will you pay?", "ഒന്നര നൂറ്?", "Onnara nooru?", "Will you go for 150?"),
      s("വാ, കയറ്", "Vaa, kayar", "Come on, get in", "നന്ദി, പോകാം", "Nandi, pokam", "Thank you, let's go"),
    ],
    medium: [
      s("എവിടെ പോകണം?", "Evide pokanam?", "Where do you want to go?", "എറണാകുളം South", "Ernakulam South", "Ernakulam South"),
      s("മൂന്നൂറ്റ്! petrol വില കൂടി", "Moonnooru! petrol vila koodi", "Three hundred! Petrol price is up", "മനസ്സിലായി, കുറച്ച് കുറയ്ക്കൂ", "Manassilaayi, kurachu kuraykku", "I understand, please reduce it a bit"),
      s("ശരി, പറ", "Shari, para", "Fine, tell me", "എത്ര?", "Ethra?", "How much?"),
      s("ശരി, എത്ര തരും?", "Shari, ethra tarum?", "Fine, what will you pay?", "ഒന്നര നൂറ്?", "Onnara nooru?", "Will you go for 150?"),
      s("വാ, കയറ്", "Vaa, kayar", "Come on, get in", "നന്ദി, പോകാം", "Nandi, pokam", "Thank you, let's go"),
    ],
    hard: [
      s("എവിടെ പോകണം?", "Evide pokanam?", "Where do you want to go?", "എറണാകുളം South", "Ernakulam South", "Ernakulam South"),
      s("ഇന്ന് തിരക്ക് കൂടുതലാണ്", "Innu thirakku kooduthalaanu", "It's very crowded today", "അതെ, എനിക്ക് തിരക്കാണ്", "Athe, enikku thirakkaanu", "Yes, I'm in a hurry"),
      s("മൂന്നൂറ്റ്! petrol വില കൂടി", "Moonnooru! petrol vila koodi", "Three hundred! Petrol price is up", "മനസ്സിലായി, കുറച്ച് കുറയ്ക്കൂ", "Manassilaayi, kurachu kuraykku", "I understand, please reduce it a bit"),
      s("ശരി, പറ", "Shari, para", "Fine, tell me", "എത്ര?", "Ethra?", "How much?"),
      s("ശരി, എത്ര തരും?", "Shari, ethra tarum?", "Fine, what will you pay?", "ഒന്നര നൂറ്?", "Onnara nooru?", "Will you go for 150?"),
      s("meter ഇടാമോ?", "Meter idaamo?", "Shall we use the meter?", "ഇല്ല, fixed fare", "Illa, fixed fare", "No, fixed fare"),
      s("വാ, കയറ്", "Vaa, kayar", "Come on, get in", "നന്ദി, പോകാം", "Nandi, pokam", "Thank you, let's go"),
    ],
  },
  "fort-kochi-shop": {
    easy: [
      s("എന്താ വേണ്ട?", "Enthaa vend?", "What do you want?", "ഒരു പുട്ട്", "Oru puttu", "One puttu, please"),
      s("അയ്യോ, ആ പൂച്ച വീണ്ടും!", "Ayyo, aa poocha veendum!", "Oh no, that cat again!", "കുഴപ്പമില്ല, puttu തരൂ", "Kuzhappamilla, puttu tharoo", "No problem, give me the puttu"),
      s("നാല്പത് രൂപ", "Naalpathu roopa", "Forty rupees", "ഇതാ, നന്ദി", "Ithaa, nandi", "Here you go, thank you"),
    ],
    medium: [
      s("എന്താ വേണ്ട?", "Enthaa vend?", "What do you want?", "ഒരു പുട്ട്", "Oru puttu", "One puttu, please"),
      s("chai കൂടെ?", "Chai koode?", "Chai as well?", "അതെ, ഒരു chai", "Athe, oru chai", "Yes, one chai"),
      s("ശരി", "Shari", "Okay", "എത്ര ആയി?", "Ethra aayi?", "What do I owe you?"),
      s("നാല്പത് രൂപ", "Naalpathu roopa", "Forty rupees", "ഇതാ", "Ithaa", "Here you go"),
      s("എടുക്കൂ", "Edukku", "Take it", "നന്ദി", "Nandi", "Thank you"),
    ],
    hard: [
      s("എന്താ വേണ്ട?", "Enthaa vend?", "What do you want?", "ഒരു പുട്ട്", "Oru puttu", "One puttu, please"),
      s("chai കൂടെ?", "Chai koode?", "Chai as well?", "അതെ, ഒരു chai", "Athe, oru chai", "Yes, one chai"),
      s("പട്ടání കൂടെ?", "Pattani koode?", "Kadala curry with it?", "അതെ, കൂടെ തരൂ", "Athe, koode tharoo", "Yes, give it with that"),
      s("പറ", "Para", "Tell me", "എത്ര ആയി?", "Ethra aayi?", "What do I owe you?"),
      s("നാല്പത് രൂപ", "Naalpathu roopa", "Forty rupees", "ഇതാ", "Ithaa", "Here you go"),
      s("വേറെ എന്തെങ്കിലും?", "Vere enthenkilum?", "Anything else?", "ഇല്ല, ഇത്രെ", "Illa, ithre", "No, that's all"),
      s("എടുക്കൂ", "Edukku", "Take it", "നന്ദി", "Nandi", "Thank you"),
    ],
  },
  "fort-kochi-temple": {
    easy: [
      s("മെഴുകുതിരി വേണോ?", "Mezhukuthiri veno?", "Do you want candles?", "അതെ, രണ്ടെണ്ണം", "Athe, randennam", "Yes, two"),
      s("മുപ്പത് രൂപ", "Muppathu roopa", "Thirty rupees", "ഇതാ, നന്ദി", "Ithaa, nandi", "Here you go, thank you"),
      s("മുന്നിൽ കത്തിച്ചു വെക്കൂ", "Munnil kathichu vekkoo", "Light them at the front", "ശരി, നന്ദി", "Shari, nandi", "Okay, thank you"),
    ],
    medium: [
      s("മെഴുകുതിരി വേണോ?", "Mezhukuthiri veno?", "Do you want candles?", "അതെ, രണ്ടെണ്ണം", "Athe, randennam", "Yes, two"),
      s("കുർബാന തുടങ്ങാറായി", "Kurbaana thudangaaraayi", "Mass is about to start", "എങ്കിൽ വേഗം", "Enkil vegam", "Then quickly"),
      s("ശരി", "Shari", "Okay", "എത്ര?", "Ethra?", "How much?"),
      s("മുപ്പത് രൂപ", "Muppathu roopa", "Thirty rupees", "ഇതാ, നന്ദി", "Ithaa, nandi", "Here you go, thank you"),
      s("മുന്നിൽ കത്തിച്ചു വെക്കൂ", "Munnil kathichu vekkoo", "Light them at the front", "ശരി, നന്ദി", "Shari, nandi", "Okay, thank you"),
    ],
    hard: [
      s("മെഴുകുതിരി വേണോ?", "Mezhukuthiri veno?", "Do you want candles?", "അതെ, രണ്ടെണ്ണം", "Athe, randennam", "Yes, two"),
      s("വലുതോ ചെറുതോ?", "Valutho cherutho?", "Big or small?", "രണ്ട് വലുത്", "Randu valuthu", "Two big ones"),
      s("കുർബാന തുടങ്ങാറായി", "Kurbaana thudangaaraayi", "Mass is about to start", "എങ്കിൽ വേഗം", "Enkil vegam", "Then quickly"),
      s("തീപ്പെട്ടി ഉണ്ടോ?", "Theeppetti undo?", "Do you have matches?", "ഇല്ല, ഒന്ന് തരൂ", "Illa, onnu tharoo", "No, give me one"),
      s("ശരി", "Shari", "Okay", "എത്ര?", "Ethra?", "How much?"),
      s("മുപ്പത് രൂപ", "Muppathu roopa", "Thirty rupees", "ഇതാ, നന്ദി", "Ithaa, nandi", "Here you go, thank you"),
      s("മുന്നിൽ കത്തിച്ചു വെക്കൂ", "Munnil kathichu vekkoo", "Light them at the front", "ശരി, നന്ദി", "Shari, nandi", "Okay, thank you"),
    ],
  },
  "fort-kochi-bus": {
    easy: [
      s("എവിടെ?", "Evide?", "Where to?", "മട്ടാഞ്ചേരി", "Mattancherry", "Mattancherry"),
      s("ഇരുപത് രൂപ", "Irupathu roopa", "Twenty rupees", "ഇതാ", "Ithaa", "Here you go"),
      s("ഇതാ, ticket", "Ithaa, ticket", "Here, your ticket", "നന്ദി", "Nandi", "Thank you"),
    ],
    medium: [
      s("എവിടെ?", "Evide?", "Where to?", "മട്ടാഞ്ചേരി", "Mattancherry", "Mattancherry"),
      s("പുറകിൽ നിന്ന് കയറൂ, തിരക്കുണ്ട്", "Purakil ninnu kayaroo, thirakkundu", "Board from the back, it's crowded", "ശരി, പുറകിൽ നിന്ന് കയരാം", "Shari, purakil ninnu kayaraam", "Okay, I'll board from the back"),
      s("അതെ, പറ", "Athe, para", "Yes, tell me", "എത്ര?", "Ethra?", "How much?"),
      s("ഇരുപത് രൂപ", "Irupathu roopa", "Twenty rupees", "ഇതാ", "Ithaa", "Here you go"),
      s("ഇതാ, ticket", "Ithaa, ticket", "Here, your ticket", "നന്ദി", "Nandi", "Thank you"),
    ],
    hard: [
      s("എവിടെ?", "Evide?", "Where to?", "മട്ടാഞ്ചേരി", "Mattancherry", "Mattancherry"),
      s("പുറകിൽ നിന്ന് കയറൂ, തിരക്കുണ്ട്", "Purakil ninnu kayaroo, thirakkundu", "Board from the back, it's crowded", "ശരി, പുറകിൽ നിന്ന് കയരാം", "Shari, purakil ninnu kayaraam", "Okay, I'll board from the back"),
      s("അതെ, പറ", "Athe, para", "Yes, tell me", "ഒരു ticket", "Oru ticket", "One ticket, please"),
      s("പറ", "Para", "Tell me", "എത്ര?", "Ethra?", "How much?"),
      s("ഇരുപത് രൂപ", "Irupathu roopa", "Twenty rupees", "ഇതാ", "Ithaa", "Here you go"),
      s("ചില്ലറ ഉണ്ടോ?", "Chillar undo?", "Do you have change?", "അതെ, ഇതാ", "Athe, ithaa", "Yes, here you go"),
      s("ഇതാ, ticket", "Ithaa, ticket", "Here, your ticket", "നന്ദി", "Nandi", "Thank you"),
    ],
  },
  "fort-kochi-ferry": {
    easy: [
      s("എവിടെ പോകണം?", "Evide pokanam?", "Where do you want to go?", "വൈപ്പിൻ", "Vypin", "Vypin"),
      s("ബോട്ട് ഇപ്പോൾ വരും", "Boat ippol varum", "The boat is coming now", "ശരി, ടിക്കറ്റ് തരൂ", "Shari, ticket tharoo", "Okay, give me a ticket"),
      s("ആറ് രൂപ", "Aaru roopa", "Six rupees", "ഇതാ, നന്ദി", "Ithaa, nandi", "Here you go, thank you"),
    ],
    medium: [
      s("എവിടെ പോകണം?", "Evide pokanam?", "Where do you want to go?", "വൈപ്പിൻ", "Vypin", "Vypin"),
      s("എത്ര പേർ?", "Ethra per?", "How many people?", "ഒരാൾ", "Oraal", "One person"),
      s("ബോട്ട് ഇപ്പോൾ വരും", "Boat ippol varum", "The boat is coming now", "ശരി, ടിക്കറ്റ് തരൂ", "Shari, ticket tharoo", "Okay, give me a ticket"),
      s("ശരി", "Shari", "Okay", "എത്ര ആയി?", "Ethra aayi?", "What do I owe you?"),
      s("ആറ് രൂപ", "Aaru roopa", "Six rupees", "ഇതാ, നന്ദി", "Ithaa, nandi", "Here you go, thank you"),
    ],
    hard: [
      s("എവിടെ പോകണം?", "Evide pokanam?", "Where do you want to go?", "വൈപ്പിൻ", "Vypin", "Vypin"),
      s("എത്ര പേർ?", "Ethra per?", "How many people?", "ഒരാൾ", "Oraal", "One person"),
      s("ചില്ലറ ഉണ്ടോ?", "Chillara undo?", "Do you have change?", "ഉണ്ട്, ഇതാ", "Undu, ithaa", "Yes, here"),
      s("ബോട്ട് ഇപ്പോൾ വരും", "Boat ippol varum", "The boat is coming now", "ശരി, ടിക്കറ്റ് തരൂ", "Shari, ticket tharoo", "Okay, give me a ticket"),
      s("വേഗം, ബോട്ട് പോകുന്നു!", "Vegam, boat pokunnu!", "Hurry, the boat is leaving!", "ശരി, നന്ദി", "Shari, nandi", "Okay, thank you"),
      s("ശരി", "Shari", "Okay", "എത്ര ആയി?", "Ethra aayi?", "What do I owe you?"),
      s("ആറ് രൂപ", "Aaru roopa", "Six rupees", "ഇതാ, നന്ദി", "Ithaa, nandi", "Here you go, thank you"),
    ],
  },
  "fort-kochi-barber": {
    easy: [
      s("വരൂ, ഇരിക്കൂ. എന്താ വേണ്ടത്?", "Varoo, irikkoo. Enthaa vendath?", "Come, sit. What do you need?", "മുടി വെട്ടിത്തരൂ", "Mudi vettitharoo", "Please cut my hair"),
      s("ശരി, കുറച്ച് കാത്തിരിക്കണം", "Shari, kurachu kaathirikkanam", "Okay, you'll have to wait a little", "എത്ര സമയം എടുക്കും?", "Ethra samayam edukkum?", "How long will it take?"),
      s("പത്ത് മിനിറ്റ്", "Pathu minute", "Ten minutes", "ശരി, കാത്തിരിക്കാം", "Shari, kaathirikkaam", "Okay, I'll wait"),
    ],
    medium: [
      s("വരൂ, ഇരിക്കൂ. എന്താ വേണ്ടത്?", "Varoo, irikkoo. Enthaa vendath?", "Come, sit. What do you need?", "മുടി വെട്ടിത്തരൂ", "Mudi vettitharoo", "Please cut my hair"),
      s("ശരി, കുറച്ച് കാത്തിരിക്കണം", "Shari, kurachu kaathirikkanam", "Okay, you'll have to wait a little", "എത്ര സമയം എടുക്കും?", "Ethra samayam edukkum?", "How long will it take?"),
      s("പത്ത് മിനിറ്റ്", "Pathu minute", "Ten minutes", "ശരി, കാത്തിരിക്കാം", "Shari, kaathirikkaam", "Okay, I'll wait"),
      s("കഴിഞ്ഞു. എങ്ങനെയുണ്ട്?", "Kazhinju. Enganeyundu?", "Done. How does it look?", "നന്നായിട്ടുണ്ട്! എത്രയായി?", "Nannaayittundu! Ethrayaayi?", "Very nice! How much?"),
      s("എൺപത് രൂപ", "Enpathu roopa", "Eighty rupees", "ഇതാ, നന്ദി", "Ithaa, nandi", "Here you go, thank you"),
    ],
    hard: [
      s("വരൂ, ഇരിക്കൂ. എന്താ വേണ്ടത്?", "Varoo, irikkoo. Enthaa vendath?", "Come, sit. What do you need?", "മുടി വെട്ടിത്തരൂ", "Mudi vettitharoo", "Please cut my hair"),
      s("ശരി, കുറച്ച് കാത്തിരിക്കണം", "Shari, kurachu kaathirikkanam", "Okay, you'll have to wait a little", "എത്ര സമയം എടുക്കും?", "Ethra samayam edukkum?", "How long will it take?"),
      s("പത്ത് മിനിറ്റ്", "Pathu minute", "Ten minutes", "ശരി, കാത്തിരിക്കാം", "Shari, kaathirikkaam", "Okay, I'll wait"),
      s("നന്നായി കുറയ്ക്കണോ, ചെറുതായി മതിയോ?", "Nannaayi kuraykkano, cheruthaayi mathiyo?", "Short, or just a trim?", "ചെറുതായി മതി", "Cheruthaayi mathi", "Just a trim"),
      s("ഷേവും ചെയ്യണോ?", "Shavum cheyyano?", "Shave as well?", "വേണ്ട, മുടി മാത്രം", "Venda, mudi maathram", "No, just the haircut"),
      s("കഴിഞ്ഞു. എങ്ങനെയുണ്ട്?", "Kazhinju. Enganeyundu?", "Done. How does it look?", "നന്നായിട്ടുണ്ട്! എത്രയായി?", "Nannaayittundu! Ethrayaayi?", "Very nice! How much?"),
      s("എൺപത് രൂപ", "Enpathu roopa", "Eighty rupees", "ഇതാ, നന്ദി", "Ithaa, nandi", "Here you go, thank you"),
    ],
  },
  "fort-kochi-catch": {
    easy: [
      s("നല്ല മീൻ ഉണ്ട്, വേണോ?", "Nalla meen undu, veno?", "Good fish here, want some?", "ഒരു കിലോ കരിമീൻ", "Oru kilo karimeen", "One kilo of karimeen"),
      s("ഇപ്പോൾ വലയിൽ നിന്ന്", "Ippol valayil ninnu", "Straight out of the net", "എത്ര ആയി?", "Ethra aayi?", "How much?"),
      s("നാനൂറ് രൂപ", "Naanooru roopa", "Four hundred rupees", "ഇതാ, നന്ദി", "Ithaa, nandi", "Here you go, thank you"),
    ],
    medium: [
      s("നല്ല മീൻ ഉണ്ട്, വേണോ?", "Nalla meen undu, veno?", "Good fish here, want some?", "ഒരു കിലോ കരിമീൻ", "Oru kilo karimeen", "One kilo of karimeen"),
      s("ഇപ്പോൾ വലയിൽ നിന്ന്", "Ippol valayil ninnu", "Straight out of the net", "ശരി, വൃത്തിയാക്കി തരുമോ?", "Shari, vruthiyaakki tharumo?", "Okay, will you clean it?"),
      s("തരാം, കുറച്ച് നിൽക്കൂ", "Tharaam, kurachu nilkkoo", "I will, wait a little", "ശരി, എത്ര ആയി?", "Shari, ethra aayi?", "Okay, how much?"),
      s("നാനൂറ് രൂപ", "Naanooru roopa", "Four hundred rupees", "മുന്നൂറ്റമ്പത് തരാം", "Munnoottampathu tharaam", "I'll give three hundred and fifty"),
      s("ശരി, എടുത്തോ", "Shari, eduttho", "Fine, take it", "ഇതാ, നന്ദി", "Ithaa, nandi", "Here you go, thank you"),
    ],
    hard: [
      s("നല്ല മീൻ ഉണ്ട്, വേണോ?", "Nalla meen undu, veno?", "Good fish here, want some?", "ഒരു കിലോ കരിമീൻ", "Oru kilo karimeen", "One kilo of karimeen"),
      s("ഇപ്പോൾ വലയിൽ നിന്ന്", "Ippol valayil ninnu", "Straight out of the net", "ശരി, വൃത്തിയാക്കി തരുമോ?", "Shari, vruthiyaakki tharumo?", "Okay, will you clean it?"),
      s("തരാം, കുറച്ച് നിൽക്കൂ", "Tharaam, kurachu nilkkoo", "I will, wait a little", "ശരി, എത്ര ആയി?", "Shari, ethra aayi?", "Okay, how much?"),
      s("നാനൂറ് രൂപ", "Naanooru roopa", "Four hundred rupees", "മുന്നൂറ്റമ്പത് തരാം", "Munnoottampathu tharaam", "I'll give three hundred and fifty"),
      s("ശരി, എടുത്തോ", "Shari, eduttho", "Fine, take it", "ഇതാ, അഞ്ഞൂറ്", "Ithaa, anjooru", "Here, five hundred"),
      s("ചില്ലറ ഉണ്ടോ?", "Chillara undo?", "Do you have change?", "ഇല്ല, ക്ഷമിക്കണം", "Illa, kshamikkanam", "No, sorry"),
      s("ശരി, ബാക്കി ഇതാ", "Shari, baakki ithaa", "Okay, here's your change", "നന്ദി", "Nandi", "Thank you"),
    ],
  },
};
