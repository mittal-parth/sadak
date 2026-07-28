import type { StreetTaskLessons } from "./types";
import { s } from "./types";

export const LESSONS: Record<string, StreetTaskLessons> = {
  "manek-chowk-auto": {
    easy: [
      s("ક્યાં જવું છે?", "Kyaan javu che?", "Where do you want to go?", "કાલુપુર રેલવે સ્ટેશન", "Kalupur railway station", "Kalupur railway station"),
      s("ઠીક, કેટલા આપશો?", "Theek, ketlaa aapsho?", "Fine, what will you pay?", "ડોઢ સો?", "Dodh so?", "Will you go for 150?"),
      s("ચાલ, બેસ", "Chaal, bes", "Come on, get in", "આભાર, ચાલીએ", "Aabhaar, chaalie", "Thank you, let's go"),
    ],
    medium: [
      s("ક્યાં જવું છે?", "Kyaan javu che?", "Where do you want to go?", "કાલુપુર રેલવે સ્ટેશન", "Kalupur railway station", "Kalupur railway station"),
      s("ત્રણ સો! પેટ્રોલ મોંઘું છે ભાઈ", "Tran so! Petrol monghu che bhaai", "Three hundred! Petrol is expensive, brother", "હા, થોડું ઓછું કરો", "Haa, thodu ochhu karo", "Yes, please reduce it a bit"),
      s("ઠીક, કહો", "Theek, kaho", "Fine, tell me", "કેટલા?", "Ketlaa?", "How much?"),
      s("ઠીક, કેટલા આપશો?", "Theek, ketlaa aapsho?", "Fine, what will you pay?", "ડોઢ સો?", "Dodh so?", "Will you go for 150?"),
      s("ચાલ, બેસ", "Chaal, bes", "Come on, get in", "આભાર, ચાલીએ", "Aabhaar, chaalie", "Thank you, let's go"),
    ],
    hard: [
      s("ક્યાં જવું છે?", "Kyaan javu che?", "Where do you want to go?", "કાલુપુર રેલવે સ્ટેશન", "Kalupur railway station", "Kalupur railway station"),
      s("આજે ભીડ ઘણી છે", "Aaje bheed ghani che", "It's very crowded today", "હા, જલ્દી છે", "Haa, jaldi che", "Yes, I'm in a hurry"),
      s("ત્રણ સો! પેટ્રોલ મોંઘું છે ભાઈ", "Tran so! Petrol monghu che bhaai", "Three hundred! Petrol is expensive, brother", "હા, થોડું ઓછું કરો", "Haa, thodu ochhu karo", "Yes, please reduce it a bit"),
      s("ઠીક, કહો", "Theek, kaho", "Fine, tell me", "કેટલા?", "Ketlaa?", "How much?"),
      s("ઠીક, કેટલા આપશો?", "Theek, ketlaa aapsho?", "Fine, what will you pay?", "ડોઢ સો?", "Dodh so?", "Will you go for 150?"),
      s("મીટરથી?", "Meeterthi?", "By meter?", "ના, નક્કી ભાડું", "Naa, nakki bhaadu", "No, fixed fare"),
      s("ચાલ, બેસ", "Chaal, bes", "Come on, get in", "આભાર, ચાલીએ", "Aabhaar, chaalie", "Thank you, let's go"),
    ],
  },
  "manek-chowk-shop": {
    easy: [
      s("શું લેશ?", "Shu lesh?", "What will you have?", "ફાફડા અને જલેબી", "Fafda ane jalebi", "Fafda and jalebi, please"),
      s("અરે, તે બિલાડી ફરી આવી!", "Are, te bilaadi phiri aavi!", "Hey, that cat is back again!", "કંઈ નહીં, ફાફડા-જલેબી આપો", "Kain nahin, fafda-jalebi aapo", "No problem, give me fafda-jalebi"),
      s("ચાલીસ રૂપિયા", "Chaalis rupiya", "Forty rupees", "લો, આભાર", "Lo, aabhaar", "Here you go, thank you"),
    ],
    medium: [
      s("શું લેશ?", "Shu lesh?", "What will you have?", "ફાફડા અને જલેબી", "Fafda ane jalebi", "Fafda and jalebi, please"),
      s("છાશ પણ?", "Chhaash pan?", "Buttermilk as well?", "હા, એક છાશ", "Haa, ek chhaash", "Yes, one chaas"),
      s("ઠીક", "Theek", "Okay", "કેટલા થયા?", "Ketlaa thaya?", "What do I owe you?"),
      s("ચાલીસ રૂપિયા", "Chaalis rupiya", "Forty rupees", "લો", "Lo", "Here you go"),
      s("લો", "Lo", "Take it", "આભાર", "Aabhaar", "Thank you"),
    ],
    hard: [
      s("શું લેશ?", "Shu lesh?", "What will you have?", "ફાફડા અને જલેબી", "Fafda ane jalebi", "Fafda and jalebi, please"),
      s("છાશ પણ?", "Chhaash pan?", "Buttermilk as well?", "હા, એક છાશ", "Haa, ek chhaash", "Yes, one chaas"),
      s("જલેબી ગરમ?", "Jalebi garam?", "Hot jalebi?", "હા, ગરમ જ", "Haa, garam j", "Yes, hot please"),
      s("કહો", "Kaho", "Tell me", "કેટલા થયા?", "Ketlaa thaya?", "What do I owe you?"),
      s("ચાલીસ રૂપિયા", "Chaalis rupiya", "Forty rupees", "લો", "Lo", "Here you go"),
      s("બીજું કંઈ?", "Bijun kain?", "Anything else?", "ના, એટલું જ", "Naa, etlu j", "No, that's all"),
      s("લો", "Lo", "Take it", "આભાર", "Aabhaar", "Thank you"),
    ],
  },
  "manek-chowk-temple": {
    easy: [
      s("મંદિર માટે ફૂલ?", "Mandir maate phool?", "Flowers for the temple?", "હા, બે ગેંદાની માળા", "Haa, be gendaani maalaa", "Yes, two marigold garlands"),
      s("ચાલીસમાં લો", "Chaalismaan lo", "Take it for forty", "આભાર, લો", "Aabhaar, lo", "Thank you, here you go"),
      s("જાઓ, દર્શન કરો", "Jaao, darshan karo", "Go, take darshan", "આભાર", "Aabhaar", "Thank you"),
    ],
    medium: [
      s("મંદિર માટે ફૂલ?", "Mandir maate phool?", "Flowers for the temple?", "હા, બે ગેંદાની માળા", "Haa, be gendaani maalaa", "Yes, two marigold garlands"),
      s("ઘંટ વાગે છે, જલ્દી!", "Ghant vaage che, jaldi!", "The bell is ringing, hurry!", "હા, જલ્દી", "Haa, jaldi", "Yes, quickly"),
      s("કહો", "Kaho", "Tell me", "કેટલા?", "Ketlaa?", "How much?"),
      s("પચાસ રૂપિયા", "Pachaas rupiya", "Fifty rupees", "ચાલીસમાં આપો", "Chaalismaan aapo", "Give it for forty"),
      s("ચાલીસમાં લો", "Chaalismaan lo", "Take it for forty", "આભાર, લો", "Aabhaar, lo", "Thank you, here you go"),
    ],
    hard: [
      s("મંદિર માટે ફૂલ?", "Mandir maate phool?", "Flowers for the temple?", "હા, બે ગેંદાની માળા", "Haa, be gendaani maalaa", "Yes, two marigold garlands"),
      s("ઘંટ વાગે છે, જલ્દી!", "Ghant vaage che, jaldi!", "The bell is ringing, hurry!", "હા, જલ્દી", "Haa, jaldi", "Yes, quickly"),
      s("કહો", "Kaho", "Tell me", "કેટલા?", "Ketlaa?", "How much?"),
      s("પચાસ રૂપિયા", "Pachaas rupiya", "Fifty rupees", "ચાલીસમાં આપો", "Chaalismaan aapo", "Give it for forty"),
      s("બીજું કંઈ?", "Bijun kain?", "Need anything else?", "ના, એટલું જ", "Naa, etlu j", "No, just this"),
      s("ચાલીસમાં લો", "Chaalismaan lo", "Take it for forty", "આભાર, લો", "Aabhaar, lo", "Thank you, here you go"),
      s("જાઓ", "Jaao", "Go", "આભાર", "Aabhaar", "Thank you"),
    ],
  },
  "manek-chowk-bus": {
    easy: [
      s("ક્યાં?", "Kyaan?", "Where to?", "લો ગાર્ડન", "Law Garden", "Law Garden"),
      s("વીસ રૂપિયા", "Vees rupiya", "Twenty rupees", "લો", "Lo", "Here you go"),
      s("લો, ટિકિટ", "Lo, ticket", "Here, your ticket", "આભાર", "Aabhaar", "Thank you"),
    ],
    medium: [
      s("ક્યાં?", "Kyaan?", "Where to?", "લો ગાર્ડન", "Law Garden", "Law Garden"),
      s("પાછળ ચઢો, ભીડ છે", "Paachhal chadho, bheed che", "Board from the back, it's crowded", "ઠીક, પાછળ ચઢું", "Theek, paachhal chadhu", "Okay, I'll board from the back"),
      s("હા, કહો", "Haa, kaho", "Yes, tell me", "કેટલા?", "Ketlaa?", "How much?"),
      s("વીસ રૂપિયા", "Vees rupiya", "Twenty rupees", "લો", "Lo", "Here you go"),
      s("લો, ટિકિટ", "Lo, ticket", "Here, your ticket", "આભાર", "Aabhaar", "Thank you"),
    ],
    hard: [
      s("ક્યાં?", "Kyaan?", "Where to?", "લો ગાર્ડન", "Law Garden", "Law Garden"),
      s("પાછળ ચઢો, ભીડ છે", "Paachhal chadho, bheed che", "Board from the back, it's crowded", "ઠીક, પાછળ ચઢું", "Theek, paachhal chadhu", "Okay, I'll board from the back"),
      s("હા, કહો", "Haa, kaho", "Yes, tell me", "એક ટિકિટ", "Ek ticket", "One ticket, please"),
      s("કહો", "Kaho", "Tell me", "કેટલા?", "Ketlaa?", "How much?"),
      s("વીસ રૂપિયા", "Vees rupiya", "Twenty rupees", "લો", "Lo", "Here you go"),
      s("છૂટા છે?", "Chhutaa che?", "Got change?", "હા, લો", "Haa, lo", "Yes, here you go"),
      s("લો, ટિકિટ", "Lo, ticket", "Here, your ticket", "આભાર", "Aabhaar", "Thank you"),
    ],
  },
};
