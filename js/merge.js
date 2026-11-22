// Joins two versions of the same trip that changed separately.
//
// It is a three-way merge: each change is judged against the base, the last version
// both sides had. Rules:
//   - what only one side changed is taken from that side;
//   - a stop added on either side is kept;
//   - a stop removed on one side and left alone on the other is removed;
//   - a stop removed on one side and changed on the other is kept;
//   - when both changed the same field differently, one side wins: always the one
//     whose version id sorts higher, so every device gets the same result.
// Without a base (the two never shared a version this device still has), nothing
// counts as removed and every difference is settled by the same winner.
//
// Days are matched by date, plans, stops and expenses by id; anything else field by field.
// Stop ids of before (made from titles, unique in their list only) are first converted
// the one way every device converts them (js/ids.js), and copies told apart, on the
// three versions: a phone that converted and one that did not still join stop by stop.
// Also:
//   - a list one side left as it was is the other side's, order included;
//   - a stop moved to another day or plan on one side, and changed on the other, is
//     moved and changed, once (#1);
//   - a day plain on one side and with plans on the other (a plan added, or all but one
//     removed) is joined as plans; a day left with one plan has plain stops again;
//   - stops both sides kept in time order stay in time order;
//   - a list of stops, plans or days that each side left with something is never left
//     empty (each removed what the other kept): what either side kept stays. No
//     expenses left is no list;
//   - a stop id each side has in one place only is one stop: in one place in the join,
//     even when the common version lacks it (brought back on both sides, then moved);
//   - a plan left without stops goes; a plain day keeps its last stop.
// test/merge-properties.test.mjs holds these rules on many random pairs of edits.
// No DOM here.

import { clockMinutes, insertIndex } from "./edit.js";
import { uniqueStopIds } from "./ids.js";

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
// Lists that may be absent: absent is empty, and left empty they go.
const OPTIONAL = new Set(["expenses", "notes", "info", "closed"]);

