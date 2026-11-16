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
// Days are matched by date, plans and stops by id, places and stays by key.
// No DOM here.

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);

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

  // An object, field by field; `deep` names the fields that have their own merge.
  function fields(base, a, b, deep = {}){
    const hasBase = base !== undefined;
    const out = {};
    for(const k of new Set([...Object.keys(a), ...Object.keys(b)])){
      const z = hasBase ? base[k] : undefined;
      const v = deep[k] && a[k] !== undefined && b[k] !== undefined ? deep[k](z, a[k], b[k]) : value(hasBase, z, a[k], b[k]);
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
  // only the other side has go after the item that precedes them there.
  function list(keyOf, mergeItem){
    return (base, a, b) => {
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
      const out = [];
      for(const k of order){
        const z = Z ? Z.get(k) : undefined;
        if(A.has(k) && B.has(k)){
          const m = mergeItem(Z && Z.has(k) ? z : undefined, A.get(k), B.get(k));
          out.push(m);
        }else{
          const kept = lonely(!!Z && Z.has(k), z, A.has(k) ? A.get(k) : B.get(k));
          if(kept !== undefined) out.push(kept);
        }
      }
      return out;
    };
  }

  // Entries of an object (places, stays), each one an object merged field by field.
  function entries(base, a, b){
    const out = {};
    for(const k of new Set([...Object.keys(a), ...Object.keys(b)])){
      const baseHas = base !== undefined && k in base;
      const z = baseHas ? base[k] : undefined;
      const v = (k in a && k in b) ? fields(z, a[k], b[k]) : lonely(baseHas, z, k in a ? a[k] : b[k], null);
      if(v !== undefined) out[k] = v;
    }
    return out;
  }

  return {fields, list, entries};
}

/**
 * @param {object|null} base   the common version, or null if unknown
 * @param {object} ours        the trip on this device
 * @param {object} theirs      the trip received
 * @returns {object} the merged trip, without a version. What changed from `ours` is
 *   diffTrips(ours, result) (js/diff.js).
 */
export function mergeTrips(base, ours, theirs){
  const m = makeMerger(String(ours.version.id) > String(theirs.version.id));
  const strip = t => { const {version, ...rest} = t; return rest; };

  const stops = m.list(s => s.id, (z, a, b) => m.fields(z, a, b));
  const plans = m.list(p => p.id, (z, a, b) => m.fields(z, a, b, {stops}));
  const days = m.list(d => d.date, (z, a, b) => m.fields(z, a, b, {stops, plans}));

  const trip = m.fields(base ? strip(base) : undefined, strip(ours), strip(theirs), {days, places: m.entries, stays: m.entries});
  trip.days.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
  return trip;
}
