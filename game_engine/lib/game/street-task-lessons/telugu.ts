import type { StreetTaskLessons } from "./types";
import { s } from "./types";

export const LESSONS: Record<string, StreetTaskLessons> = {
  "charminar-lane-auto": {
    easy: [
      s("ఎక్కడికి వెళ్ళాలి?", "Ekkadiki vellali?", "Where do you want to go?", "సికింద్రాబాద్ రైల్వే స్టేషన్", "Secunderabad railway station", "Secunderabad railway station"),
      s("సరే, ఎంత ఇస్తారు?", "Sare, enta istaru?", "Fine, what will you pay?", "ఒకటినూటలు పోతారా?", "Okati nootlu potara?", "Will you go for 150?"),
      s("రా, ఎక్కు", "Raa, ekku", "Come on, get in", "ధన్యవాదాలు, వెళ్దాం", "Dhanyavaadalu, veldaam", "Thank you, let's go"),
    ],
    medium: [
      s("ఎక్కడికి వెళ్ళాలి?", "Ekkadiki vellali?", "Where do you want to go?", "సికింద్రాబాద్ రైల్వే స్టేషన్", "Secunderabad railway station", "Secunderabad railway station"),
      s("మూడు వందలు! petrol ఖరీదు అన్న", "Moodu vandlu! petrol khareedu anna", "Three hundred! Petrol is costly, brother", "అర్థమైంది, కొంచెం తగ్గించండి", "Arthamaindi, konchem taggincandi", "I understand, please reduce it a bit"),
      s("సరే, చెప్పు", "Sare, cheppu", "Fine, tell me", "ఎంత?", "Enta?", "How much?"),
      s("సరే, ఎంత ఇస్తారు?", "Sare, enta istaru?", "Fine, what will you pay?", "ఒకటినూటలు పోతారా?", "Okati nootlu potara?", "Will you go for 150?"),
      s("రా, ఎక్కు", "Raa, ekku", "Come on, get in", "ధన్యవాదాలు, వెళ్దాం", "Dhanyavaadalu, veldaam", "Thank you, let's go"),
    ],
    hard: [
      s("ఎక్కడికి వెళ్ళాలి?", "Ekkadiki vellali?", "Where do you want to go?", "సికింద్రాబాద్ రైల్వే స్టేషన్", "Secunderabad railway station", "Secunderabad railway station"),
      s("ఈ రోజు crowd ఎక్కువ", "Ee roju crowd ekkuva", "Crowd is heavy today", "అవును, తొందరగా", "Avunu, tondaraga", "Yes, I'm in a hurry"),
      s("మూడు వందలు! petrol ఖరీదు అన్న", "Moodu vandlu! petrol khareedu anna", "Three hundred! Petrol is costly, brother", "అర్థమైంది, కొంచెం తగ్గించండి", "Arthamaindi, konchem taggincandi", "I understand, please reduce it a bit"),
      s("సరే, చెప్పు", "Sare, cheppu", "Fine, tell me", "ఎంత?", "Enta?", "How much?"),
      s("సరే, ఎంత ఇస్తారు?", "Sare, enta istaru?", "Fine, what will you pay?", "ఒకటినూటలు పోతారా?", "Okati nootlu potara?", "Will you go for 150?"),
      s("meter తోనా?", "Meter thona?", "By meter?", "లేదు, fix fare", "Ledu, fix fare", "No, fixed fare"),
      s("రా, ఎక్కు", "Raa, ekku", "Come on, get in", "ధన్యవాదాలు, వెళ్దాం", "Dhanyavaadalu, veldaam", "Thank you, let's go"),
    ],
  },
  "charminar-lane-shop": {
    easy: [
      s("ఏమి కావాలి?", "Emi kaavali?", "What do you want?", "రెండు మిర్చి బజ్జీలు", "Rendu mirchi bajjilu", "Two mirchi bajjis, please"),
      s("అయ్యో, ఆ కాకి మళ్లీ వచ్చింది!", "Ayyo, aa kaaki malli vachchindi!", "Oh no, that crow is back again!", "పర్వాలేదు, బజ్జీలు ఇవ్వండి", "Parvaaledu, bajjilu ivvandi", "No problem, give me the bajjis"),
      s("నలభై రూపాయలు", "Nalabhai roopaayalu", "Forty rupees", "ఇదigo, ధన్యవాదాలు", "Idigo, dhanyavaadalu", "Here you go, thank you"),
    ],
    medium: [
      s("ఏమి కావాలి?", "Emi kaavali?", "What do you want?", "రెండు మిర్చి బజ్జీలు", "Rendu mirchi bajjilu", "Two mirchi bajjis, please"),
      s("chai కూడా?", "Chai koodaa?", "Chai as well?", "అవును, ఒక tea", "Avunu, oka tea", "Yes, one tea"),
      s("సరే", "Sare", "Okay", "ఎంత అయింది?", "Enta ayindi?", "What do I owe you?"),
      s("నలభై రూపాయలు", "Nalabhai roopaayalu", "Forty rupees", "ఇదigo", "Idigo", "Here you go"),
      s("తీసుకో", "Teesuko", "Take it", "ధన్యవాదాలు", "Dhanyavaadalu", "Thank you"),
    ],
    hard: [
      s("ఏమి కావాలి?", "Emi kaavali?", "What do you want?", "రెండు మిర్చి బజ్జీలు", "Rendu mirchi bajjilu", "Two mirchi bajjis, please"),
      s("chai కూడా?", "Chai koodaa?", "Chai as well?", "అవును, ఒక tea", "Avunu, oka tea", "Yes, one tea"),
      s("తీపి tea లేదా సాదా?", "Teepi tea ledaa saadaa?", "Sweet tea or plain?", "సాదా tea", "Saadaa tea", "Plain tea"),
      s("చెప్పండి", "Cheppandi", "Tell me", "ఎంత అయింది?", "Enta ayindi?", "What do I owe you?"),
      s("నలభై రూపాయలు", "Nalabhai roopaayalu", "Forty rupees", "ఇదigo", "Idigo", "Here you go"),
      s("ఇంకేమైనా?", "Inkenainaa?", "Anything else?", "లేదు, అంతే", "Ledu, anthe", "No, that's all"),
      s("తీసుకో", "Teesuko", "Take it", "ధన్యవాదాలు", "Dhanyavaadalu", "Thank you"),
    ],
  },
  "charminar-lane-temple": {
    easy: [
      s("చార్మినార్ దగ్గర పువ్వులా?", "Charminar daggra puvvulaa?", "Flowers near Charminar?", "అవును, రెండు బంతి మాల", "Avunu, rendu banti maala", "Yes, two marigold garlands"),
      s("నలభైలో తీసుకో", "Nalabhailo teesuko", "Take it for forty", "ధన్యవాదాలు, ఇదigo", "Dhanyavaadalu, idigo", "Thank you, here you go"),
      s("వెళ్ళి దర్శనం చేసుకో", "Velli darshanam chesuko", "Go, take darshan", "ధన్యవాదాలు", "Dhanyavaadalu", "Thank you"),
    ],
    medium: [
      s("చార్మినార్ దగ్గర పువ్వులా?", "Charminar daggra puvvulaa?", "Flowers near Charminar?", "అవును, రెండు బంతి మాల", "Avunu, rendu banti maala", "Yes, two marigold garlands"),
      s("గంట మోగుతోంది, తొందర!", "Ganta mogutondi, tondara!", "The bell is ringing, hurry!", "అవును, తొందరగా", "Avunu, tondaraga", "Yes, quickly"),
      s("చెప్పండి", "Cheppandi", "Tell me", "ఎంత?", "Enta?", "How much?"),
      s("యాభై రూపాయలు", "Yaabhai roopaayalu", "Fifty rupees", "నలభైలో ఇవ్వండి", "Nalabhailo ivvandi", "Give it for forty"),
      s("నలభైలో తీసుకో", "Nalabhailo teesuko", "Take it for forty", "ధన్యవాదాలు, ఇదigo", "Dhanyavaadalu, idigo", "Thank you, here you go"),
    ],
    hard: [
      s("చార్మినార్ దగ్గర పువ్వులా?", "Charminar daggra puvvulaa?", "Flowers near Charminar?", "అవును, రెండు బంతి మాల", "Avunu, rendu banti maala", "Yes, two marigold garlands"),
      s("గంట మోగుతోంది, తొందర!", "Ganta mogutondi, tondara!", "The bell is ringing, hurry!", "అవును, తొందరగా", "Avunu, tondaraga", "Yes, quickly"),
      s("చెప్పండి", "Cheppandi", "Tell me", "ఎంత?", "Enta?", "How much?"),
      s("యాభై రూపాయలు", "Yaabhai roopaayalu", "Fifty rupees", "నలభైలో ఇవ్వండి", "Nalabhailo ivvandi", "Give it for forty"),
      s("ఇంకేమైనా కావాలా?", "Inkenainaa kaavaalaa?", "Need anything else?", "లేదు, ఇంతే", "Ledu, inthe", "No, just this"),
      s("నలభైలో తీసుకో", "Nalabhailo teesuko", "Take it for forty", "ధన్యవాదాలు, ఇదigo", "Dhanyavaadalu, idigo", "Thank you, here you go"),
      s("వెళ్ళు", "Vellu", "Go", "ధన్యవాదాలు", "Dhanyavaadalu", "Thank you"),
    ],
  },
  "charminar-lane-bus": {
    easy: [
      s("ఎక్కడికి?", "Ekkadiki?", "Where to?", "గోల్కుండ", "Golconda", "Golconda"),
      s("ఇరవై రూపాయలు", "Iravai roopaayalu", "Twenty rupees", "ఇదigo", "Idigo", "Here you go"),
      s("ఇదigo, ticket", "Idigo, ticket", "Here, your ticket", "ధన్యవాదాలు", "Dhanyavaadalu", "Thank you"),
    ],
    medium: [
      s("ఎక్కడికి?", "Ekkadiki?", "Where to?", "గోల్కుండ", "Golconda", "Golconda"),
      s("వెనక నుండి ఎక్కు, crowd ఉంది", "Venaka nundi ekku, crowd undi", "Board from the back, it's crowded", "సరే, వెనక నుండి ఎక్కుతాను", "Sare, venaka nundi ekkutaanu", "Okay, I'll board from the back"),
      s("అవును, చెప్పండి", "Avunu, cheppandi", "Yes, tell me", "ఎంత?", "Enta?", "How much?"),
      s("ఇరవై రూపాయలు", "Iravai roopaayalu", "Twenty rupees", "ఇదigo", "Idigo", "Here you go"),
      s("ఇదigo, ticket", "Idigo, ticket", "Here, your ticket", "ధన్యవాదాలు", "Dhanyavaadalu", "Thank you"),
    ],
    hard: [
      s("ఎక్కడికి?", "Ekkadiki?", "Where to?", "గోల్కుండ", "Golconda", "Golconda"),
      s("వెనక నుండి ఎక్కు, crowd ఉంది", "Venaka nundi ekku, crowd undi", "Board from the back, it's crowded", "సరే, వెనక నుండి ఎక్కుతాను", "Sare, venaka nundi ekkutaanu", "Okay, I'll board from the back"),
      s("అవును, చెప్పండి", "Avunu, cheppandi", "Yes, tell me", "ఒక ticket ఇవ్వండి", "Oka ticket ivvandi", "One ticket, please"),
      s("చెప్పండి", "Cheppandi", "Tell me", "ఎంత?", "Enta?", "How much?"),
      s("ఇరవై రూపాయలు", "Iravai roopaayalu", "Twenty rupees", "ఇదigo", "Idigo", "Here you go"),
      s("చిల్లర ఉందా?", "Chillar undaa?", "Do you have change?", "అవును, ఇదigo", "Avunu, idigo", "Yes, here you go"),
      s("ఇదigo, ticket", "Idigo, ticket", "Here, your ticket", "ధన్యవాదాలు", "Dhanyavaadalu", "Thank you"),
    ],
  },
};
