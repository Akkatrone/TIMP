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

  return {fields, list};
}

// A stop id is unique within its list. Only infer a move across lists when
// that id names exactly one stop throughout each of the three versions.
function positions(trip){
  const byId = new Map();
  for(const day of trip.days){
    for(const plan of day.plans || [day]){
      const place = JSON.stringify([day.date, day.plans ? plan.id : null]);
      for(const stop of plan.stops || []){
        if(stop.id) byId.set(stop.id, byId.has(stop.id) ? null : {place, stop});
      }
    }
  }
  return byId;
}

function mergeMovedStops(days, base, ours, theirs, merger, aWins){
  const a = positions(ours), b = positions(theirs), moves = new Map();
  for(const [id, original] of positions(base)){
    const left = a.get(id), right = b.get(id);
    if(!original || !left || !right) continue;
    if(left.place === original.place && right.place === original.place) continue;
    let dest = aWins ? left : right;
    if(left.place === original.place) dest = right;
    if(right.place === original.place) dest = left;
    moves.set(id, {place: dest.place, stop: merger.fields(original.stop, left.stop, right.stop)});
  }
  if(!moves.size) return days;
  const update = (stops, date, plan) => {
    const place = JSON.stringify([date, plan]);
    return stops.flatMap(stop => {
      const move = moves.get(stop.id);
      if(!move) return [stop];
      return move.place === place ? [move.stop] : [];
    });
  };
  return days.map(day => day.plans
    ? {...day, plans: day.plans.map(p => ({...p, stops: update(p.stops, day.date, p.id)}))}
    : {...day, stops: update(day.stops, day.date, null)});
}

/**
 * @param {object|null} base   the common version, or null if unknown
 * @param {object} ours        the trip on this device
 * @param {object} theirs      the trip received
 * @returns {object} the merged trip, without a version. What changed from `ours` is
 *   diffTrips(ours, result) (js/diff.js).
 */
export function mergeTrips(base, ours, theirs){
  const aWins = String(ours.version.id) > String(theirs.version.id);
  const m = makeMerger(aWins);
  const strip = t => { const {version, ...rest} = t; return rest; };

  const stops = m.list(s => s.id, (z, a, b) => m.fields(z, a, b));
  const plans = m.list(p => p.id, (z, a, b) => m.fields(z, a, b, {stops}));
  const days = m.list(d => d.date, (z, a, b) => m.fields(z, a, b, {stops, plans}));
  const expenses = m.list(x => x.id, (z, a, b) => m.fields(z, a, b));

  const trip = m.fields(base ? strip(base) : undefined, strip(ours), strip(theirs), {days, expenses});
  if(base) trip.days = mergeMovedStops(trip.days, base, ours, theirs, m, aWins);
  trip.days = [...trip.days];
  trip.days.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
  return trip;
}
