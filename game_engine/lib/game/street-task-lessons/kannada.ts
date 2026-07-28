import type { StreetTaskLessons } from "./types";
import { s } from "./types";

export const LESSONS: Record<string, StreetTaskLessons> = {
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
};
