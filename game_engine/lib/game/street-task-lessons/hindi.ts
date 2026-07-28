import type { StreetTaskLessons } from "./types";
import { s } from "./types";

export const LESSONS: Record<string, StreetTaskLessons> = {
  "purani-sadak-auto": {
    easy: [
      s("कहाँ जाना है?", "Kahaan jaana hai?", "Where do you want to go?", "नई दिल्ली रेलवे स्टेशन", "Nayi Dilli railway station", "New Delhi railway station"),
      s("ठीक है, कितने दोगे?", "Theek hai, kitne doge?", "Fine, what will you pay?", "डेढ़ सौ में चलोगे?", "Dedh sau mein chaloge?", "Will you go for 150?"),
      s("चलो, बैठ जाओ", "Chalo, baith jao", "Come on, get in", "धन्यवाद, चलिए", "Dhanyavaad, chaliye", "Thank you, let's go"),
    ],
    medium: [
      s("कहाँ जाना है?", "Kahaan jaana hai?", "Where do you want to go?", "नई दिल्ली रेलवे स्टेशन", "Nayi Dilli railway station", "New Delhi railway station"),
      s("तीन सौ! पेट्रोल महंगा है भाई", "Teen sau! Petrol mehenga hai bhai", "Three hundred! Petrol is expensive, brother", "हाँ समझा, पर थोड़ा कम कीजिए", "Haan samjha, par thoda kam kijiye", "I understand, but please reduce it a bit"),
      s("ठीक है, बताओ", "Theek hai, batao", "Fine, tell me", "कितने का है?", "Kitne ka hai?", "How much is it?"),
      s("ठीक है, कितने दोगे?", "Theek hai, kitne doge?", "Fine, what will you pay?", "डेढ़ सौ में चलोगे?", "Dedh sau mein chaloge?", "Will you go for 150?"),
      s("चलो, बैठ जाओ", "Chalo, baith jao", "Come on, get in", "धन्यवाद, चलिए", "Dhanyavaad, chaliye", "Thank you, let's go"),
    ],
    hard: [
      s("कहाँ जाना है?", "Kahaan jaana hai?", "Where do you want to go?", "नई दिल्ली रेलवे स्टेशन", "Nayi Dilli railway station", "New Delhi railway station"),
      s("भीड़ बहुत है आज", "Bheed bahut hai aaj", "It's very crowded today", "हाँ, जल्दी है", "Haan, jaldi hai", "Yes, I'm in a hurry"),
      s("तीन सौ! पेट्रोल महंगा है भाई", "Teen sau! Petrol mehenga hai bhai", "Three hundred! Petrol is expensive, brother", "हाँ समझा, पर थोड़ा कम कीजिए", "Haan samjha, par thoda kam kijiye", "I understand, but please reduce it a bit"),
      s("ठीक है, बताओ", "Theek hai, batao", "Fine, tell me", "कितने का है?", "Kitne ka hai?", "How much is it?"),
      s("ठीक है, कितने दोगे?", "Theek hai, kitne doge?", "Fine, what will you pay?", "डेढ़ सौ में चलोगे?", "Dedh sau mein chaloge?", "Will you go for 150?"),
      s("मीटर से चलोगे?", "Meter se chaloge?", "Will you go by meter?", "नहीं, पक्का किराया", "Nahin, pakka kiraya", "No, fixed fare"),
      s("चलो, बैठ जाओ", "Chalo, baith jao", "Come on, get in", "धन्यवाद, चलिए", "Dhanyavaad, chaliye", "Thank you, let's go"),
    ],
  },
  "purani-sadak-shop": {
    easy: [
      s("क्या लेंगे?", "Kya lenge?", "What will you have?", "दो कचौड़ी दीजिए", "Do kachaudi dijiye", "Two kachoris, please"),
      s("अरे, वो बिल्ली फिर आ गई!", "Arre, wo billi phir aa gayi!", "Hey, that cat is back again!", "कोई बात नहीं, कचौड़ी दीजिए", "Koi baat nahin, kachaudi dijiye", "No problem, give me the kachoris"),
      s("चालीस रुपये", "Chalees rupaye", "Forty rupees", "ये लीजिए, धन्यवाद", "Ye lijiye, dhanyavaad", "Here you go, thank you"),
    ],
    medium: [
      s("क्या लेंगे?", "Kya lenge?", "What will you have?", "दो कचौड़ी दीजिए", "Do kachaudi dijiye", "Two kachoris, please"),
      s("चाय भी?", "Chai bhi?", "Chai as well?", "हाँ, एक कटिंग चाय", "Haan, ek cutting chai", "Yes, one cutting chai"),
      s("ठीक है", "Theek hai", "Okay", "कितने पैसे हुए?", "Kitne paise hue?", "What do I owe you?"),
      s("चालीस रुपये", "Chalees rupaye", "Forty rupees", "ये लीजिए", "Ye lijiye", "Here you go"),
      s("ले लीजिए", "Le lijiye", "Take it", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
    hard: [
      s("क्या लेंगे?", "Kya lenge?", "What will you have?", "दो कचौड़ी दीजिए", "Do kachaudi dijiye", "Two kachoris, please"),
      s("चाय भी?", "Chai bhi?", "Chai as well?", "हाँ, एक कटिंग चाय", "Haan, ek cutting chai", "Yes, one cutting chai"),
      s("मीठी चाय या सादी?", "Meethi chai ya saadi?", "Sweet tea or plain?", "सादी चाय", "Saadi chai", "Plain tea"),
      s("बताइए", "Bataiye", "Tell me", "कितने पैसे हुए?", "Kitne paise hue?", "What do I owe you?"),
      s("चालीस रुपये", "Chalees rupaye", "Forty rupees", "ये लीजिए", "Ye lijiye", "Here you go"),
      s("और कुछ?", "Aur kuch?", "Anything else?", "नहीं, बस", "Nahin, bas", "No, that's all"),
      s("ले लीजिए", "Le lijiye", "Take it", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
  },
  "purani-sadak-temple": {
    easy: [
      s("मंदिर के लिए फूल?", "Mandir ke liye phool?", "Flowers for the temple?", "हाँ, दो गेंदे की माला", "Haan, do gende ki maala", "Yes, two marigold garlands"),
      s("चालीस में ले लो", "Chalees mein le lo", "Take it for forty", "धन्यवाद, ये लीजिए", "Dhanyavaad, ye lijiye", "Thank you, here you go"),
      s("जाओ, दर्शन करो", "Jao, darshan karo", "Go, take darshan", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
    medium: [
      s("मंदिर के लिए फूल?", "Mandir ke liye phool?", "Flowers for the temple?", "हाँ, दो गेंदे की माला", "Haan, do gende ki maala", "Yes, two marigold garlands"),
      s("घंटी बज रही है, जल्दी कीजिए", "Ghanti baj rahi hai, jaldi kijiye", "The bell is ringing, hurry up", "हाँ जल्दी", "Haan jaldi", "Yes, quickly"),
      s("बताइए", "Bataiye", "Tell me", "कितने का है?", "Kitne ka hai?", "How much is it?"),
      s("पचास रुपये", "Pachaas rupaye", "Fifty rupees", "चालीस में दीजिए", "Chalees mein dijiye", "Give it for forty"),
      s("चालीस में ले लो", "Chalees mein le lo", "Take it for forty", "धन्यवाद, ये लीजिए", "Dhanyavaad, ye lijiye", "Thank you, here you go"),
    ],
    hard: [
      s("मंदिर के लिए फूल?", "Mandir ke liye phool?", "Flowers for the temple?", "हाँ, दो गेंदे की माला", "Haan, do gende ki maala", "Yes, two marigold garlands"),
      s("घंटी बज रही है, जल्दी कीजिए", "Ghanti baj rahi hai, jaldi kijiye", "The bell is ringing, hurry up", "हाँ जल्दी", "Haan jaldi", "Yes, quickly"),
      s("बताइए", "Bataiye", "Tell me", "कितने का है?", "Kitne ka hai?", "How much is it?"),
      s("पचास रुपये", "Pachaas rupaye", "Fifty rupees", "चालीस में दीजिए", "Chalees mein dijiye", "Give it for forty"),
      s("और कुछ चाहिए?", "Aur kuch chahiye?", "Need anything else?", "नहीं, बस इतना", "Nahin, bas itna", "No, just this"),
      s("चालीस में ले लो", "Chalees mein le lo", "Take it for forty", "धन्यवाद, ये लीजिए", "Dhanyavaad, ye lijiye", "Thank you, here you go"),
      s("जाओ", "Jao", "Go", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
  },
  "purani-sadak-bus": {
    easy: [
      s("कहाँ जाना है?", "Kahaan jaana hai?", "Where are you going?", "चांदनी चौक", "Chandni Chowk", "Chandni Chowk"),
      s("बीस रुपये", "Bees rupaye", "Twenty rupees", "ये लीजिए", "Ye lijiye", "Here you go"),
      s("लो, टिकट", "Lo, ticket", "Here, your ticket", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
    medium: [
      s("कहाँ जाना है?", "Kahaan jaana hai?", "Where are you going?", "चांदनी चौक", "Chandni Chowk", "Chandni Chowk"),
      s("पीछे से चढ़ो, भीड़ है", "Peeche se chadho, bheed hai", "Board from the back, it's crowded", "ठीक है, पीछे से चढ़ता हूँ", "Theek hai, peeche se chadhta hoon", "Okay, I'll board from the back"),
      s("हाँ, बताइए", "Haan, bataiye", "Yes, tell me", "कितने का है?", "Kitne ka hai?", "How much is it?"),
      s("बीस रुपये", "Bees rupaye", "Twenty rupees", "ये लीजिए", "Ye lijiye", "Here you go"),
      s("लो, टिकट", "Lo, ticket", "Here, your ticket", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
    hard: [
      s("कहाँ जाना है?", "Kahaan jaana hai?", "Where are you going?", "चांदनी चौक", "Chandni Chowk", "Chandni Chowk"),
      s("पीछे से चढ़ो, भीड़ है", "Peeche se chadho, bheed hai", "Board from the back, it's crowded", "ठीक है, पीछे से चढ़ता हूँ", "Theek hai, peeche se chadhta hoon", "Okay, I'll board from the back"),
      s("हाँ, बताइए", "Haan, bataiye", "Yes, tell me", "एक टिकट दीजिए", "Ek ticket dijiye", "One ticket, please"),
      s("बताइए", "Bataiye", "Tell me", "कितने का है?", "Kitne ka hai?", "How much is it?"),
      s("बीस रुपये", "Bees rupaye", "Twenty rupees", "ये लीजिए", "Ye lijiye", "Here you go"),
      s("छोटे नोट हैं?", "Chhote note hain?", "Do you have small notes?", "हाँ, ये लीजिए", "Haan, ye lijiye", "Yes, here you go"),
      s("लो, टिकट", "Lo, ticket", "Here, your ticket", "धन्यवाद", "Dhanyavaad", "Thank you"),
    ],
  },
};
