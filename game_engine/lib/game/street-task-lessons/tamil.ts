import type { StreetTaskLessons } from "./types";
import { s } from "./types";

export const LESSONS: Record<string, StreetTaskLessons> = {
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
  "marina-nagar-barber": {
    easy: [
      s("வாங்க, உட்காருங்க. என்ன பண்ணணும்?", "Vaanga, utkaarunga. Enna pannanum?", "Come, sit down. What should I do?", "முடி வெட்டுங்க", "Mudi vettunga", "Please cut my hair"),
      s("சரி, கொஞ்சம் காத்திருக்கணும்", "Sari, konjam kaathirukkanum", "Okay, you'll have to wait a little", "எவ்வளவு நேரம் ஆகும்?", "Evvalavu neram aagum?", "How long will it take?"),
    ],
    medium: [
      s("வாங்க, உட்காருங்க. என்ன பண்ணணும்?", "Vaanga, utkaarunga. Enna pannanum?", "Come, sit down. What should I do?", "முடி வெட்டுங்க", "Mudi vettunga", "Please cut my hair"),
      s("சரி, கொஞ்சம் காத்திருக்கணும்", "Sari, konjam kaathirukkanum", "Okay, you'll have to wait a little", "எவ்வளவு நேரம் ஆகும்?", "Evvalavu neram aagum?", "How long will it take?"),
    ],
    hard: [
      s("வாங்க, உட்காருங்க. என்ன பண்ணணும்?", "Vaanga, utkaarunga. Enna pannanum?", "Come, sit down. What should I do?", "முடி வெட்டுங்க", "Mudi vettunga", "Please cut my hair"),
      s("சரி, கொஞ்சம் காத்திருக்கணும்", "Sari, konjam kaathirukkanum", "Okay, you'll have to wait a little", "எவ்வளவு நேரம் ஆகும்?", "Evvalavu neram aagum?", "How long will it take?"),
    ],
  },
};
