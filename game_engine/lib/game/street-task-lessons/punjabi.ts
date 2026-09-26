import type { StreetTaskLessons } from "./types";
import { s } from "./types";

export const LESSONS: Record<string, StreetTaskLessons> = {
  "hall-bazaar-auto": {
    easy: [
      s("ਕਿੱਥੇ ਜਾਣਾ ਹੈ?", "Kitthe jaanaa hai?", "Where do you want to go?", "ਰੇਲਵੇ ਸਟੇਸ਼ਨ", "Railway station", "Railway station"),
      s("ਠੀਕ ਹੈ, ਕਿੰਨੇ ਦਿਓਗੇ?", "Theek hai, kinne dioge?", "Fine, what will you pay?", "ਡੇਢ ਸੌ?", "Dedh sau?", "Will you go for 150?"),
      s("ਚਲੋ, ਬੈਠ ਜਾਓ", "Chalo, baith jao", "Come on, get in", "ਧੰਨਵਾਦ, ਚਲੀਏ", "Dhannvaad, chalie", "Thank you, let's go"),
    ],
    medium: [
      s("ਕਿੱਥੇ ਜਾਣਾ ਹੈ?", "Kitthe jaanaa hai?", "Where do you want to go?", "ਰੇਲਵੇ ਸਟੇਸ਼ਨ", "Railway station", "Railway station"),
      s("ਤਿੰਨ ਸੌ! ਪੈਟਰੋਲ ਮਹਿੰਗਾ ਹੈ ਭਾਈ", "Teen sau! Petrol mehnga hai bhai", "Three hundred! Petrol is expensive, brother", "ਸਮਝ ਗਿਆ, ਪਰ ਥੋੜਾ ਘਟਾਓ", "Samajh gaya, par thoda ghatao", "I understand, but please reduce it a bit"),
      s("ਠੀਕ ਹੈ, ਦੱਸੋ", "Theek hai, daso", "Fine, tell me", "ਕਿੰਨੇ ਦਾ ਹੈ?", "Kinne da hai?", "How much is it?"),
      s("ਠੀਕ ਹੈ, ਕਿੰਨੇ ਦਿਓਗੇ?", "Theek hai, kinne dioge?", "Fine, what will you pay?", "ਡੇਢ ਸੌ?", "Dedh sau?", "Will you go for 150?"),
      s("ਚਲੋ, ਬੈਠ ਜਾਓ", "Chalo, baith jao", "Come on, get in", "ਧੰਨਵਾਦ, ਚਲੀਏ", "Dhannvaad, chalie", "Thank you, let's go"),
    ],
    hard: [
      s("ਕਿੱਥੇ ਜਾਣਾ ਹੈ?", "Kitthe jaanaa hai?", "Where do you want to go?", "ਰੇਲਵੇ ਸਟੇਸ਼ਨ", "Railway station", "Railway station"),
      s("ਅੱਜ ਭੀੜ ਬਹੁਤ ਹੈ", "Ajj bheer bahut hai", "It's very crowded today", "ਹਾਂ, ਜਲਦੀ ਹੈ", "Haan, jaldi hai", "Yes, I'm in a hurry"),
      s("ਤਿੰਨ ਸੌ! ਪੈਟਰੋਲ ਮਹਿੰਗਾ ਹੈ ਭਾਈ", "Teen sau! Petrol mehnga hai bhai", "Three hundred! Petrol is expensive, brother", "ਸਮਝ ਗਿਆ, ਪਰ ਥੋੜਾ ਘਟਾਓ", "Samajh gaya, par thoda ghatao", "I understand, but please reduce it a bit"),
      s("ਠੀਕ ਹੈ, ਦੱਸੋ", "Theek hai, daso", "Fine, tell me", "ਕਿੰਨੇ ਦਾ ਹੈ?", "Kinne da hai?", "How much is it?"),
      s("ਠੀਕ ਹੈ, ਕਿੰਨੇ ਦਿਓਗੇ?", "Theek hai, kinne dioge?", "Fine, what will you pay?", "ਡੇਢ ਸੌ?", "Dedh sau?", "Will you go for 150?"),
      s("ਮੀਟਰ ਨਾਲ?", "Meter naal?", "Will you go by meter?", "ਨਹੀਂ, ਪੱਕਾ ਕਿਰਾਇਆ", "Nahin, pakka kiraya", "No, fixed fare"),
      s("ਚਲੋ, ਬੈਠ ਜਾਓ", "Chalo, baith jao", "Come on, get in", "ਧੰਨਵਾਦ, ਚਲੀਏ", "Dhannvaad, chalie", "Thank you, let's go"),
    ],
  },
  "hall-bazaar-shop": {
    easy: [
      s("ਕੀ ਲੈਂਗੇ?", "Ki lenge?", "What will you have?", "ਇੱਕ ਲੱਸੀ", "Ik lassi", "One lassi, please"),
      s("ਓਏ, ਉਹ ਬਿੱਲੀ ਫਿਰ ਆ ਗਈ!", "Oye, uh billi phir aa gayi!", "Hey, that cat is back again!", "ਕੋਈ ਗੱਲ ਨਹੀਂ, ਲੱਸੀ ਦਿਓ", "Koi gall nahin, lassi do", "No problem, give me the lassi"),
      s("ਚਾਲੀ ਰੁਪਏ", "Chaali rupaye", "Forty rupees", "ਲੋ, ਧੰਨਵਾਦ", "Lo, dhannvaad", "Here you go, thank you"),
    ],
    medium: [
      s("ਕੀ ਲੈਂਗੇ?", "Ki lenge?", "What will you have?", "ਇੱਕ ਲੱਸੀ", "Ik lassi", "One lassi, please"),
      s("ਚਾਹ ਵੀ?", "Chaah vi?", "Chai as well?", "ਹਾਂ, ਇੱਕ ਕੱਪ", "Haan, ik kapp", "Yes, one cup of tea"),
      s("ਠੀਕ ਹੈ", "Theek hai", "Okay", "ਕਿੰਨੇ ਪੈਸੇ ਹੋਏ?", "Kinne paise hoe?", "What do I owe you?"),
      s("ਚਾਲੀ ਰੁਪਏ", "Chaali rupaye", "Forty rupees", "ਲੋ", "Lo", "Here you go"),
      s("ਲੈ ਲੋ", "Lai lo", "Take it", "ਧੰਨਵਾਦ", "Dhannvaad", "Thank you"),
    ],
    hard: [
      s("ਕੀ ਲੈਂਗੇ?", "Ki lenge?", "What will you have?", "ਇੱਕ ਲੱਸੀ", "Ik lassi", "One lassi, please"),
      s("ਚਾਹ ਵੀ?", "Chaah vi?", "Chai as well?", "ਹਾਂ, ਇੱਕ ਕੱਪ", "Haan, ik kapp", "Yes, one cup of tea"),
      s("ਮਿੱਠੀ ਲੱਸੀ?", "Meethi lassi?", "Sweet lassi?", "ਹਾਂ, ਮਿੱਠੀ", "Haan, meethi", "Yes, sweet"),
      s("ਦੱਸੋ", "Daso", "Tell me", "ਕਿੰਨੇ ਪੈਸੇ ਹੋਏ?", "Kinne paise hoe?", "What do I owe you?"),
      s("ਚਾਲੀ ਰੁਪਏ", "Chaali rupaye", "Forty rupees", "ਲੋ", "Lo", "Here you go"),
      s("ਹੋਰ ਕੁਝ?", "Hor kujh?", "Anything else?", "ਨਹੀਂ, ਬਸ", "Nahin, bas", "No, that's all"),
      s("ਲੈ ਲੋ", "Lai lo", "Take it", "ਧੰਨਵਾਦ", "Dhannvaad", "Thank you"),
    ],
  },
  "hall-bazaar-temple": {
    easy: [
      s("ਸਿਰ ਢੱਕਿਆ ਹੈ?", "Sir dhakkeya hai?", "Is your head covered?", "ਹਾਂ ਜੀ, ਰੁਮਾਲ ਬੰਨ੍ਹਿਆ ਹੈ", "Haan ji, rumaal banneya hai", "Yes, I've tied a handkerchief"),
      s("ਦੋਵੇਂ ਹੱਥ ਅੱਗੇ ਕਰੋ ਜੀ", "Dovein hath agge karo ji", "Hold out both hands", "ਠੀਕ ਹੈ ਜੀ", "Theek hai ji", "Okay"),
      s("ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ", "Waheguru ji ka Khalsa", "Waheguru ji ka Khalsa", "ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਿਹ", "Waheguru ji ki Fateh", "Waheguru ji ki Fateh"),
    ],
    medium: [
      s("ਸਿਰ ਢੱਕਿਆ ਹੈ?", "Sir dhakkeya hai?", "Is your head covered?", "ਹਾਂ ਜੀ, ਰੁਮਾਲ ਬੰਨ੍ਹਿਆ ਹੈ", "Haan ji, rumaal banneya hai", "Yes, I've tied a handkerchief"),
      s("ਦੋਵੇਂ ਹੱਥ ਅੱਗੇ ਕਰੋ ਜੀ", "Dovein hath agge karo ji", "Hold out both hands", "ਠੀਕ ਹੈ ਜੀ", "Theek hai ji", "Okay"),
      s("ਥੋੜਾ ਹੋਰ?", "Thoda hor?", "A little more?", "ਹਾਂ ਜੀ, ਥੋੜਾ ਜਿਹਾ", "Haan ji, thoda jiha", "Yes, just a little"),
      s("ਸੰਗਤ ਆ ਰਹੀ ਹੈ, ਅੱਗੇ ਚੱਲੋ", "Sangat aa rahi hai, agge challo", "The congregation is coming, move along", "ਹਾਂ ਜੀ, ਚੱਲਦਾ ਹਾਂ", "Haan ji, chalda haan", "Yes, I'm moving"),
      s("ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ", "Waheguru ji ka Khalsa", "Waheguru ji ka Khalsa", "ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਿਹ", "Waheguru ji ki Fateh", "Waheguru ji ki Fateh"),
    ],
    hard: [
      s("ਸਿਰ ਢੱਕਿਆ ਹੈ?", "Sir dhakkeya hai?", "Is your head covered?", "ਹਾਂ ਜੀ, ਰੁਮਾਲ ਬੰਨ੍ਹਿਆ ਹੈ", "Haan ji, rumaal banneya hai", "Yes, I've tied a handkerchief"),
      s("ਦੋਵੇਂ ਹੱਥ ਅੱਗੇ ਕਰੋ ਜੀ", "Dovein hath agge karo ji", "Hold out both hands", "ਠੀਕ ਹੈ ਜੀ", "Theek hai ji", "Okay"),
      s("ਥੋੜਾ ਹੋਰ?", "Thoda hor?", "A little more?", "ਹਾਂ ਜੀ, ਥੋੜਾ ਜਿਹਾ", "Haan ji, thoda jiha", "Yes, just a little"),
      s("ਘਿਓ ਵਾਲਾ ਹੈ, ਗਰਮ ਹੈ", "Ghio wala hai, garam hai", "It's made with ghee, still warm", "ਬਹੁਤ ਸੁਆਦ ਹੈ ਜੀ", "Bahut suaad hai ji", "It's delicious"),
      s("ਪਰਿਕਰਮਾ ਕਰ ਲਈ?", "Parikrama kar lai?", "Have you walked the parikrama?", "ਹਾਂ ਜੀ, ਹੁਣੇ ਕੀਤੀ", "Haan ji, hune keeti", "Yes, just now"),
      s("ਸੰਗਤ ਆ ਰਹੀ ਹੈ, ਅੱਗੇ ਚੱਲੋ", "Sangat aa rahi hai, agge challo", "The congregation is coming, move along", "ਹਾਂ ਜੀ, ਚੱਲਦਾ ਹਾਂ", "Haan ji, chalda haan", "Yes, I'm moving"),
      s("ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ", "Waheguru ji ka Khalsa", "Waheguru ji ka Khalsa", "ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਿਹ", "Waheguru ji ki Fateh", "Waheguru ji ki Fateh"),
    ],
  },
  "hall-bazaar-bus": {
    easy: [
      s("ਕਿੱਥੇ ਜਾਣਾ ਹੈ?", "Kitthe jaanaa hai?", "Where are you going?", "ਹਾਲ ਬਜ਼ਾਰ", "Hall Bazaar", "Hall Bazaar"),
      s("ਵੀਹ ਰੁਪਏ", "Veeh rupaye", "Twenty rupees", "ਲੋ", "Lo", "Here you go"),
      s("ਲੋ, ਟਿਕਟ", "Lo, ticket", "Here, your ticket", "ਧੰਨਵਾਦ", "Dhannvaad", "Thank you"),
    ],
    medium: [
      s("ਕਿੱਥੇ ਜਾਣਾ ਹੈ?", "Kitthe jaanaa hai?", "Where are you going?", "ਹਾਲ ਬਜ਼ਾਰ", "Hall Bazaar", "Hall Bazaar"),
      s("ਪਿਛੇ ਚੜ੍ਹੋ, ਭੀੜ ਹੈ", "Pichhe chadho, bheer hai", "Board from the back, it's crowded", "ਠੀਕ ਹੈ, ਪਿਛੇ ਚੜ੍ਹਦਾ", "Theek hai, pichhe chadhta", "Okay, I'll board from the back"),
      s("ਹਾਂ, ਦੱਸੋ", "Haan, daso", "Yes, tell me", "ਕਿੰਨੇ ਦਾ ਹੈ?", "Kinne da hai?", "How much is it?"),
      s("ਵੀਹ ਰੁਪਏ", "Veeh rupaye", "Twenty rupees", "ਲੋ", "Lo", "Here you go"),
      s("ਲੋ, ਟਿਕਟ", "Lo, ticket", "Here, your ticket", "ਧੰਨਵਾਦ", "Dhannvaad", "Thank you"),
    ],
    hard: [
      s("ਕਿੱਥੇ ਜਾਣਾ ਹੈ?", "Kitthe jaanaa hai?", "Where are you going?", "ਹਾਲ ਬਜ਼ਾਰ", "Hall Bazaar", "Hall Bazaar"),
      s("ਪਿਛੇ ਚੜ੍ਹੋ, ਭੀੜ ਹੈ", "Pichhe chadho, bheer hai", "Board from the back, it's crowded", "ਠੀਕ ਹੈ, ਪਿਛੇ ਚੜ੍ਹਦਾ", "Theek hai, pichhe chadhta", "Okay, I'll board from the back"),
      s("ਹਾਂ, ਦੱਸੋ", "Haan, daso", "Yes, tell me", "ਇੱਕ ਟਿਕਟ", "Ik ticket", "One ticket, please"),
      s("ਦੱਸੋ", "Daso", "Tell me", "ਕਿੰਨੇ ਦਾ ਹੈ?", "Kinne da hai?", "How much is it?"),
      s("ਵੀਹ ਰੁਪਏ", "Veeh rupaye", "Twenty rupees", "ਲੋ", "Lo", "Here you go"),
      s("ਛੋਟੇ ਨੋਟ?", "Chhote note?", "Do you have small notes?", "ਹਾਂ, ਲੋ", "Haan, lo", "Yes, here you go"),
      s("ਲੋ, ਟਿਕਟ", "Lo, ticket", "Here, your ticket", "ਧੰਨਵਾਦ", "Dhannvaad", "Thank you"),
    ],
  },
  "hall-bazaar-langar": {
    easy: [
      s("ਸਿਰ ਢੱਕ ਲਓ ਜੀ", "Sir dhakk lao ji", "Please cover your head", "ਹਾਂ ਜੀ, ਢੱਕ ਲਿਆ", "Haan ji, dhakk liya", "Yes, I've covered it"),
      s("ਪ੍ਰਸ਼ਾਦਾ ਲਓ ਜੀ", "Parshada lao ji", "Please take the roti", "ਹਾਂ ਜੀ, ਦੋ ਪ੍ਰਸ਼ਾਦੇ", "Haan ji, do parshade", "Yes, two rotis please"),
      s("ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ", "Waheguru ji ka Khalsa", "Waheguru ji ka Khalsa", "ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਿਹ", "Waheguru ji ki Fateh", "Waheguru ji ki Fateh"),
    ],
    medium: [
      s("ਸਿਰ ਢੱਕ ਲਓ ਜੀ", "Sir dhakk lao ji", "Please cover your head", "ਹਾਂ ਜੀ, ਢੱਕ ਲਿਆ", "Haan ji, dhakk liya", "Yes, I've covered it"),
      s("ਪੰਗਤ ਵਿੱਚ ਬੈਠੋ ਜੀ", "Pangat vich baitho ji", "Please sit in the row", "ਠੀਕ ਹੈ ਜੀ", "Theek hai ji", "Okay"),
      s("ਪ੍ਰਸ਼ਾਦਾ ਲਓ ਜੀ", "Parshada lao ji", "Please take the roti", "ਹਾਂ ਜੀ, ਦੋ ਪ੍ਰਸ਼ਾਦੇ", "Haan ji, do parshade", "Yes, two rotis please"),
      s("ਦਾਲ ਹੋਰ?", "Daal hor?", "More dal?", "ਹਾਂ ਜੀ, ਥੋੜੀ ਜਿਹੀ", "Haan ji, thodi jihi", "Yes, just a little"),
      s("ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ", "Waheguru ji ka Khalsa", "Waheguru ji ka Khalsa", "ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਿਹ", "Waheguru ji ki Fateh", "Waheguru ji ki Fateh"),
    ],
    hard: [
      s("ਸਿਰ ਢੱਕ ਲਓ ਜੀ", "Sir dhakk lao ji", "Please cover your head", "ਹਾਂ ਜੀ, ਢੱਕ ਲਿਆ", "Haan ji, dhakk liya", "Yes, I've covered it"),
      s("ਪੰਗਤ ਵਿੱਚ ਬੈਠੋ ਜੀ", "Pangat vich baitho ji", "Please sit in the row", "ਠੀਕ ਹੈ ਜੀ", "Theek hai ji", "Okay"),
      s("ਪ੍ਰਸ਼ਾਦਾ ਲਓ ਜੀ", "Parshada lao ji", "Please take the roti", "ਹਾਂ ਜੀ, ਦੋ ਪ੍ਰਸ਼ਾਦੇ", "Haan ji, do parshade", "Yes, two rotis please"),
      s("ਖੀਰ ਵੀ ਲਓ", "Kheer vi lao", "Have some kheer too", "ਹਾਂ ਜੀ, ਧੰਨਵਾਦ", "Haan ji, dhannvaad", "Yes, thank you"),
      s("ਦਾਲ ਹੋਰ?", "Daal hor?", "More dal?", "ਹਾਂ ਜੀ, ਥੋੜੀ ਜਿਹੀ", "Haan ji, thodi jihi", "Yes, just a little"),
      s("ਹੋਰ ਕੁਝ?", "Hor kujh?", "Anything else?", "ਨਹੀਂ ਜੀ, ਬਸ", "Nahin ji, bas", "No, that's all"),
      s("ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ", "Waheguru ji ka Khalsa", "Waheguru ji ka Khalsa", "ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਿਹ", "Waheguru ji ki Fateh", "Waheguru ji ki Fateh"),
    ],
  },
  "hall-bazaar-barber": {
    easy: [
      s("ਆਓ ਜੀ, ਬੈਠੋ। ਕੀ ਕਰਵਾਉਣਾ ਹੈ?", "Aao ji, baitho. Ki karvaauna hai?", "Come, sit down. What would you like done?", "ਵਾਲ ਕੱਟ ਦਿਓ", "Vaal katt dio", "Please cut my hair"),
      s("ਠੀਕ ਹੈ, ਥੋੜ੍ਹਾ ਉਡੀਕਣਾ ਪਵੇਗਾ", "Thik hai, thorha udeekna pavega", "Alright, you'll have to wait a bit", "ਕਿੰਨਾ ਸਮਾਂ ਲੱਗੇਗਾ?", "Kinna samaan laggega?", "How long will it take?"),
      s("ਦਸ ਮਿੰਟ", "Das minat", "Ten minutes", "ਠੀਕ ਹੈ, ਉਡੀਕਦਾ ਹਾਂ", "Thik hai, udeekda haan", "Okay, I'll wait"),
    ],
    medium: [
      s("ਆਓ ਜੀ, ਬੈਠੋ। ਕੀ ਕਰਵਾਉਣਾ ਹੈ?", "Aao ji, baitho. Ki karvaauna hai?", "Come, sit down. What would you like done?", "ਵਾਲ ਕੱਟ ਦਿਓ", "Vaal katt dio", "Please cut my hair"),
      s("ਠੀਕ ਹੈ, ਥੋੜ੍ਹਾ ਉਡੀਕਣਾ ਪਵੇਗਾ", "Thik hai, thorha udeekna pavega", "Alright, you'll have to wait a bit", "ਕਿੰਨਾ ਸਮਾਂ ਲੱਗੇਗਾ?", "Kinna samaan laggega?", "How long will it take?"),
      s("ਦਸ ਮਿੰਟ", "Das minat", "Ten minutes", "ਠੀਕ ਹੈ, ਉਡੀਕਦਾ ਹਾਂ", "Thik hai, udeekda haan", "Okay, I'll wait"),
      s("ਹੋ ਗਿਆ। ਕਿਵੇਂ ਲੱਗਿਆ?", "Ho gaya. Kiven laggeya?", "Done. How does it look?", "ਬਹੁਤ ਵਧੀਆ! ਕਿੰਨੇ ਹੋਏ?", "Bahut vadhiya! Kinne hoye?", "Very nice! How much?"),
      s("ਅੱਸੀ ਰੁਪਏ", "Assi rupaye", "Eighty rupees", "ਲਓ ਜੀ, ਧੰਨਵਾਦ", "Lao ji, dhannvaad", "Here you go, thank you"),
    ],
    hard: [
      s("ਆਓ ਜੀ, ਬੈਠੋ। ਕੀ ਕਰਵਾਉਣਾ ਹੈ?", "Aao ji, baitho. Ki karvaauna hai?", "Come, sit down. What would you like done?", "ਵਾਲ ਕੱਟ ਦਿਓ", "Vaal katt dio", "Please cut my hair"),
      s("ਠੀਕ ਹੈ, ਥੋੜ੍ਹਾ ਉਡੀਕਣਾ ਪਵੇਗਾ", "Thik hai, thorha udeekna pavega", "Alright, you'll have to wait a bit", "ਕਿੰਨਾ ਸਮਾਂ ਲੱਗੇਗਾ?", "Kinna samaan laggega?", "How long will it take?"),
      s("ਦਸ ਮਿੰਟ", "Das minat", "Ten minutes", "ਠੀਕ ਹੈ, ਉਡੀਕਦਾ ਹਾਂ", "Thik hai, udeekda haan", "Okay, I'll wait"),
      s("ਛੋਟੇ ਜਾਂ ਬਸ ਹਲਕੇ?", "Chhote jaan bas halke?", "Short, or just a trim?", "ਬਸ ਹਲਕੇ ਜਿਹੇ", "Bas halke jihe", "Just a trim"),
      s("ਦਾੜ੍ਹੀ ਵੀ ਬਣਾਵਾਂ?", "Daarhi vi banaavaan?", "Shave as well?", "ਨਹੀਂ, ਬਸ ਵਾਲ", "Nahin, bas vaal", "No, just the haircut"),
      s("ਹੋ ਗਿਆ। ਕਿਵੇਂ ਲੱਗਿਆ?", "Ho gaya. Kiven laggeya?", "Done. How does it look?", "ਬਹੁਤ ਵਧੀਆ! ਕਿੰਨੇ ਹੋਏ?", "Bahut vadhiya! Kinne hoye?", "Very nice! How much?"),
      s("ਅੱਸੀ ਰੁਪਏ", "Assi rupaye", "Eighty rupees", "ਲਓ ਜੀ, ਧੰਨਵਾਦ", "Lao ji, dhannvaad", "Here you go, thank you"),
    ],
  },
};