function equal(a, b){
  if(a === b) return true;
  if(Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if(isObj(a) && isObj(b)){
    const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
    return ka.length === kb.length && ka.every(k => equal(a[k], b[k]));
  }
  return false;
}

/**
 * The rules above, for any pair of values. `base` is undefined when there is none at
 * this level (`hasBase` false) or when the value was absent in it (`hasBase` true).
 * Objects are merged field by field through `fields`; lists of items with ids through
 * the function `fields[name]` given by the caller.
 */
function makeMerger(aWins){
  function value(hasBase, base, a, b){
    if(equal(a, b)) return a;
    if(hasBase){
      if(equal(a, base)) return b;
      if(equal(b, base)) return a;
    }else{
      if(a === undefined) return b;
      if(b === undefined) return a;
    }
    return aWins ? a : b;
  }

  // An object, field by field; `deep` names the fields that have their own merge. A
  // list in OPTIONAL is empty when absent, and absent when left empty (a trip without
  // expenses, a day without notes): one side removing the last one and the other adding
  // one is a list joined, not a list against nothing.
  function fields(base, a, b, deep = {}){
    const hasBase = base !== undefined;
    const out = {};
    for(const k of new Set([...Object.keys(a), ...Object.keys(b)])){
      const z = hasBase ? base[k] : undefined;
      let v;
      if(deep[k] && OPTIONAL.has(k)){
        v = deep[k](hasBase ? (z ?? []) : undefined, a[k] ?? [], b[k] ?? []);
        if(Array.isArray(v) && !v.length) v = undefined;
      }else v = deep[k] && a[k] !== undefined && b[k] !== undefined ? deep[k](z, a[k], b[k]) : value(hasBase, z, a[k], b[k]);
      if(v !== undefined) out[k] = v;
    }
    return out;
  }

  // One entry present on one side only: removed on the other, or added on this one?
  // Returns the entry to keep, or undefined to drop it.
  function lonely(baseHas, baseEntry, entry){
    if(baseHas && equal(entry, baseEntry)) return undefined;
    return entry;
  }

  // Items with ids, in a list (days, plans, stops). The order is the winner's; items
  // only the other side has go after the item that precedes them there. `nonEmpty`: a
  // list both sides left with something is never empty (a day needs its stops).
  function list(keyOf, mergeItem, {nonEmpty = false} = {}){
    return (base, a, b) => {
      // One side left it as it was: the other side's, its order too.
      if(base !== undefined && equal(a, base)) return b;
      if(base !== undefined && equal(b, base)) return a;
      const map = l => new Map((l || []).map(x => [keyOf(x), x]));
      const Z = base === undefined ? null : map(base), A = map(a), B = map(b);
      const [first, second] = aWins ? [a, b] : [b, a];
      const order = first.map(keyOf);
      second.forEach((x, i) => {
        if(order.includes(keyOf(x))) return;
        let at = 0;
        for(let j = i - 1; j >= 0; j--){
          const p = order.indexOf(keyOf(second[j]));
          if(p >= 0){ at = p + 1; break; }
        }
        order.splice(at, 0, keyOf(x));
      });
      const join = removals => {
        const out = [];
        for(const k of order){
          const z = Z ? Z.get(k) : undefined;
          if(A.has(k) && B.has(k)) out.push(mergeItem(Z && Z.has(k) ? z : undefined, A.get(k), B.get(k)));
          else{
            const entry = A.has(k) ? A.get(k) : B.get(k);
            const kept = removals ? lonely(!!Z && Z.has(k), z, entry) : entry;
            if(kept !== undefined) out.push(kept);
          }
        }
        return out;
      };
      const out = join(true);
      // Each side removed what the other kept: what either kept stays.
      return nonEmpty && !out.length && a.length && b.length ? join(false) : out;
    };
  }

  return {fields, list};
}

// Where each stop id is on one side: id → place → stop. A place is a day and a plan; an
// id is unique within its list only, so the same id can be in several places.
const placeOf = (date, plan) => JSON.stringify([date, plan || null]);
function placesOf(trip){
  const out = new Map();
  for(const d of trip.days) for(const list of d.plans || [d]){
    const place = placeOf(d.date, d.plans ? list.id : null);
    for(const s of list.stops || []){
      if(!s.id) continue;
      if(!out.has(s.id)) out.set(s.id, new Map());
      out.get(s.id).set(place, s);
    }
  }
  return out;
}

// The stops one side moved since the common version: an id gone from one place and
// come to one other. Keyed by id and the place it left, so two stops with the same id
// in two plans are two stops.
function movesOf(base, side){
  const out = new Map();
  for(const [id, at] of side){
    const was = base.get(id);
    if(!was) continue;
    const gone = [...was.keys()].filter(p => !at.has(p)), come = [...at.keys()].filter(p => !was.has(p));
    if(gone.length === 1 && come.length === 1) out.set(id + "\n" + gone[0], {id, from: gone[0], to: come[0], stop: at.get(come[0])});
  }
  return out;
}

// A stop moved on one side and changed (or moved elsewhere) on the other: one stop,
// where the move took it (the winner's place when both moved it), with both changes.
// The lists alone would keep it where it was, changed, and where it went (#1).
function mergeMovedStops(days, base, ours, theirs, merger, aWins){
  const Z = placesOf(base), A = placesOf(ours), B = placesOf(theirs);
  const ma = movesOf(Z, A), mb = movesOf(Z, B);
  const moves = [];
  for(const key of [...new Set([...ma.keys(), ...mb.keys()])].sort()){
    const x = ma.get(key), y = mb.get(key), m = x || y;
    const original = Z.get(m.id).get(m.from);
    let to, left, right;
    if(x && y){ to = x.to === y.to ? x.to : (aWins ? x.to : y.to); left = x.stop; right = y.stop; }
    else{
      // Removed on the other side: moving it was a change, the lists keep it there.
      const still = (x ? B : A).get(m.id)?.get(m.from);
      if(!still) continue;
      to = m.to;
      [left, right] = x ? [x.stop, still] : [still, y.stop];
    }
    const elsewhere = [m.from, x && x.to, y && y.to].filter(p => p && p !== to);
    moves.push({id: m.id, to, elsewhere, stop: merger.fields(original, left, right)});
  }
  if(!moves.length) return days;
  const lists = new Set(days.flatMap(d => d.plans ? d.plans.map(p => placeOf(d.date, p.id)) : [placeOf(d.date, null)]));
  const drop = new Set(), put = new Map();
  for(const mv of moves){
    if(!lists.has(mv.to)) continue;          // its day or plan is gone: left where the lists put it
    for(const p of mv.elsewhere) drop.add(p + "\n" + mv.id);
    put.set(mv.to + "\n" + mv.id, mv.stop);
  }
  const update = (stops, place, plain) => {
    const out = stops.filter(s => !drop.has(place + "\n" + s.id)).map(s => put.get(place + "\n" + s.id) || s);
    for(const [k, stop] of put){
      const [p, id] = k.split("\n");
      if(p === place && !out.some(s => s.id === id)) out.splice(insertIndex(out, stop.time), 0, stop);
    }
    return plain && !out.length ? stops : out;      // a plain day keeps its last stop
  };
  return days.map(d => d.plans
    ? {...d, plans: d.plans.map(p => ({...p, stops: update(p.stops, placeOf(d.date, p.id), false)}))}
    : {...d, stops: update(d.stops, placeOf(d.date, null), true)});
}

// A stop id that each side has in one place only (and the common version in one place,
// or none) is one stop. Joined, it is in one place: where a side moved it from the
// common version (the winner's when both did), or, without a common place, the
// winner's; with both sides' changes. The lists alone can keep it twice: brought back
// on both sides (History → Restore) and moved on one.
function oneStopOnePlace(days, base, ours, theirs, merger, aWins){
  const Z = base ? placesOf(base) : new Map(), A = placesOf(ours), B = placesOf(theirs), M = placesOf({days});
  const fix = new Map();
  for(const [id, at] of M){
    if(at.size < 2) continue;
    const a = A.get(id), b = B.get(id), z = Z.get(id);
    if(!a || !b || a.size !== 1 || b.size !== 1 || (z && z.size !== 1)) continue;
    const [pa] = a.keys(), [pb] = b.keys(), pz = z ? [...z.keys()][0] : null;
    const keep = pa === pz ? pb : pb === pz ? pa : (aWins ? pa : pb);
    const place = at.has(keep) ? keep : [...at.keys()].sort()[0];
    fix.set(id, {place, stop: merger.fields(z ? z.get(pz) : undefined, a.get(pa), b.get(pb))});
  }
  if(!fix.size) return days;
  const update = (stops, place, plain) => {
    const out = stops.flatMap(s => { const f = fix.get(s.id); return !f ? [s] : f.place === place ? [f.stop] : []; });
    return plain && !out.length ? stops : out;      // a plain day keeps its last stop
  };
  return days.map(d => d.plans
    ? {...d, plans: d.plans.map(p => ({...p, stops: update(p.stops, placeOf(d.date, p.id), false)}))}
    : {...d, stops: update(d.stops, placeOf(d.date, null), true)});
}

// A plan left without stops goes (its stops moved elsewhere), when another has some.
const withoutEmptyPlans = days => days.map(d => d.plans && d.plans.some(p => p.stops.length) ? {...d, plans: d.plans.filter(p => p.stops.length)} : d);

// A day has plain stops or plans. When its versions disagree on that, all of them are
// seen as plans: plain stops are the plan that holds most of them on the other sides
// (adding a plan makes a day's stops its first plan; removing all but one leaves the
// stops of the one that stays). When both sides turned the same plain day into plans,
// their two first plans are one plan. Copies: the trips given are not changed.
function alignShapes(trips){
  // Most joins have none: then the trips as they are, no copy.
  const shape = d => d.plans ? "p" : "s";
  const seen = new Map();
  let differ = false;
  for(const t of trips) if(t) for(const d of t.days){
    if(seen.has(d.date) && seen.get(d.date) !== shape(d)) differ = true;
    seen.set(d.date, shape(d));
  }
  if(!differ) return trips;
  const out = trips.map(t => t && JSON.parse(JSON.stringify(t)));
  const ids = stops => new Set((stops || []).map(s => s.id));
  const overlap = (set, stops) => (stops || []).reduce((n, s) => n + (set.has(s.id) ? 1 : 0), 0);
  const dates = new Set(out.flatMap(t => t ? t.days.map(d => d.date) : []));
  for(const date of dates){
    const days = out.map(t => t ? t.days.find(d => d.date === date) : undefined);
    const present = days.filter(Boolean);
    if(present.every(d => d.plans) || present.every(d => !d.plans)) continue;
    const planned = days.filter(d => d && d.plans);
    const best = set => {
      let pick = null, score = -1;
      for(const p of planned.flatMap(d => d.plans)){
        const n = overlap(set, p.stops);
        if(n > score || (n === score && (p.id < pick.id || (p.id === pick.id && String(p.name) < String(pick.name))))){ pick = p; score = n; }
      }
      return {plan: pick, score};
    };
    const base = days[0];
    if(base && !base.plans){
      // The plan both sides made out of the common stops gets one id.
      const common = ids(base.stops), key = best(common).plan.id;
      for(const d of planned){
        if(d.plans.some(p => p.id === key)) continue;
        let pick = null, score = 0;
        for(const p of d.plans){ const n = overlap(common, p.stops); if(n > score){ pick = p; score = n; } }
        if(pick) pick.id = key;
      }
    }
    for(const d of days){
      if(!d || d.plans) continue;
      const {plan} = best(ids(d.stops));
      const {stops, ...rest} = d;
      Object.keys(d).forEach(k => delete d[k]);
      Object.assign(d, rest, {plans: [{id: plan.id, name: plan.name, stops}]});
    }
  }
  return out;
}

// Every list of stops, by day and plan.
function listsOf(trip){
  const out = new Map();
  for(const d of trip.days){
    if(d.plans) for(const p of d.plans) out.set(JSON.stringify([d.date, p.id]), p.stops);
    else out.set(JSON.stringify([d.date, null]), d.stops);
  }
  return out;
}

// Whether the stops with clock times are in time order ("Dinner" and the like aside).
function inTimeOrder(stops){
  let last = -1;
  for(const s of stops || []){
    const c = clockMinutes(s.time);
    if(c === null) continue;
    if(c < last) return false;
    last = c;
  }
  return true;
}

// Lists both sides kept in time order stay so: a stop whose time changed goes where the
// app would put it. A list someone ordered otherwise (after midnight) keeps its order.
function keepTimeOrder(days, ours, theirs){
  const A = listsOf(ours), B = listsOf(theirs);
  const arrange = (stops, date, plan) => {
    const k = JSON.stringify([date, plan]), a = A.get(k), b = B.get(k);
    if(inTimeOrder(stops) || (a && !inTimeOrder(a)) || (b && !inTimeOrder(b))) return stops;
    const out = [];
    for(const s of stops) out.splice(insertIndex(out, s.time), 0, s);
    return out;
  };
  return days.map(d => d.plans
    ? {...d, plans: d.plans.map(p => ({...p, stops: arrange(p.stops, d.date, p.id)}))}
    : {...d, stops: arrange(d.stops, d.date, null)});
}

// A day left with one plan has plain stops again, as when a plan is removed in the app.
function plainWhenOne(days){
  return days.map(d => {
    if(!d.plans || d.plans.length > 1) return d;
    const {plans, ...rest} = d;
    return {...rest, stops: plans.length ? plans[0].stops : []};
  });
}

/**
 * @param {object|null} base   the common version, or null if unknown
 * @param {object} ours        the trip on this device
 * @param {object} theirs      the trip received
 * @returns {object} the merged trip, without a version. What changed from `ours` is
 *   diffTrips(ours, result) (js/diff.js).
 */
export function mergeTrips(base0, ours0, theirs0){
  const aWins = String(ours0.version.id) > String(theirs0.version.id);
  const base1 = base0 && uniqueStopIds(base0).trip;
  const [base, ours, theirs] = alignShapes([base1, uniqueStopIds(ours0, base1).trip, uniqueStopIds(theirs0, base1).trip]);
  const m = makeMerger(aWins);
  const strip = t => { const {version, ...rest} = t; return rest; };

  // Texts in a list (a day's notes, a place's closing days): each one an item.
  const texts = m.list(t => t, (z, a) => a);
  const stops = m.list(s => s.id, (z, a, b) => m.fields(z, a, b, {closed: texts}), {nonEmpty: true});
  const plans = m.list(p => p.id, (z, a, b) => m.fields(z, a, b, {stops}), {nonEmpty: true});
  const days = m.list(d => d.date, (z, a, b) => m.fields(z, a, b, {stops, plans, notes: texts}), {nonEmpty: true});
  const expenses = m.list(x => x.id, (z, a, b) => m.fields(z, a, b));
  // The Info page: sections by title, their lines by label.
  const items = m.list(i => i.label, (z, a, b) => m.fields(z, a, b), {nonEmpty: true});
  const info = m.list(x => x.title, (z, a, b) => m.fields(z, a, b, {items}));

  const trip = m.fields(base ? strip(base) : undefined, strip(ours), strip(theirs), {days, expenses, info});
  if(base) trip.days = mergeMovedStops(trip.days, base, ours, theirs, m, aWins);
  trip.days = oneStopOnePlace(trip.days, base, ours, theirs, m, aWins);
  trip.days = plainWhenOne(withoutEmptyPlans(keepTimeOrder(trip.days, ours, theirs)));
  trip.days.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
  return trip;
}
