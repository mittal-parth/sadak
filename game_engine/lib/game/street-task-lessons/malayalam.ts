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
      s("പള്ളിക്ക് പൂവ് വേണോ?", "Pallikku poovu veno?", "Flowers for the church?", "അതെ, രണ്ട് മാല", "Athe, randu maala", "Yes, two garlands"),
      s("നാല്പതിൽ എടുക്കൂ", "Naalpathil edukku", "Take it for forty", "നന്ദി, ഇതാ", "Nandi, ithaa", "Thank you, here you go"),
      s("പോയി പ്രാർത്ഥിക്കൂ", "Poyi praarththikkoo", "Go, pray", "നന്ദി", "Nandi", "Thank you"),
    ],
    medium: [
      s("പള്ളിക്ക് പൂവ് വേണോ?", "Pallikku poovu veno?", "Flowers for the church?", "അതെ, രണ്ട് മാല", "Athe, randu maala", "Yes, two garlands"),
      s("മണി മുഴങ്ങുന്നു, വേഗം!", "Mani muzhangunnu, vegam!", "The bell is ringing, hurry!", "അതെ, വേഗം", "Athe, vegam", "Yes, quickly"),
      s("പറ", "Para", "Tell me", "എത്ര?", "Ethra?", "How much?"),
      s("അമ്പത് രൂപ", "Ambathu roopa", "Fifty rupees", "നാല്പതിൽ തരൂ", "Naalpathil tharoo", "Give it for forty"),
      s("നാല്പതിൽ എടുക്കൂ", "Naalpathil edukku", "Take it for forty", "നന്ദി, ഇതാ", "Nandi, ithaa", "Thank you, here you go"),
    ],
    hard: [
      s("പള്ളിക്ക് പൂവ് വേണോ?", "Pallikku poovu veno?", "Flowers for the church?", "അതെ, രണ്ട് മാല", "Athe, randu maala", "Yes, two garlands"),
      s("മണി മുഴങ്ങുന്നു, വേഗം!", "Mani muzhangunnu, vegam!", "The bell is ringing, hurry!", "അതെ, വേഗം", "Athe, vegam", "Yes, quickly"),
      s("പറ", "Para", "Tell me", "എത്ര?", "Ethra?", "How much?"),
      s("അമ്പത് രൂപ", "Ambathu roopa", "Fifty rupees", "നാല്പതിൽ തരൂ", "Naalpathil tharoo", "Give it for forty"),
      s("വേറെ എന്തെങ്കിലും?", "Vere enthenkilum?", "Need anything else?", "ഇല്ല, ഇത്രെ", "Illa, ithre", "No, just this"),
      s("നാല്പതിൽ എടുക്കൂ", "Naalpathil edukku", "Take it for forty", "നന്ദി, ഇതാ", "Nandi, ithaa", "Thank you, here you go"),
      s("പോ", "Po", "Go", "നന്ദി", "Nandi", "Thank you"),
    ],
  },
  "fort-kochi-bus": {
    easy: [
      s("എവിടെ?", "Evide?", "Where to?", "Fort Kochi", "Fort Kochi", "Fort Kochi"),
      s("ഇരുപത് രൂപ", "Irupathu roopa", "Twenty rupees", "ഇതാ", "Ithaa", "Here you go"),
      s("ഇതാ, ticket", "Ithaa, ticket", "Here, your ticket", "നന്ദി", "Nandi", "Thank you"),
    ],
    medium: [
      s("എവിടെ?", "Evide?", "Where to?", "Fort Kochi", "Fort Kochi", "Fort Kochi"),
      s("പുറകിൽ നിന്ന് കയറൂ, തിരക്കുണ്ട്", "Purakil ninnu kayaroo, thirakku undu", "Board from the back, it's crowded", "ശരി, പുറകിൽ നിന്ന് കയരാം", "Shari, purakil ninnu kayaraam", "Okay, I'll board from the back"),
      s("അതെ, പറ", "Athe, para", "Yes, tell me", "എത്ര?", "Ethra?", "How much?"),
      s("ഇരുപത് രൂപ", "Irupathu roopa", "Twenty rupees", "ഇതാ", "Ithaa", "Here you go"),
      s("ഇതാ, ticket", "Ithaa, ticket", "Here, your ticket", "നന്ദി", "Nandi", "Thank you"),
    ],
    hard: [
      s("എവിടെ?", "Evide?", "Where to?", "Fort Kochi", "Fort Kochi", "Fort Kochi"),
      s("പുറകിൽ നിന്ന് കയറൂ, തിരക്കുണ്ട്", "Purakil ninnu kayaroo, thirakku undu", "Board from the back, it's crowded", "ശരി, പുറകിൽ നിന്ന് കയരാം", "Shari, purakil ninnu kayaraam", "Okay, I'll board from the back"),
      s("അതെ, പറ", "Athe, para", "Yes, tell me", "ഒരു ticket", "Oru ticket", "One ticket, please"),
      s("പറ", "Para", "Tell me", "എത്ര?", "Ethra?", "How much?"),
      s("ഇരുപത് രൂപ", "Irupathu roopa", "Twenty rupees", "ഇതാ", "Ithaa", "Here you go"),
      s("ചില്ലറ ഉണ്ടോ?", "Chillar undo?", "Do you have change?", "അതെ, ഇതാ", "Athe, ithaa", "Yes, here you go"),
      s("ഇതാ, ticket", "Ithaa, ticket", "Here, your ticket", "നന്ദി", "Nandi", "Thank you"),
    ],
  },
};
