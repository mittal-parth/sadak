import type { StreetTaskLessons } from "./types";
import { s } from "./types";

export const LESSONS: Record<string, StreetTaskLessons> = {
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
      s("চল্লিশ টাকা", "Chollish taka", "Forty rupees", "নিন, ধন্যবাদ", "Nin, dhonnobad", "Take it, thank you"),
    ],
    medium: [
      s("কী নেবেন?", "Ki neben?", "What will you take?", "দুটো শিঙ্গারা আর একটা কচুরি", "Duto shingara ar ekta kachori", "Two singaras and one kachori"),
      s("চা?", "Cha?", "Tea?", "হ্যাঁ, এক কাপ", "Hyaa, ek kap", "Yes, one cup"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("চল্লিশ টাকা", "Chollish taka", "Forty rupees", "নিন", "Nin", "Take it"),
      s("ধন্যবাদ", "Dhonnobad", "Thank you", "আবার আসবেন", "Abar asben", "Come again"),
    ],
    hard: [
      s("কী নেবেন?", "Ki neben?", "What will you take?", "দুটো শিঙ্গারা আর একটা কচুরি", "Duto shingara ar ekta kachori", "Two singaras and one kachori"),
      s("চা?", "Cha?", "Tea?", "হ্যাঁ, এক কাপ", "Hyaa, ek kap", "Yes, one cup"),
      s("মিষ্টি চা নাকি?", "Mishti cha naki?", "Sweet tea or not?", "না, সাদা চা", "Na, sada cha", "No, plain tea"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("চল্লিশ টাকা", "Chollish taka", "Forty rupees", "নিন", "Nin", "Take it"),
      s("গরম গরম!", "Garam garam!", "Hot hot!", "ধন্যবাদ", "Dhonnobad", "Thank you"),
      s("নিন", "Nin", "Take it", "ধন্যবাদ", "Dhonnobad", "Thank you"),
    ],
  },
  "park-gully-temple": {
    easy: [
      s("মোমবাতি নেবেন?", "Mombati neben?", "Will you take candles?", "হ্যাঁ, দুটো দিন", "Hyaa, duto din", "Yes, give me two"),
      s("কুড়ি টাকা", "Kuri taka", "Twenty rupees", "নিন, ধন্যবাদ", "Nin, dhonnobad", "Take it, thank you"),
      s("ভেতরে জ্বালিয়ে দিন", "Bhetore jaliye din", "Light them inside", "ঠিক আছে, ধন্যবাদ", "Thik ache, dhonnobad", "Okay, thank you"),
    ],
    medium: [
      s("মোমবাতি নেবেন?", "Mombati neben?", "Will you take candles?", "হ্যাঁ, দুটো দিন", "Hyaa, duto din", "Yes, give me two"),
      s("বড় না ছোট?", "Boro na chhoto?", "Big or small?", "বড় দুটো", "Boro duto", "Two big ones"),
      s("প্রার্থনা শুরু হচ্ছে", "Prarthona shuru hochchhe", "The prayers are starting", "তাহলে তাড়াতাড়ি", "Tahole taratari", "Then quickly"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("তিরিশ টাকা", "Tirish taka", "Thirty rupees", "নিন, ধন্যবাদ", "Nin, dhonnobad", "Take it, thank you"),
    ],
    hard: [
      s("মোমবাতি নেবেন?", "Mombati neben?", "Will you take candles?", "হ্যাঁ, দুটো দিন", "Hyaa, duto din", "Yes, give me two"),
      s("বড় না ছোট?", "Boro na chhoto?", "Big or small?", "বড় দুটো", "Boro duto", "Two big ones"),
      s("প্রার্থনা শুরু হচ্ছে", "Prarthona shuru hochchhe", "The prayers are starting", "তাহলে তাড়াতাড়ি", "Tahole taratari", "Then quickly"),
      s("দেশলাই আছে?", "Deshlai ache?", "Do you have matches?", "না, একটা দিন", "Na, ekta din", "No, give me one"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("বত্রিশ টাকা", "Batrish taka", "Thirty-two rupees", "নিন, ধন্যবাদ", "Nin, dhonnobad", "Take it, thank you"),
      s("ভেতরে জ্বালিয়ে দিন", "Bhetore jaliye din", "Light them inside", "ঠিক আছে, ধন্যবাদ", "Thik ache, dhonnobad", "Okay, thank you"),
    ],
  },
  "park-gully-bus": {
    easy: [
      s("কোথায়?", "Kothay?", "Where to?", "এসপ্ল্যানেড", "Esplanade", "Esplanade"),
      s("দশ টাকা", "Dash taka", "Ten rupees", "নিন", "Nin", "Take it"),
      s("ভেতরে চলুন", "Bhetore cholun", "Move inside", "ঠিক আছে, ধন্যবাদ", "Thik ache, dhonnobad", "Okay, thank you"),
    ],
    medium: [
      s("কোথায়?", "Kothay?", "Where to?", "এসপ্ল্যানেড", "Esplanade", "Esplanade"),
      s("উঠে পড়ুন, তাড়াতাড়ি!", "Uthe porun, taratari!", "Get on, quick!", "ঠিক আছে, উঠছি", "Thik ache, uthchi", "Okay, I'm getting on"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("দশ টাকা", "Dash taka", "Ten rupees", "নিন", "Nin", "Take it"),
      s("ভেতরে চলুন", "Bhetore cholun", "Move inside", "ঠিক আছে, ধন্যবাদ", "Thik ache, dhonnobad", "Okay, thank you"),
    ],
    hard: [
      s("কোথায়?", "Kothay?", "Where to?", "এসপ্ল্যানেড", "Esplanade", "Esplanade"),
      s("উঠে পড়ুন, তাড়াতাড়ি!", "Uthe porun, taratari!", "Get on, quick!", "ঠিক আছে, উঠছি", "Thik ache, uthchi", "Okay, I'm getting on"),
      s("ঠিক আছে", "Thik ache", "Okay", "একটা টিকিট", "Ekta ticket", "One ticket"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("দশ টাকা", "Dash taka", "Ten rupees", "নিন", "Nin", "Take it"),
      s("খুচরো আছে?", "Khuchro ache?", "Got change?", "হ্যাঁ, নিন", "Hyaa, nin", "Yes, take it"),
      s("ভেতরে চলুন", "Bhetore cholun", "Move inside", "ঠিক আছে, ধন্যবাদ", "Thik ache, dhonnobad", "Okay, thank you"),
    ],
  },
  "park-gully-roll": {
    easy: [
      s("কী রোল দেব?", "Ki roll debo?", "Which roll shall I make?", "একটা এগ রোল", "Ekta egg roll", "One egg roll"),
      s("পেঁয়াজ লঙ্কা দেব?", "Peyaj lonka debo?", "Onion and chilli?", "হ্যাঁ, একটু দিন", "Hyaa, ektu din", "Yes, a little"),
      s("ষাট টাকা", "Shaat taka", "Sixty rupees", "নিন, ধন্যবাদ", "Nin, dhonnobad", "Take it, thank you"),
    ],
    medium: [
      s("কী রোল দেব?", "Ki roll debo?", "Which roll shall I make?", "একটা এগ রোল", "Ekta egg roll", "One egg roll"),
      s("ডবল ডিম?", "Double dim?", "Double egg?", "হ্যাঁ, ডবল ডিম", "Hyaa, double dim", "Yes, double egg"),
      s("পেঁয়াজ লঙ্কা দেব?", "Peyaj lonka debo?", "Onion and chilli?", "হ্যাঁ, একটু দিন", "Hyaa, ektu din", "Yes, a little"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("আশি টাকা", "Aashi taka", "Eighty rupees", "নিন, ধন্যবাদ", "Nin, dhonnobad", "Take it, thank you"),
    ],
    hard: [
      s("কী রোল দেব?", "Ki roll debo?", "Which roll shall I make?", "একটা এগ রোল", "Ekta egg roll", "One egg roll"),
      s("ডবল ডিম?", "Double dim?", "Double egg?", "হ্যাঁ, ডবল ডিম", "Hyaa, double dim", "Yes, double egg"),
      s("একটু দাঁড়ান, ভিড় আছে", "Ektu daran, bhir ache", "Wait a bit, it's crowded", "ঠিক আছে, অপেক্ষা করছি", "Thik ache, opekkha korchi", "Okay, I'm waiting"),
      s("পেঁয়াজ লঙ্কা দেব?", "Peyaj lonka debo?", "Onion and chilli?", "হ্যাঁ, একটু দিন", "Hyaa, ektu din", "Yes, a little"),
      s("আর কিছু?", "Ar kichu?", "Anything else?", "না, এটুকুই", "Na, etukui", "No, that's all"),
      s("ঠিক আছে", "Thik ache", "Okay", "কত?", "Koto?", "How much?"),
      s("আশি টাকা", "Aashi taka", "Eighty rupees", "নিন, ধন্যবাদ", "Nin, dhonnobad", "Take it, thank you"),
    ],
  },
  "park-gully-barber": {
    easy: [
      s("আসুন, বসুন। কী করতে হবে?", "Aashun, boshun. Ki korte hobe?", "Come, sit. What needs doing?", "চুল কেটে দিন", "Chul kete din", "Please cut my hair"),
      s("ঠিক আছে, একটু অপেক্ষা করতে হবে", "Thik achhe, ektu opekkha korte hobe", "Alright, you'll have to wait a little", "কত সময় লাগবে?", "Koto shomoy laagbe?", "How long will it take?"),
      s("দশ মিনিট", "Dosh minit", "Ten minutes", "ঠিক আছে, অপেক্ষা করছি", "Thik achhe, opekkha korchhi", "Okay, I'll wait"),
    ],
    medium: [
      s("আসুন, বসুন। কী করতে হবে?", "Aashun, boshun. Ki korte hobe?", "Come, sit. What needs doing?", "চুল কেটে দিন", "Chul kete din", "Please cut my hair"),
      s("ঠিক আছে, একটু অপেক্ষা করতে হবে", "Thik achhe, ektu opekkha korte hobe", "Alright, you'll have to wait a little", "কত সময় লাগবে?", "Koto shomoy laagbe?", "How long will it take?"),
      s("দশ মিনিট", "Dosh minit", "Ten minutes", "ঠিক আছে, অপেক্ষা করছি", "Thik achhe, opekkha korchhi", "Okay, I'll wait"),
      s("হয়ে গেছে। কেমন লাগছে?", "Hoye gechhe. Kemon laagchhe?", "Done. How does it look?", "খুব ভালো! কত হল?", "Khub bhalo! Koto holo?", "Very nice! How much?"),
      s("আশি টাকা", "Aashi taka", "Eighty rupees", "এই নিন, ধন্যবাদ", "Ei nin, dhonnobad", "Here you go, thank you"),
    ],
    hard: [
      s("আসুন, বসুন। কী করতে হবে?", "Aashun, boshun. Ki korte hobe?", "Come, sit. What needs doing?", "চুল কেটে দিন", "Chul kete din", "Please cut my hair"),
      s("ঠিক আছে, একটু অপেক্ষা করতে হবে", "Thik achhe, ektu opekkha korte hobe", "Alright, you'll have to wait a little", "কত সময় লাগবে?", "Koto shomoy laagbe?", "How long will it take?"),
      s("দশ মিনিট", "Dosh minit", "Ten minutes", "ঠিক আছে, অপেক্ষা করছি", "Thik achhe, opekkha korchhi", "Okay, I'll wait"),
      s("ছোট, না শুধু একটু ছাঁটা?", "Chhoto, na shudhu ektu chhaanta?", "Short, or just a trim?", "শুধু একটু ছাঁটুন", "Shudhu ektu chhaatun", "Just a trim"),
      s("দাড়িও কামাবো?", "Daario kamabo?", "Shave as well?", "না, শুধু চুল", "Na, shudhu chul", "No, just the haircut"),
      s("হয়ে গেছে। কেমন লাগছে?", "Hoye gechhe. Kemon laagchhe?", "Done. How does it look?", "খুব ভালো! কত হল?", "Khub bhalo! Koto holo?", "Very nice! How much?"),
      s("আশি টাকা", "Aashi taka", "Eighty rupees", "এই নিন, ধন্যবাদ", "Ei nin, dhonnobad", "Here you go, thank you"),
    ],
  },
};
