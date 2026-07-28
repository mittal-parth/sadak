import type { LessonStep } from "@/lib/game/districts";
import type { LessonTier } from "@/lib/game/levels";

export type StreetTaskLessons = Record<LessonTier, LessonStep[]>;

function s(
  nNative: string,
  nRoman: string,
  nEn: string,
  pNative: string,
  pRoman: string,
  pEn: string,
): LessonStep {
  return {
    npc: { native: nNative, roman: nRoman, en: nEn },
    prompt: { native: pNative, roman: pRoman, en: pEn },
  };
}

/** Graded street-errand dialogue (#40): easy 3 / medium 5 / hard 7 steps, causal order. */
export const STREET_TASK_LESSONS: Record<string, StreetTaskLessons> = {
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
  "marina-nagar-auto": {
    easy: [
      s("எங்க போகணும்?", "Enga poganum?", "Where do you need to go?", "டி நகர்", "T Nagar", "T Nagar"),
      s("இவரும் டி நகர் தான்!", "Ivarum T Nagar dhaan!", "This person is also going to T Nagar!", "சரி, பகிர்ந்து போகலாம்", "Sari, pagirndhu pogalaam", "Okay, we can share the ride"),
      s("சரி, ஏறுங்க", "Sari, erunga", "Okay, get in", "நன்றி", "Nandri", "Thank you"),
    ],
    medium: [
      s("எங்க போகணும்?", "Enga poganum?", "Where do you need to go?", "டி நகர்", "T Nagar", "T Nagar"),
      s("இவரும் டி நகர் தான்!", "Ivarum T Nagar dhaan!", "This person is also going to T Nagar!", "சரி, பகிர்ந்து போகலாம்", "Sari, pagirndhu pogalaam", "Okay, we can share the ride"),
      s("சரி", "Sari", "Okay", "எவ்வளவு?", "Evvalavu?", "How much?"),
      s("எழுபது ரூபாய்", "Ezhupathi rupaai", "Seventy rupees", "சரி, இதோ", "Sari, itho", "Okay, here you go"),
      s("சரி, ஏறுங்க", "Sari, erunga", "Okay, get in", "நன்றி", "Nandri", "Thank you"),
    ],
    hard: [
      s("எங்க போகணும்?", "Enga poganum?", "Where do you need to go?", "டி நகர்", "T Nagar", "T Nagar"),
      s("இவரும் டி நகர் தான்!", "Ivarum T Nagar dhaan!", "This person is also going to T Nagar!", "சரி, பகிர்ந்து போகலாம்", "Sari, pagirndhu pogalaam", "Okay, we can share the ride"),
      s("சரி", "Sari", "Okay", "எவ்வளவு?", "Evvalavu?", "How much?"),
      s("எழுபது ரூபாய்", "Ezhupathi rupaai", "Seventy rupees", "பகிர்ந்து கொள்ளலாமா?", "Pagirndhu kollalaamaa?", "Can we split it?"),
      s("மீட்டர் போடலாமா?", "Meter podalaamaa?", "Shall we use the meter?", "சரி, மீட்டர்", "Sari, meter", "Okay, meter"),
      s("சரி, ஏறுங்க", "Sari, erunga", "Okay, get in", "நன்றி", "Nandri", "Thank you"),
      s("போகலாம்", "Pogalaam", "Let's go", "சரி", "Sari", "Okay"),
    ],
  },
  "marina-nagar-shop": {
    easy: [
      s("என்ன வேணும்?", "Enna venum?", "What do you want?", "ஒரு மசாலா தோசை", "Oru masala dosai", "One masala dosa"),
      s("சுட சுட வரும்!", "Suda suda varum!", "It'll come piping hot!", "சரி, காத்திருக்கிறேன்", "Sari, kaathirukkiren", "Okay, I'll wait"),
      s("எழுபத்து ஐந்து ரூபாய்", "Ezhupathu aindhu rupaai", "Seventy-five rupees", "இதோ, நன்றி", "Itho, nandri", "Here you go, thank you"),
    ],
    medium: [
      s("என்ன வேணும்?", "Enna venum?", "What do you want?", "ஒரு மசாலா தோசை", "Oru masala dosai", "One masala dosa"),
      s("காபி?", "Kaapi?", "Coffee?", "ஆம், ஒரு காபி", "Aam, oru kaapi", "Yes, one coffee"),
      s("சரி", "Sari", "Okay", "எவ்வளவு?", "Evvalavu?", "How much?"),
      s("எழுபத்து ஐந்து ரூபாய்", "Ezhupathu aindhu rupaai", "Seventy-five rupees", "இதோ", "Itho", "Here you go"),
      s("நன்றி", "Nandri", "Thank you", "வருகிறேன்", "Varugiren", "I'll come again"),
    ],
    hard: [
      s("என்ன வேணும்?", "Enna venum?", "What do you want?", "ஒரு மசாலா தோசை", "Oru masala dosai", "One masala dosa"),
      s("காபி?", "Kaapi?", "Coffee?", "ஆம், ஒரு காபி", "Aam, oru kaapi", "Yes, one coffee"),
      s("சட்னி ஜாஸ்தி?", "Chutney jaasthi?", "Extra chutney?", "ஆம், கொடுங்க", "Aam, kodunga", "Yes, give some"),
      s("சரி", "Sari", "Okay", "எவ்வளவு?", "Evvalavu?", "How much?"),
      s("எழுபத்து ஐந்து ரூபாய்", "Ezhupathu aindhu rupaai", "Seventy-five rupees", "இதோ", "Itho", "Here you go"),
      s("சுட சுட!", "Suda suda!", "Piping hot!", "நன்றி", "Nandri", "Thank you"),
      s("எடுத்துக்கோங்க", "Eduthukkonga", "Take it", "நன்றி", "Nandri", "Thank you"),
    ],
  },
  "marina-nagar-temple": {
    easy: [
      s("தேங்காய் வேணுமா?", "Thengai venumaa?", "Do you want a coconut?", "ஆம், ஒரு தேங்காய்", "Aam, oru thengai", "Yes, one coconut"),
      s("முப்பது ரூபாய்", "Muppathu rupaai", "Thirty rupees", "இதோ, நன்றி", "Itho, nandri", "Here you go, thank you"),
      s("எடுத்துக்கோங்க", "Eduthukkonga", "Take it", "நன்றி", "Nandri", "Thank you"),
    ],
    medium: [
      s("தேங்காய் வேணுமா?", "Thengai venumaa?", "Do you want a coconut?", "ஆம், ஒரு தேங்காய்", "Aam, oru thengai", "Yes, one coconut"),
      s("பூஜை நேரம் ஆரம்பம்!", "Poojai neram aarambam!", "Puja time is starting!", "சரி, சீக்கிரம்", "Sari, seekiram", "Okay, quickly"),
      s("சரி", "Sari", "Okay", "எவ்வளவு?", "Evvalavu?", "How much?"),
      s("முப்பது ரூபாய்", "Muppathu rupaai", "Thirty rupees", "இதோ", "Itho", "Here you go"),
      s("எடுத்துக்கோங்க", "Eduthukkonga", "Take it", "நன்றி", "Nandri", "Thank you"),
    ],
    hard: [
      s("தேங்காய் வேணுமா?", "Thengai venumaa?", "Do you want a coconut?", "ஆம், ஒரு தேங்காய்", "Aam, oru thengai", "Yes, one coconut"),
      s("பூஜை நேரம் ஆரம்பம்!", "Poojai neram aarambam!", "Puja time is starting!", "சரி, சீக்கிரம்", "Sari, seekiram", "Okay, quickly"),
      s("சரி", "Sari", "Okay", "எவ்வளவு?", "Evvalavu?", "How much?"),
      s("முப்பது ரூபாய்", "Muppathu rupaai", "Thirty rupees", "இதோ", "Itho", "Here you go"),
      s("குங்குமம் வேணுமா?", "Kungumam venumaa?", "Want kumkum too?", "ஆம், கொடுங்க", "Aam, kodunga", "Yes, please"),
      s("எடுத்துக்கோங்க", "Eduthukkonga", "Take it", "நன்றி", "Nandri", "Thank you"),
      s("போங்க", "Ponga", "Go", "நன்றி", "Nandri", "Thank you"),
    ],
  },
  "marina-nagar-bus": {
    easy: [
      s("எங்க போறீங்க?", "Enga poringa?", "Where are you going?", "மெரினா", "Merina", "Marina"),
      s("பதினைந்து ரூபாய்", "Pathinaidu rupaai", "Fifteen rupees", "இதோ", "Itho", "Here you go"),
      s("போங்க", "Ponga", "Go ahead", "நன்றி", "Nandri", "Thank you"),
    ],
    medium: [
      s("எங்க போறீங்க?", "Enga poringa?", "Where are you going?", "மெரினா", "Merina", "Marina"),
      s("பின்னாடி ஏறுங்க!", "Pinnadi erunga!", "Board from the back!", "சரி, பின்னாடி ஏறுகிறேன்", "Sari, pinnadi erukiren", "Okay, I'm boarding from the back"),
      s("சரி", "Sari", "Okay", "எவ்வளவு?", "Evvalavu?", "How much?"),
      s("பதினைந்து ரூபாய்", "Pathinaidu rupaai", "Fifteen rupees", "இதோ", "Itho", "Here you go"),
      s("போங்க", "Ponga", "Go ahead", "நன்றி", "Nandri", "Thank you"),
    ],
    hard: [
      s("எங்க போறீங்க?", "Enga poringa?", "Where are you going?", "மெரினா", "Merina", "Marina"),
      s("பின்னாடி ஏறுங்க!", "Pinnadi erunga!", "Board from the back!", "சரி, பின்னாடி ஏறுகிறேன்", "Sari, pinnadi erukiren", "Okay, I'm boarding from the back"),
      s("சரி", "Sari", "Okay", "ஒரு டிக்கெட்", "Oru ticket", "One ticket"),
      s("சரி", "Sari", "Okay", "எவ்வளவு?", "Evvalavu?", "How much?"),
      s("பதினைந்து ரூபாய்", "Pathinaidu rupaai", "Fifteen rupees", "இதோ", "Itho", "Here you go"),
      s("சில்லறை இருக்கா?", "Sillara irukkaa?", "Got change?", "ஆம், இதோ", "Aam, itho", "Yes, here"),
      s("போங்க", "Ponga", "Go ahead", "நன்றி", "Nandri", "Thank you"),
    ],
  },
  "majestic-cross-auto": {
    easy: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಮೆಜೆಸ್ಟಿಕ್ ಬಸ್ ಸ್ಟ್ಯಾಂಡ್", "Majestic bus stand", "Majestic bus stand"),
      s("ಒಪ್ಪಿಗೆ, ಬನ್ನಿ", "Oppige, banni", "Agreed, come", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
      s("ಬನ್ನಿ", "Banni", "Come", "ಸರಿ", "Sari", "Okay"),
    ],
    medium: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಮೆಜೆಸ್ಟಿಕ್ ಬಸ್ ಸ್ಟ್ಯಾಂಡ್", "Majestic bus stand", "Majestic bus stand"),
      s("ಟ್ರಾಫಿಕ್ ಜಾಸ್ತಿ ಇದೆ!", "Traffic jaasti ide!", "Traffic is heavy!", "ಸರಿ, ಸಮಯ ಆಗುತ್ತೆ", "Sari, samaya agutte", "Okay, time is tight"),
      s("ಸರಿ", "Sari", "Okay", "ಎಷ್ಟು?", "Eshtu?", "How much?"),
      s("ನೂರು ರೂಪಾಯಿ", "Nuru rupaayi", "Hundred rupees", "ಸರಿ, ಇದು", "Sari, idu", "Okay, here"),
      s("ಒಪ್ಪಿಗೆ, ಬನ್ನಿ", "Oppige, banni", "Agreed, come", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
    ],
    hard: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಮೆಜೆಸ್ಟಿಕ್ ಬಸ್ ಸ್ಟ್ಯಾಂಡ್", "Majestic bus stand", "Majestic bus stand"),
      s("ಟ್ರಾಫಿಕ್ ಜಾಸ್ತಿ ಇದೆ!", "Traffic jaasti ide!", "Traffic is heavy!", "ಸರಿ, ಸಮಯ ಆಗುತ್ತೆ", "Sari, samaya agutte", "Okay, time is tight"),
      s("ಸರಿ", "Sari", "Okay", "ಎಷ್ಟು?", "Eshtu?", "How much?"),
      s("ನೂರು ರೂಪಾಯಿ", "Nuru rupaayi", "Hundred rupees", "ಸ್ವಲ್ಪ ಕಡಿಮೆ", "Swalpa kadime", "A little less, please"),
      s("ಮೀಟರ್ ಹಾಕೋವಾ?", "Meter haakova?", "Shall I put the meter?", "ಇಲ್ಲ, ಫಿಕ್ಸ್", "Illa, fix", "No, fixed"),
      s("ಒಪ್ಪಿಗೆ, ಬನ್ನಿ", "Oppige, banni", "Agreed, come", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
      s("ಬನ್ನಿ", "Banni", "Come", "ಸರಿ", "Sari", "Okay"),
    ],
  },
  "majestic-cross-shop": {
    easy: [
      s("ಏನು ಬೇಕು?", "Enu beku?", "What do you want?", "ಎರಡು ಇಡ್ಲಿ ಒಂದು ವಡೆ", "Eradu idli ondu vade", "Two idlis and one vada"),
      s("ಬಿಸಿ ಬಿಸಿ!", "Bisi bisi!", "Hot hot!", "ಸರಿ, ಕಾಯುತ್ತೇನೆ", "Sari, kayuttene", "Okay, I'll wait"),
      s("ನಲವತ್ತು ರೂಪಾಯಿ", "Nalavattu rupaayi", "Forty rupees", "ಇದು, ಧನ್ಯವಾದ", "Idu, dhanyavaada", "Here you go, thank you"),
    ],
    medium: [
      s("ಏನು ಬೇಕು?", "Enu beku?", "What do you want?", "ಎರಡು ಇಡ್ಲಿ ಒಂದು ವಡೆ", "Eradu idli ondu vade", "Two idlis and one vada"),
      s("ಕಾಫಿ?", "Kaafi?", "Coffee?", "ಇಲ್ಲ, ಧನ್ಯವಾದ", "Illa, dhanyavaada", "No, thank you"),
      s("ಸರಿ", "Sari", "Okay", "ಎಷ್ಟು?", "Eshtu?", "How much?"),
      s("ನಲವತ್ತು ರೂಪಾಯಿ", "Nalavattu rupaayi", "Forty rupees", "ಇದು", "Idu", "Here you go"),
      s("ತೆಗೆದುಕೊಳ್ಳಿ", "Tegedukolli", "Take it", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
    ],
    hard: [
      s("ಏನು ಬೇಕು?", "Enu beku?", "What do you want?", "ಎರಡು ಇಡ್ಲಿ ಒಂದು ವಡೆ", "Eradu idli ondu vade", "Two idlis and one vada"),
      s("ಕಾಫಿ?", "Kaafi?", "Coffee?", "ಇಲ್ಲ, ಧನ್ಯವಾದ", "Illa, dhanyavaada", "No, thank you"),
      s("ಚಟ್ನಿ ಜಾಸ್ತಿ?", "Chutney jaasti?", "Extra chutney?", "ಹೌದು, ಕೊಡಿ", "Haudu, kodi", "Yes, give some"),
      s("ಸರಿ", "Sari", "Okay", "ಎಷ್ಟು?", "Eshtu?", "How much?"),
      s("ನಲವತ್ತು ರೂಪಾಯಿ", "Nalavattu rupaayi", "Forty rupees", "ಇದು", "Idu", "Here you go"),
      s("ಬಿಸಿ ಬಿಸಿ!", "Bisi bisi!", "Hot hot!", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
      s("ತೆಗೆದುಕೊಳ್ಳಿ", "Tegedukolli", "Take it", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
    ],
  },
  "majestic-cross-temple": {
    easy: [
      s("ಮಲ್ಲಿಗೆ?", "Mallige?", "Jasmine?", "ಹೌದು, ಒಂದು ಮಾಲೆ", "Haudu, ondu maale", "Yes, one garland"),
      s("ಮೂವತ್ತು ರೂಪಾಯಿ", "Muvattu rupaayi", "Thirty rupees", "ಇದು, ಧನ್ಯವಾದ", "Idu, dhanyavaada", "Here you go, thank you"),
      s("ತೆಗೆದುಕೊಳ್ಳಿ", "Tegedukolli", "Take it", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
    ],
    medium: [
      s("ಮಲ್ಲಿಗೆ?", "Mallige?", "Jasmine?", "ಹೌದು, ಒಂದು ಮಾಲೆ", "Haudu, ondu maale", "Yes, one garland"),
      s("ಘಂಟೆ ಬರುತ್ತಿದೆ!", "Ghante baruttide!", "The bell is ringing!", "ಸರಿ, ಬೇಗ", "Sari, bega", "Okay, quickly"),
      s("ಸರಿ", "Sari", "Okay", "ಎಷ್ಟು?", "Eshtu?", "How much?"),
      s("ಮೂವತ್ತು ರೂಪಾಯಿ", "Muvattu rupaayi", "Thirty rupees", "ಇದು", "Idu", "Here you go"),
      s("ತೆಗೆದುಕೊಳ್ಳಿ", "Tegedukolli", "Take it", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
    ],
    hard: [
      s("ಮಲ್ಲಿಗೆ?", "Mallige?", "Jasmine?", "ಹೌದು, ಒಂದು ಮಾಲೆ", "Haudu, ondu maale", "Yes, one garland"),
      s("ಘಂಟೆ ಬರುತ್ತಿದೆ!", "Ghante baruttide!", "The bell is ringing!", "ಸರಿ, ಬೇಗ", "Sari, bega", "Okay, quickly"),
      s("ಸರಿ", "Sari", "Okay", "ಎಷ್ಟು?", "Eshtu?", "How much?"),
      s("ಮೂವತ್ತು ರೂಪಾಯಿ", "Muvattu rupaayi", "Thirty rupees", "ಇದು", "Idu", "Here you go"),
      s("ಕುಂಕುಮ ಬೇಕಾ?", "Kunkuma bekaa?", "Want kumkum?", "ಹೌದು", "Haudu", "Yes"),
      s("ತೆಗೆದುಕೊಳ್ಳಿ", "Tegedukolli", "Take it", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
      s("ಹೋಗಿ", "Hogi", "Go", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
    ],
  },
  "majestic-cross-bus": {
    easy: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಶಿವಾಜಿನಗರ", "Shivajinagar", "Shivajinagar"),
      s("ಇಪ್ಪತ್ತು ರೂಪಾಯಿ", "Ippattu rupaayi", "Twenty rupees", "ಇದು", "Idu", "Here you go"),
      s("ಹೋಗಿ", "Hogi", "Go", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
    ],
    medium: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಶಿವಾಜಿನಗರ", "Shivajinagar", "Shivajinagar"),
      s("ಹಿಂದಿನ ಬಾಗಿಲು!", "Hindina baagilu!", "Back door!", "ಸರಿ, ಹಿಂದಿನ ಬಾಗಿಲಿನಿಂದ", "Sari, hindina baagilinda", "Okay, from the back door"),
      s("ಸರಿ", "Sari", "Okay", "ಎಷ್ಟು?", "Eshtu?", "How much?"),
      s("ಇಪ್ಪತ್ತು ರೂಪಾಯಿ", "Ippattu rupaayi", "Twenty rupees", "ಇದು", "Idu", "Here you go"),
      s("ಹೋಗಿ", "Hogi", "Go", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
    ],
    hard: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಶಿವಾಜಿನಗರ", "Shivajinagar", "Shivajinagar"),
      s("ಹಿಂದಿನ ಬಾಗಿಲು!", "Hindina baagilu!", "Back door!", "ಸರಿ, ಹಿಂದಿನ ಬಾಗಿಲಿನಿಂದ", "Sari, hindina baagilinda", "Okay, from the back door"),
      s("ಸರಿ", "Sari", "Okay", "ಒಂದು ಟಿಕೆಟ್", "Ondu ticket", "One ticket"),
      s("ಸರಿ", "Sari", "Okay", "ಎಷ್ಟು?", "Eshtu?", "How much?"),
      s("ಇಪ್ಪತ್ತು ರೂಪಾಯಿ", "Ippattu rupaayi", "Twenty rupees", "ಇದು", "Idu", "Here you go"),
      s("ಚಿಲ್ಲರೆ ಇದೆಯಾ?", "Chillare ideyaa?", "Got change?", "ಹೌದು, ತೆಗೆದುಕೊಳ್ಳಿ", "Haudu, tegedukolli", "Yes, take it"),
      s("ಹೋಗಿ", "Hogi", "Go", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
    ],
  },
  "park-gully-auto": {
    easy: [
      s("কোথায় যাবেন?", "Kothay jaben?", "Where will you go?", "হাওড়া স্টেশন", "Howrah station", "Howrah station"),
      s("ঠিক আছে, উঠুন", "Thik ache, uthun", "Okay, get in", "ধন্যবাদ", "Dhonnobad", "Thank you"),
      s("চলুন", "Cholun", "Let's go", "ঠিক আছে", "Thik ache", "Okay"),
    ],
    medium: [
      s("কোথায় যাবেন?", "Kothay jaben?", "Where will you go?", "হাওড়া স্টেশন", "Howrah station", "Howrah station"),
      s("বৃষ্টি হচ্ছে, ভিজবেন!", "Brishti hocche, vijben!", "It's raining, you'll get wet!", "ঠিক আছে, ছাতা আছে", "Thik ache, chhata ache", "Okay, I have an umbrella"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("দুশো টাকা", "Dusho taka", "Two hundred rupees", "ঠিক আছে, নিন", "Thik ache, nin", "Okay, here you go"),
      s("উঠুন", "Uthun", "Get in", "ধন্যবাদ", "Dhonnobad", "Thank you"),
    ],
    hard: [
      s("কোথায় যাবেন?", "Kothay jaben?", "Where will you go?", "হাওড়া স্টেশন", "Howrah station", "Howrah station"),
      s("বৃষ্টি হচ্ছে, ভিজবেন!", "Brishti hocche, vijben!", "It's raining, you'll get wet!", "ঠিক আছে, ছাতা আছে", "Thik ache, chhata ache", "Okay, I have an umbrella"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("দুশো টাকা", "Dusho taka", "Two hundred rupees", "একটু কম করুন", "Ektu kom korun", "Please reduce a little"),
      s("মিটার চালাবেন?", "Meter chalaben?", "Run the meter?", "না, ঠিক ভাড়া", "Na, thik bhara", "No, fixed fare"),
      s("ঠিক আছে, উঠুন", "Thik ache, uthun", "Okay, get in", "ধন্যবাদ", "Dhonnobad", "Thank you"),
      s("চলুন", "Cholun", "Let's go", "ঠিক আছে", "Thik ache", "Okay"),
    ],
  },
  "park-gully-shop": {
    easy: [
      s("কী নেবেন?", "Ki neben?", "What will you take?", "দুটো শিঙ্গারা আর একটা কচুরি", "Duto shingara ar ekta kachori", "Two singaras and one kachori"),
      s("গরম গরম!", "Garam garam!", "Hot hot!", "ঠিক আছে, অপেক্ষা করছি", "Thik ache, opekkha korchi", "Okay, I'm waiting"),
      s("চল্লিশ টাকা", "Chollish taka", "Forty taka", "নিন, ধন্যবাদ", "Nin, dhonnobad", "Take it, thank you"),
    ],
    medium: [
      s("কী নেবেন?", "Ki neben?", "What will you take?", "দুটো শিঙ্গারা আর একটা কচুরি", "Duto shingara ar ekta kachori", "Two singaras and one kachori"),
      s("চা?", "Cha?", "Tea?", "হ্যাঁ, এক কাপ", "Hyaa, ek kap", "Yes, one cup"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("চল্লিশ টাকা", "Chollish taka", "Forty taka", "নিন", "Nin", "Take it"),
      s("ধন্যবাদ", "Dhonnobad", "Thank you", "আবার আসবেন", "Abar asben", "Come again"),
    ],
    hard: [
      s("কী নেবেন?", "Ki neben?", "What will you take?", "দুটো শিঙ্গারা আর একটা কচুরি", "Duto shingara ar ekta kachori", "Two singaras and one kachori"),
      s("চা?", "Cha?", "Tea?", "হ্যাঁ, এক কাপ", "Hyaa, ek kap", "Yes, one cup"),
      s("মিষ্টি চা নাকি?", "Mishti cha naki?", "Sweet tea or not?", "না, সাদা চা", "Na, sada cha", "No, plain tea"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("চল্লিশ টাকা", "Chollish taka", "Forty taka", "নিন", "Nin", "Take it"),
      s("গরম গরম!", "Garam garam!", "Hot hot!", "ধন্যবাদ", "Dhonnobad", "Thank you"),
      s("নিন", "Nin", "Take it", "ধন্যবাদ", "Dhonnobad", "Thank you"),
    ],
  },
  "park-gully-temple": {
    easy: [
      s("প্রসাদ নেবেন?", "Prasad neben?", "Will you take prasad?", "হ্যাঁ, এক প্যাকেট", "Hyaa, ek packet", "Yes, one packet"),
      s("পঁচিশ টাকা", "Pochish taka", "Twenty-five taka", "নিন, ধন্যবাদ", "Nin, dhonnobad", "Take it, thank you"),
      s("নিন", "Nin", "Take it", "ধন্যবাদ", "Dhonnobad", "Thank you"),
    ],
    medium: [
      s("প্রসাদ নেবেন?", "Prasad neben?", "Will you take prasad?", "হ্যাঁ, এক প্যাকেট", "Hyaa, ek packet", "Yes, one packet"),
      s("ঘণ্টা বাজছে!", "Ghonta bajche!", "The bell is ringing!", "ঠিক আছে, তাড়াতাড়ি", "Thik ache, taratari", "Okay, quickly"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("পঁচিশ টাকা", "Pochish taka", "Twenty-five taka", "নিন", "Nin", "Take it"),
      s("যান", "Jan", "Go", "ধন্যবাদ", "Dhonnobad", "Thank you"),
    ],
    hard: [
      s("প্রসাদ নেবেন?", "Prasad neben?", "Will you take prasad?", "হ্যাঁ, এক প্যাকেট", "Hyaa, ek packet", "Yes, one packet"),
      s("ঘণ্টা বাজছে!", "Ghonta bajche!", "The bell is ringing!", "ঠিক আছে, তাড়াতাড়ি", "Thik ache, taratari", "Okay, quickly"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("পঁচিশ টাকা", "Pochish taka", "Twenty-five taka", "নিন", "Nin", "Take it"),
      s("সিঁদুর লাগবে?", "Sindur lagbe?", "Need vermillion?", "হ্যাঁ, দিন", "Hyaa, din", "Yes, give it"),
      s("নিন", "Nin", "Take it", "ধন্যবাদ", "Dhonnobad", "Thank you"),
      s("যান", "Jan", "Go", "ধন্যবাদ", "Dhonnobad", "Thank you"),
    ],
  },
  "park-gully-bus": {
    easy: [
      s("কোথায়?", "Kothay?", "Where to?", "এসপ্ল্যানেড", "Esplanade", "Esplanade"),
      s("দশ টাকা", "Dash taka", "Ten taka", "নিন", "Nin", "Take it"),
      s("যান", "Jan", "Go", "ধন্যবাদ", "Dhonnobad", "Thank you"),
    ],
    medium: [
      s("কোথায়?", "Kothay?", "Where to?", "এসপ্ল্যানেড", "Esplanade", "Esplanade"),
      s("ট্রাম আসছে!", "Tram asche!", "Tram is coming!", "ঠিক আছে, ট্রামে উঠব", "Thik ache, tram e uthbo", "Okay, I'll board the tram"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("দশ টাকা", "Dash taka", "Ten taka", "নিন", "Nin", "Take it"),
      s("যান", "Jan", "Go", "ধন্যবাদ", "Dhonnobad", "Thank you"),
    ],
    hard: [
      s("কোথায়?", "Kothay?", "Where to?", "এসপ্ল্যানেড", "Esplanade", "Esplanade"),
      s("ট্রাম আসছে!", "Tram asche!", "Tram is coming!", "ঠিক আছে, ট্রামে উঠব", "Thik ache, tram e uthbo", "Okay, I'll board the tram"),
      s("ঠিক আছে", "Thik ache", "Okay", "একটা টিকিট", "Ekta ticket", "One ticket"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("দশ টাকা", "Dash taka", "Ten taka", "নিন", "Nin", "Take it"),
      s("খুচরো আছে?", "Khuchro ache?", "Got change?", "হ্যাঁ, নিন", "Hyaa, nin", "Yes, take it"),
      s("যান", "Jan", "Go", "ধন্যবাদ", "Dhonnobad", "Thank you"),
    ],
  },
};

export function streetLessonsFor(taskId: string): StreetTaskLessons {
  const lessons = STREET_TASK_LESSONS[taskId];
  if (!lessons) {
    throw new Error(`Missing street lessons for task ${taskId}`);
  }
  return lessons;
}
