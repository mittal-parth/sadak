import type { StreetTaskLessons } from "./types";
import { s } from "./types";

export const LESSONS: Record<string, StreetTaskLessons> = {
  "dadar-chowk-auto": {
    easy: [
      s("कुठे जायचे?", "Kuthe jaayche?", "Where do you want to go?", "सिद्धिविनायक मंदिर", "Siddhivinayak mandir", "Siddhivinayak temple"),
      s("मीटर टाकू?", "Meetar taaku?", "Shall I start the meter?", "हो, मीटरने चला", "Ho, meetarne chala", "Yes, go by the meter"),
      s("चला, बसा", "Chala, basa", "Come on, get in", "धन्यवाद, चलू", "Dhanyavaad, chalu", "Thank you, let's go"),
    ],
    medium: [
      s("कुठे जायचे?", "Kuthe jaayche?", "Where do you want to go?", "सिद्धिविनायक मंदिर", "Siddhivinayak mandir", "Siddhivinayak temple"),
      s("मीटर टाकू?", "Meetar taaku?", "Shall I start the meter?", "हो, मीटरने चला", "Ho, meetarne chala", "Yes, go by the meter"),
      s("ठीक, सांगा", "Theek, saanga", "Fine, tell me", "साधारण किती होतील?", "Saadhaaran kiti hotil?", "Roughly how much will it be?"),
      s("पन्नास-साठ रुपये", "Pannaas-saath rupaye", "Fifty or sixty rupees", "ठीक आहे", "Theek aahe", "That's fine"),
      s("चला, बसा", "Chala, basa", "Come on, get in", "धन्यवाद, चलू", "Dhanyavaad, chalu", "Thank you, let's go"),
    ],
    hard: [
      s("कुठे जायचे?", "Kuthe jaayche?", "Where do you want to go?", "सिद्धिविनायक मंदिर", "Siddhivinayak mandir", "Siddhivinayak temple"),
      s("आज गर्दी खूप आहे", "Aaj gardi khup aahe", "It's very crowded today", "हो, घाई आहे", "Ho, ghaai aahe", "Yes, I'm in a hurry"),
      s("मीटर टाकू?", "Meetar taaku?", "Shall I start the meter?", "हो, मीटरने चला", "Ho, meetarne chala", "Yes, go by the meter"),
      s("ठीक, सांगा", "Theek, saanga", "Fine, tell me", "साधारण किती होतील?", "Saadhaaran kiti hotil?", "Roughly how much will it be?"),
      s("पन्नास-साठ रुपये", "Pannaas-saath rupaye", "Fifty or sixty rupees", "ठीक आहे", "Theek aahe", "That's fine"),
      s("सुटे पैसे आहेत ना?", "Sute paise aahet na?", "You have change, right?", "हो, आहेत", "Ho, aahet", "Yes, I do"),
      s("चला, बसा", "Chala, basa", "Come on, get in", "धन्यवाद, चलू", "Dhanyavaad, chalu", "Thank you, let's go"),
    ],
  },
  "dadar-chowk-shop": {
    easy: [
      s("काय घ्याल?", "Kaay ghyaal?", "What will you have?", "एक वडा पाव", "Ek vada pav", "One vada pav, please"),
      s("अरे, ती मांजर परत आली!", "Are, ti maanjar parat aali!", "Hey, that cat is back again!", "काही नाही, वडा पाव दे", "Kaahi naahi, vada pav de", "No problem, give me the vada pav"),
      s("चाळीस रुपये", "Chaalis rupaye", "Forty rupees", "घ्या, धन्यवाद", "Ghya, dhanyavaad", "Here you go, thank you"),
    ],
    medium: [
      s("काय घ्याल?", "Kaay ghyaal?", "What will you have?", "एक वडा पाव", "Ek vada pav", "One vada pav, please"),
      s("चहा पण?", "Chaah pan?", "Chai as well?", "हो, एक कटिंग", "Ho, ek cutting", "Yes, one cutting chai"),
      s("ठीक", "Theek", "Okay", "किती झाले?", "Kiti jhaale?", "What do I owe you?"),
      s("चाळीस रुपये", "Chaalis rupaye", "Forty rupees", "घ्या", "Ghya", "Here you go"),
      s("घ्या", "Ghya", "Take it", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
    hard: [
      s("काय घ्याल?", "Kaay ghyaal?", "What will you have?", "एक वडा पाव", "Ek vada pav", "One vada pav, please"),
      s("चहा पण?", "Chaah pan?", "Chai as well?", "हो, एक कटिंग", "Ho, ek cutting", "Yes, one cutting chai"),
      s("मसाला जास्त?", "Masala jaast?", "Extra spice?", "हो, थोडा जास्त", "Ho, thoda jaast", "Yes, a little extra"),
      s("सांग", "Saang", "Tell me", "किती झाले?", "Kiti jhaale?", "What do I owe you?"),
      s("चाळीस रुपये", "Chaalis rupaye", "Forty rupees", "घ्या", "Ghya", "Here you go"),
      s("आणखी काही?", "Aankhi kaahi?", "Anything else?", "नाही, फक्त हेच", "Naahi, fakt hech", "No, that's all"),
      s("घ्या", "Ghya", "Take it", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
  },
  "dadar-chowk-temple": {
    easy: [
      s("हनुमानासाठी फूल?", "Hanumaanaasaathi phool?", "Flowers for Hanuman?", "हो, दोन झेंडूच्या माळा", "Ho, don jhenduuchya maalaa", "Yes, two marigold garlands"),
      s("चाळीस मध्ये घ्या", "Chaalis madhye ghya", "Take it for forty", "धन्यवाद, घ्या", "Dhanyavaad, ghya", "Thank you, here you go"),
      s("जा, दर्शन घ्या", "Jaa, darshan ghya", "Go, take darshan", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
    medium: [
      s("हनुमानासाठी फूल?", "Hanumaanaasaathi phool?", "Flowers for Hanuman?", "हो, दोन झेंडूच्या माळा", "Ho, don jhenduuchya maalaa", "Yes, two marigold garlands"),
      s("घंटा वाजत आहे, लवकर!", "Ghanta vajat aahe, lavkar!", "The bell is ringing, hurry!", "हो, लवकर", "Ho, lavkar", "Yes, quickly"),
      s("सांग", "Saang", "Tell me", "किती?", "Kiti?", "How much?"),
      s("पन्नास रुपये", "Pannaas rupaye", "Fifty rupees", "चाळीस मध्ये दे", "Chaalis madhye de", "Give it for forty"),
      s("चाळीस मध्ये घ्या", "Chaalis madhye ghya", "Take it for forty", "धन्यवाद, घ्या", "Dhanyavaad, ghya", "Thank you, here you go"),
    ],
    hard: [
      s("हनुमानासाठी फूल?", "Hanumaanaasaathi phool?", "Flowers for Hanuman?", "हो, दोन झेंडूच्या माळा", "Ho, don jhenduuchya maalaa", "Yes, two marigold garlands"),
      s("घंटा वाजत आहे, लवकर!", "Ghanta vajat aahe, lavkar!", "The bell is ringing, hurry!", "हो, लवकर", "Ho, lavkar", "Yes, quickly"),
      s("सांग", "Saang", "Tell me", "किती?", "Kiti?", "How much?"),
      s("पन्नास रुपये", "Pannaas rupaye", "Fifty rupees", "चाळीस मध्ये दे", "Chaalis madhye de", "Give it for forty"),
      s("आणखी काही?", "Aankhi kaahi?", "Need anything else?", "नाही, फक्त हेच", "Naahi, fakt hech", "No, just this"),
      s("चाळीस मध्ये घ्या", "Chaalis madhye ghya", "Take it for forty", "धन्यवाद, घ्या", "Dhanyavaad, ghya", "Thank you, here you go"),
      s("जा", "Jaa", "Go", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
  },
  "dadar-chowk-bus": {
    easy: [
      s("कुठे?", "Kuthe?", "Where to?", "बांद्रा", "Bandra", "Bandra"),
      s("वीस रुपये", "Vees rupaye", "Twenty rupees", "घ्या", "Ghya", "Here you go"),
      s("घ्या, टिकिट", "Ghya, ticket", "Here, your ticket", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
    medium: [
      s("कुठे?", "Kuthe?", "Where to?", "बांद्रा", "Bandra", "Bandra"),
      s("मागून चढ, गर्दी आहे", "Magun chadh, gardi aahe", "Board from the back, it's crowded", "ठीक, मागून चढतो", "Theek, magun chadhto", "Okay, I'll board from the back"),
      s("हो, सांग", "Ho, saang", "Yes, tell me", "किती?", "Kiti?", "How much?"),
      s("वीस रुपये", "Vees rupaye", "Twenty rupees", "घ्या", "Ghya", "Here you go"),
      s("घ्या, टिकिट", "Ghya, ticket", "Here, your ticket", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
    hard: [
      s("कुठे?", "Kuthe?", "Where to?", "बांद्रा", "Bandra", "Bandra"),
      s("मागून चढ, गर्दी आहे", "Magun chadh, gardi aahe", "Board from the back, it's crowded", "ठीक, मागून चढतो", "Theek, magun chadhto", "Okay, I'll board from the back"),
      s("हो, सांग", "Ho, saang", "Yes, tell me", "एक टिकिट", "Ek ticket", "One ticket, please"),
      s("सांग", "Saang", "Tell me", "किती?", "Kiti?", "How much?"),
      s("वीस रुपये", "Vees rupaye", "Twenty rupees", "घ्या", "Ghya", "Here you go"),
      s("छोटे नोट?", "Chhote note?", "Small notes?", "हो, घ्या", "Ho, ghya", "Yes, here you go"),
      s("घ्या, टिकिट", "Ghya, ticket", "Here, your ticket", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
  },
  "dadar-chowk-local": {
    easy: [
      s("कुठे जायचे?", "Kuthe jaayche?", "Where to?", "चर्चगेट", "Churchgate", "Churchgate"),
      s("फर्स्ट क्लास की सेकंड?", "First class ki second?", "First class or second?", "सेकंड क्लास", "Second class", "Second class"),
      s("दहा रुपये", "Daha rupaye", "Ten rupees", "घ्या, धन्यवाद", "Ghya, dhanyavaad", "Here you go, thank you"),
    ],
    medium: [
      s("कुठे जायचे?", "Kuthe jaayche?", "Where to?", "चर्चगेट", "Churchgate", "Churchgate"),
      s("सिंगल की रिटर्न?", "Single ki return?", "Single or return?", "रिटर्न", "Return", "Return"),
      s("फर्स्ट क्लास की सेकंड?", "First class ki second?", "First class or second?", "सेकंड क्लास", "Second class", "Second class"),
      s("सांग", "Saang", "Tell me", "किती झाले?", "Kiti jhaale?", "What do I owe you?"),
      s("वीस रुपये", "Vees rupaye", "Twenty rupees", "घ्या, धन्यवाद", "Ghya, dhanyavaad", "Here you go, thank you"),
    ],
    hard: [
      s("कुठे जायचे?", "Kuthe jaayche?", "Where to?", "चर्चगेट", "Churchgate", "Churchgate"),
      s("सिंगल की रिटर्न?", "Single ki return?", "Single or return?", "रिटर्न", "Return", "Return"),
      s("सुट्टे पैसे द्या", "Sutte paise dya", "Give me exact change", "हो, हे घ्या", "Ho, he ghya", "Yes, here you are"),
      s("फर्स्ट क्लास की सेकंड?", "First class ki second?", "First class or second?", "सेकंड क्लास", "Second class", "Second class"),
      s("पुढची गाडी फास्ट आहे", "Pudhchi gaadi fast aahe", "The next train is a fast", "ठीक, धन्यवाद", "Theek, dhanyavaad", "Okay, thank you"),
      s("सांग", "Saang", "Tell me", "किती झाले?", "Kiti jhaale?", "What do I owe you?"),
      s("वीस रुपये", "Vees rupaye", "Twenty rupees", "घ्या, धन्यवाद", "Ghya, dhanyavaad", "Here you go, thank you"),
    ],
  },
  "dadar-chowk-barber": {
    easy: [
      s("या, बसा. काय करायचं?", "Yaa, basaa. Kaay karaaycha?", "Come, sit. What should I do?", "केस कापून द्या", "Kes kaapoon dyaa", "Please cut my hair"),
      s("ठीक आहे, थोडं थांबावं लागेल", "Thik aahe, thoda thaambaava laagel", "Alright, you'll have to wait a bit", "किती वेळ लागेल?", "Kiti vel laagel?", "How long will it take?"),
      s("दहा मिनिटं", "Daha minita", "Ten minutes", "ठीक आहे, थांबतो", "Thik aahe, thaambto", "Okay, I'll wait"),
    ],
    medium: [
      s("या, बसा. काय करायचं?", "Yaa, basaa. Kaay karaaycha?", "Come, sit. What should I do?", "केस कापून द्या", "Kes kaapoon dyaa", "Please cut my hair"),
      s("ठीक आहे, थोडं थांबावं लागेल", "Thik aahe, thoda thaambaava laagel", "Alright, you'll have to wait a bit", "किती वेळ लागेल?", "Kiti vel laagel?", "How long will it take?"),
      s("दहा मिनिटं", "Daha minita", "Ten minutes", "ठीक आहे, थांबतो", "Thik aahe, thaambto", "Okay, I'll wait"),
      s("झालं. कसं वाटतंय?", "Jhaala. Kasa vaatatay?", "Done. How does it look?", "छान झालं! किती झाले?", "Chhaan jhaala! Kiti jhaale?", "Very nice! How much?"),
      s("ऐंशी रुपये", "Aimshi rupaye", "Eighty rupees", "हे घ्या, धन्यवाद", "He ghyaa, dhanyavaad", "Here you go, thank you"),
    ],
    hard: [
      s("या, बसा. काय करायचं?", "Yaa, basaa. Kaay karaaycha?", "Come, sit. What should I do?", "केस कापून द्या", "Kes kaapoon dyaa", "Please cut my hair"),
      s("ठीक आहे, थोडं थांबावं लागेल", "Thik aahe, thoda thaambaava laagel", "Alright, you'll have to wait a bit", "किती वेळ लागेल?", "Kiti vel laagel?", "How long will it take?"),
      s("दहा मिनिटं", "Daha minita", "Ten minutes", "ठीक आहे, थांबतो", "Thik aahe, thaambto", "Okay, I'll wait"),
      s("बारीक करू की थोडे कमी?", "Baarik karu ki thode kami?", "Short, or just a trim?", "थोडे कमी करा", "Thode kami kara", "Just a trim"),
      s("दाढी पण करू?", "Daadhi pan karu?", "Shave as well?", "नको, फक्त केस", "Nako, fakt kes", "No, just the haircut"),
      s("झालं. कसं वाटतंय?", "Jhaala. Kasa vaatatay?", "Done. How does it look?", "छान झालं! किती झाले?", "Chhaan jhaala! Kiti jhaale?", "Very nice! How much?"),
      s("ऐंशी रुपये", "Aimshi rupaye", "Eighty rupees", "हे घ्या, धन्यवाद", "He ghyaa, dhanyavaad", "Here you go, thank you"),
    ],
  },
};
