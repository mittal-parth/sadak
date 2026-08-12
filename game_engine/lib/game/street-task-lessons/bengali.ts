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
  "park-gully-barber": {
    easy: [
      s("আসুন, বসুন। কী করতে হবে?", "Aashun, boshun. Ki korte hobe?", "Come, sit. What needs doing?", "চুল কেটে দিন", "Chul kete din", "Please cut my hair"),
      s("ঠিক আছে, একটু অপেক্ষা করতে হবে", "Thik achhe, ektu opekkha korte hobe", "Alright, you'll have to wait a little", "কত সময় লাগবে?", "Koto shomoy laagbe?", "How long will it take?"),
    ],
    medium: [
      s("আসুন, বসুন। কী করতে হবে?", "Aashun, boshun. Ki korte hobe?", "Come, sit. What needs doing?", "চুল কেটে দিন", "Chul kete din", "Please cut my hair"),
      s("ঠিক আছে, একটু অপেক্ষা করতে হবে", "Thik achhe, ektu opekkha korte hobe", "Alright, you'll have to wait a little", "কত সময় লাগবে?", "Koto shomoy laagbe?", "How long will it take?"),
    ],
    hard: [
      s("আসুন, বসুন। কী করতে হবে?", "Aashun, boshun. Ki korte hobe?", "Come, sit. What needs doing?", "চুল কেটে দিন", "Chul kete din", "Please cut my hair"),
      s("ঠিক আছে, একটু অপেক্ষা করতে হবে", "Thik achhe, ektu opekkha korte hobe", "Alright, you'll have to wait a little", "কত সময় লাগবে?", "Koto shomoy laagbe?", "How long will it take?"),
    ],
  },
};
