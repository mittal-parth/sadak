import type { StreetTaskLessons } from "./types";
import { s } from "./types";

export const LESSONS: Record<string, StreetTaskLessons> = {
  "majestic-cross-auto": {
    easy: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಲಾಲ್‌ಬಾಗ್", "Lalbagh", "Lalbagh"),
      s("ಒಪ್ಪಿಗೆ, ಬನ್ನಿ", "Oppige, banni", "Agreed, come", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
      s("ಬನ್ನಿ", "Banni", "Come", "ಸರಿ", "Sari", "Okay"),
    ],
    medium: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಲಾಲ್‌ಬಾಗ್", "Lalbagh", "Lalbagh"),
      s("ಟ್ರಾಫಿಕ್ ಜಾಸ್ತಿ ಇದೆ!", "Traffic jaasti ide!", "Traffic is heavy!", "ಸರಿ, ಸಮಯ ಆಗುತ್ತೆ", "Sari, samaya agutte", "Okay, time is tight"),
      s("ಸರಿ", "Sari", "Okay", "ಎಷ್ಟು?", "Eshtu?", "How much?"),
      s("ನೂರು ರೂಪಾಯಿ", "Nuru rupaayi", "Hundred rupees", "ಸರಿ, ಇದು", "Sari, idu", "Okay, here"),
      s("ಒಪ್ಪಿಗೆ, ಬನ್ನಿ", "Oppige, banni", "Agreed, come", "ಧನ್ಯವಾದ", "Dhanyavaada", "Thank you"),
    ],
    hard: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಲಾಲ್‌ಬಾಗ್", "Lalbagh", "Lalbagh"),
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
  "majestic-cross-metro": {
    easy: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಎಂ.ಜಿ. ರೋಡ್", "M.G. Road", "MG Road"),
      s("ಟೋಕನ್ ಅಥವಾ ಕಾರ್ಡ್?", "Token athava card?", "Token or card?", "ಟೋಕನ್ ಕೊಡಿ", "Token kodi", "A token, please"),
      s("ಮೂವತ್ತು ರೂಪಾಯಿ", "Muvattu rupaayi", "Thirty rupees", "ಇದು, ಧನ್ಯವಾದ", "Idu, dhanyavaada", "Here you go, thank you"),
    ],
    medium: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಎಂ.ಜಿ. ರೋಡ್", "M.G. Road", "MG Road"),
      s("ಎಷ್ಟು ಜನ?", "Eshtu jana?", "How many people?", "ಒಬ್ಬರು", "Obbaru", "One person"),
      s("ಟೋಕನ್ ಅಥವಾ ಕಾರ್ಡ್?", "Token athava card?", "Token or card?", "ಟೋಕನ್ ಕೊಡಿ", "Token kodi", "A token, please"),
      s("ಸರಿ", "Sari", "Okay", "ಎಷ್ಟು?", "Eshtu?", "How much?"),
      s("ಮೂವತ್ತು ರೂಪಾಯಿ", "Muvattu rupaayi", "Thirty rupees", "ಇದು, ಧನ್ಯವಾದ", "Idu, dhanyavaada", "Here you go, thank you"),
    ],
    hard: [
      s("ಎಲ್ಲಿಗೆ?", "Ellige?", "Where to?", "ಎಂ.ಜಿ. ರೋಡ್", "M.G. Road", "MG Road"),
      s("ಎಷ್ಟು ಜನ?", "Eshtu jana?", "How many people?", "ಒಬ್ಬರು", "Obbaru", "One person"),
      s("ಚಿಲ್ಲರೆ ಇದೆಯಾ?", "Chillare ideyaa?", "Do you have change?", "ಹೌದು, ಇದೆ", "Haudu, ide", "Yes, I do"),
      s("ಟೋಕನ್ ಅಥವಾ ಕಾರ್ಡ್?", "Token athava card?", "Token or card?", "ಟೋಕನ್ ಕೊಡಿ", "Token kodi", "A token, please"),
      s("ಪರ್ಪಲ್ ಲೈನ್, ಕೆಳಗೆ ಹೋಗಿ", "Purple line, kelage hogi", "Purple line, go downstairs", "ಸರಿ, ಧನ್ಯವಾದ", "Sari, dhanyavaada", "Okay, thank you"),
      s("ಸರಿ", "Sari", "Okay", "ಎಷ್ಟು?", "Eshtu?", "How much?"),
      s("ಮೂವತ್ತು ರೂಪಾಯಿ", "Muvattu rupaayi", "Thirty rupees", "ಇದು, ಧನ್ಯವಾದ", "Idu, dhanyavaada", "Here you go, thank you"),
    ],
  },
  "majestic-cross-barber": {
    easy: [
      s("ಬನ್ನಿ, ಕೂತ್ಕೊಳ್ಳಿ. ಏನು ಮಾಡಬೇಕು?", "Banni, kootkolli. Enu maadabeku?", "Come, sit down. What should I do?", "ಕೂದಲು ಕತ್ತರಿಸಿ", "Koodalu kattarisi", "Please cut my hair"),
      s("ಸರಿ, ಸ್ವಲ್ಪ ಕಾಯಬೇಕು", "Sari, swalpa kaayabeku", "Okay, you'll have to wait a little", "ಎಷ್ಟು ಹೊತ್ತು ಆಗುತ್ತೆ?", "Eshtu hottu aagutte?", "How long will it take?"),
      s("ಹತ್ತು ನಿಮಿಷ", "Hattu nimisha", "Ten minutes", "ಸರಿ, ಕಾಯ್ತೀನಿ", "Sari, kaaytini", "Okay, I'll wait"),
    ],
    medium: [
      s("ಬನ್ನಿ, ಕೂತ್ಕೊಳ್ಳಿ. ಏನು ಮಾಡಬೇಕು?", "Banni, kootkolli. Enu maadabeku?", "Come, sit down. What should I do?", "ಕೂದಲು ಕತ್ತರಿಸಿ", "Koodalu kattarisi", "Please cut my hair"),
      s("ಸರಿ, ಸ್ವಲ್ಪ ಕಾಯಬೇಕು", "Sari, swalpa kaayabeku", "Okay, you'll have to wait a little", "ಎಷ್ಟು ಹೊತ್ತು ಆಗುತ್ತೆ?", "Eshtu hottu aagutte?", "How long will it take?"),
      s("ಹತ್ತು ನಿಮಿಷ", "Hattu nimisha", "Ten minutes", "ಸರಿ, ಕಾಯ್ತೀನಿ", "Sari, kaaytini", "Okay, I'll wait"),
      s("ಆಯ್ತು. ಹೇಗಿದೆ?", "Aaytu. Hegide?", "Done. How does it look?", "ತುಂಬಾ ಚೆನ್ನಾಗಿದೆ! ಎಷ್ಟು?", "Tumbaa chennaagide! Eshtu?", "Very nice! How much?"),
      s("ಎಂಬತ್ತು ರೂಪಾಯಿ", "Embattu roopaayi", "Eighty rupees", "ಇದು, ಧನ್ಯವಾದ", "Idu, dhanyavaada", "Here you go, thank you"),
    ],
    hard: [
      s("ಬನ್ನಿ, ಕೂತ್ಕೊಳ್ಳಿ. ಏನು ಮಾಡಬೇಕು?", "Banni, kootkolli. Enu maadabeku?", "Come, sit down. What should I do?", "ಕೂದಲು ಕತ್ತರಿಸಿ", "Koodalu kattarisi", "Please cut my hair"),
      s("ಸರಿ, ಸ್ವಲ್ಪ ಕಾಯಬೇಕು", "Sari, swalpa kaayabeku", "Okay, you'll have to wait a little", "ಎಷ್ಟು ಹೊತ್ತು ಆಗುತ್ತೆ?", "Eshtu hottu aagutte?", "How long will it take?"),
      s("ಹತ್ತು ನಿಮಿಷ", "Hattu nimisha", "Ten minutes", "ಸರಿ, ಕಾಯ್ತೀನಿ", "Sari, kaaytini", "Okay, I'll wait"),
      s("ಚಿಕ್ಕದಾಗಿ, ಇಲ್ಲ ಸ್ವಲ್ಪ ಟ್ರಿಮ್?", "Chikkadaagi, illa swalpa trim?", "Short, or just a trim?", "ಸ್ವಲ್ಪ ಟ್ರಿಮ್ ಸಾಕು", "Swalpa trim saaku", "Just a trim"),
      s("ಶೇವ್ ಕೂಡ ಮಾಡ್ಲಾ?", "Shave kooda maadlaa?", "Shave as well?", "ಬೇಡ, ಕೂದಲು ಮಾತ್ರ", "Beda, koodalu maatra", "No, just the haircut"),
      s("ಆಯ್ತು. ಹೇಗಿದೆ?", "Aaytu. Hegide?", "Done. How does it look?", "ತುಂಬಾ ಚೆನ್ನಾಗಿದೆ! ಎಷ್ಟು?", "Tumbaa chennaagide! Eshtu?", "Very nice! How much?"),
      s("ಎಂಬತ್ತು ರೂಪಾಯಿ", "Embattu roopaayi", "Eighty rupees", "ಇದು, ಧನ್ಯವಾದ", "Idu, dhanyavaada", "Here you go, thank you"),
    ],
  },
};
