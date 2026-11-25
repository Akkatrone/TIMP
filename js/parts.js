// Parts of the day (design/README.md, T1–T5): a stop's time is a clock time ("09:30") or
// one of seven parts of the day, written in the file as a fixed English word. Words of
// before ("Evening", "Pranzo", "Pomeriggio") are recognised and shown as their part; the
// file is not rewritten. No DOM.

import { t } from "./i18n.js";

/** The parts, in the order of a day. */
export const PARTS = ["sunrise", "morning", "midday", "afternoon", "sunset", "evening", "night"];

// Words written before the parts existed, in the languages of the app and of its trips,
// and the part each one means. Matched on the whole word, without accents or case.
const WORDS = {
  sunrise: ["sunrise", "dawn", "alba", "amanecer", "aube", "lever du soleil", "sonnenaufgang", "nascer do sol", "madrugada", "日の出", "早朝"],
  morning: ["morning", "breakfast", "mattina", "mattino", "colazione", "manana", "desayuno", "matin", "petit dejeuner", "morgen", "vormittag", "fruhstuck", "manha", "pequeno almoco", "朝", "午前", "朝食"],
  midday: ["midday", "noon", "lunch", "lunchtime", "mezzogiorno", "pranzo", "mediodia", "almuerzo", "comida", "midi", "dejeuner", "mittag", "mittagessen", "meio dia", "almoco", "昼", "正午", "昼食", "ランチ"],
  afternoon: ["afternoon", "pomeriggio", "tarde", "apres midi", "nachmittag", "午後"],
  sunset: ["sunset", "dusk", "golden hour", "tramonto", "aperitivo", "atardecer", "puesta de sol", "coucher du soleil", "sonnenuntergang", "por do sol", "夕方", "夕暮れ", "日没", "夕日"],
  evening: ["evening", "dinner", "supper", "sera", "cena", "noche temprana", "soir", "soiree", "diner", "abend", "abendessen", "noite cedo", "jantar", "夜", "夕食", "ディナー"],
  night: ["night", "late night", "notte", "nottata", "dopocena", "noche", "nuit", "nacht", "noite", "深夜", "夜中"]
};
const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-_'’.]/g, " ").replace(/\s+/g, " ").trim();
const BY_WORD = new Map(Object.entries(WORDS).flatMap(([part, ws]) => ws.map(w => [fold(w), part])));

/** "09:30" → minutes after midnight; anything else → null. */
export function clockOfTime(time){
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(time ?? ""));
  if(!m) return null;
  const h = +m[1], min = +m[2];
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** The part of the day a time names: the fixed word, or a word of before; null for a clock time or an unknown word. */
export function partOf(time){
  if(time === undefined || time === null || clockOfTime(time) !== null) return null;
  const f = fold(time);
  if(PARTS.includes(f)) return f;
  return BY_WORD.get(f) || null;
}

/**
 * A stop's time inside a sentence: "at 12:30", or a part of the day as the language says
 * it ("in the afternoon", "nel pomeriggio"), never "at afternoon".
 */
export function atTime(time){
  const p = partOf(time);
  return p ? t("at_" + p) : t("atClock", {t: time});
}

/**
 * When a part of the day is, in minutes after midnight: [from, to]. Sunrise and sunset
 * at their real time when `light` ({sunrise, sunset}, js/sun.js) is known.
 */
export function windowOf(part, light){
  const rise = light ? light.sunrise : 390, set = light ? light.sunset : 1170;
  switch(part){
    case "sunrise": return [rise - 30, rise + 30];
    case "morning": return [Math.max(rise + 30, 480), 720];
    case "midday": return [720, 870];
    case "afternoon": return [870, Math.max(870, set - 60)];
    case "sunset": return [set - 45, set + 45];
    case "evening": return [set + 45, Math.max(set + 46, 1380)];
    case "night": return [Math.max(set + 46, 1380), 1620];
  }
  return null;
}

/** Where a time falls in a day, for order and for now: a clock time, or the start of its part. */
export function minutesOf(time, light){
  const c = clockOfTime(time);
  if(c !== null) return c;
  const p = partOf(time);
  return p ? windowOf(p, light)[0] : null;
}
