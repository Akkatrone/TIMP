// Full-text search in a trip (design/README.md, S1–S5): every stop, of every plan, and
// every day's notes, on the phone, offline. Letters are compared without accents or
// case; every word typed must be found. No DOM.

/** A text as it is compared: no accents, no case. */
export const fold = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const wordsOf = q => fold(q).split(/[\s,.;:·()"“”«»]+/).filter(Boolean);
const plain = s => String(s ?? "").replace(/\*\*/g, "");

// A stop's fields, the most telling first, and what a word found in each is worth.
const FIELDS = [["title", 8], ["local", 6], ["choice", 4], ["tag", 3], ["address", 2], ["text", 1]];

/**
 * The part of `text` where the first word found is, with the words around it.
 * Folding can change the length of a text (ß, accents): positions are mapped back.
 * @returns {{before: string, match: string, after: string} | null}
 */
export function snippet(text, words, {around = 28, after = 70} = {}){
  const src = plain(text);
  let folded = "";
  const at = [];   // folded index → index in src
  for(let i = 0; i < src.length; i++){
    const f = fold(src[i]);
    for(let k = 0; k < f.length; k++){ folded += f[k]; at.push(i); }
  }
  at.push(src.length);
  let best = -1, len = 0;
  for(const w of words){
    const p = folded.indexOf(w);
    if(p >= 0 && (best < 0 || p < best)){ best = p; len = w.length; }
  }
  if(best < 0) return null;
  const s = at[best], e = at[best + len];
  const from = Math.max(0, s - around), to = Math.min(src.length, e + after);
  // Cut at a word, with "…" where the text goes on.
  const before = from > 0 ? "…" + src.slice(from, s).replace(/^\S*\s/, "") : src.slice(0, s);
  return {before, match: src.slice(s, e), after: src.slice(e, to) + (to < src.length ? "…" : "")};
}

/**
 * What matches `query` in `trip`, the best first: a word in a stop's name before one in
 * its description; then by day and by place in the day.
 * @returns {Array<{kind: "stop"|"note", dayIndex: number, date: string, planId: string|null,
 *   index: number, stopId: string|null, title: string, time: string, type?: string,
 *   choice?: string|null, field: string, name: object|null, where: object|null}>}
 *   name: the name with the word found marked (snippet); where: the other field's words.
 */
export function searchTrip(trip, query, {limit = 50} = {}){
  const words = wordsOf(query);
  if(!words.length || !trip || !Array.isArray(trip.days)) return [];
  const out = [];
  trip.days.forEach((d, dayIndex) => {
    const daily = fold([d.city, d.title].filter(Boolean).join(" "));
    const lists = Array.isArray(d.plans) ? d.plans.map(p => [p.id, p.name, p.stops || []]) : [[null, "", d.stops || []]];
    for(const [planId, planName, stops] of lists){
      stops.forEach((s, index) => {
        const values = FIELDS.map(([f, w]) => [f, w, typeof s[f] === "string" ? plain(s[f]) : ""]);
        const hay = values.map(v => fold(v[2])).join(" ") + " " + daily + " " + fold(planName);
        if(!words.every(w => hay.includes(w))) return;
        let score = 0, field = null;
        for(const [f, w, v] of values){
          const fv = fold(v);
          if(words.some(x => fv.includes(x))){ score += w; if(!field) field = f; }
        }
        if(fold(s.title).startsWith(words[0])) score += 4;
        out.push({kind: "stop", dayIndex, date: d.date, planId, index, stopId: s.id || null, title: String(s.title || ""), time: String(s.time || ""),
          type: s.type, choice: s.choice || null, field: field || "day", score,
          name: snippet(s.title, words, {around: 200, after: 200}),
          where: field && field !== "title" ? snippet(s[field], words) : null});
      });
    }
    // A note, by its own words only: the day's city would bring every note of the day.
    (Array.isArray(d.notes) ? d.notes : []).forEach((n, index) => {
      if(!words.every(w => fold(plain(n)).includes(w))) return;
      out.push({kind: "note", dayIndex, date: d.date, planId: null, index, stopId: null, title: "", time: "", field: "note", score: 1,
        name: null, where: snippet(n, words)});
    });
  });
  return out.sort((a, b) => b.score - a.score || a.dayIndex - b.dayIndex || a.index - b.index).slice(0, limit);
}
