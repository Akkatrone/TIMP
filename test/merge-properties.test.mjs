// What every join of two versions must hold, whatever was done on each side: checked on
// many random pairs of edits made from the same version, as two phones (or a phone and a
// chat) would. Hand-picked cases missed a stop moved on one side and changed on the other
// (#1): properties over random edits catch the cases nobody thought of.
//
// The rules a join keeps (js/merge.js):
//   valid       the result is a trip the app accepts;
//   symmetric   the same result whichever side joins (two phones end on the same version);
//   neutral     a side that changed nothing gives the other side, exactly;
//   no copies   a stop is never in more places than on either side;
//   no loss     what one side added, changed or moved, and the other did not touch, is
//               in the result as that side left it;
//   removal     what one side removed, and the other did not touch, is gone;
//   converges   joining the result with either side again changes nothing more;
//   restores    phones that edit, bring back old versions (History → Restore) and sync
//               in any order end on the same version, valid, with no stop multiplied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ensureVersion, commit, commitMerge, canonical, contentOf, relation, commonBase } from "../js/version.js";
import { mergeTrips } from "../js/merge.js";
import { ensureIds, addStop, updateStop, removeStop, addDay, updateDay, removeDay, dayAfter, addPlan, renamePlan, removePlan, addExpense, updateExpense, removeExpense } from "../js/edit.js";
import { validateTrip } from "../js/trip.js";

const demo = () => ensureIds(JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"))).trip;
const same = (a, b) => canonical(contentOf(a)) === canonical(contentOf(b));

// Every stop with where it is. Ids are unique within a list, not in the whole trip.
const placed = trip => trip.days.flatMap(d => d.plans
  ? d.plans.flatMap(p => p.stops.map(s => ({date: d.date, plan: p.id, stop: s})))
  : d.stops.map(s => ({date: d.date, plan: null, stop: s})));
const at = (trip, id) => placed(trip).filter(x => x.stop.id === id);
const where = x => `${x.date}/${x.plan || "-"}`;
// The plan of a day that holds most of these stops: the plan plain stops became (adding
// a plan), or the one whose stops became plain (removing the others).
function planOf(day, stops){
  const ids = new Set(stops.map(s => s.id));
  let pick = null, score = -1;
  for(const p of day.plans || []){ const n = p.stops.filter(s => ids.has(s.id)).length; if(n > score){ pick = p; score = n; } }
  return pick && pick.id;
}
// The same place: the same day, and the same plan; a day that went from plain stops to
// plans (or back) did not move the stops of the plan they became (or came from).
function samePlace(x, y, tx, ty){
  if(x.date !== y.date) return false;
  if(!x.plan && !y.plan) return true;
  if(x.plan && y.plan){
    if(x.plan === y.plan) return true;
    // Two first plans made of the same stops on the two sides are one plan in the join.
    const dx = tx.days.find(d => d.date === x.date), dy = ty.days.find(d => d.date === y.date);
    return planOf(dx, dy.plans.find(p => p.id === y.plan).stops) === x.plan;
  }
  const [plain, planned, tPlain, tPlanned] = x.plan ? [y, x, ty, tx] : [x, y, tx, ty];
  const day = tPlanned.days.find(d => d.date === planned.date), from = tPlain.days.find(d => d.date === plain.date);
  return planOf(day, from.stops) === planned.plan;
}
// A stop the trip has once only: the cases where "the same stop" is clear.
const single = (trip, id) => { const xs = at(trip, id); return xs.length === 1 ? xs[0] : null; };

// How many random cases, and from which seed: 400 in every run of the tests (a second
// or two); more, and from elsewhere, to look further (.github/workflows/merge-fuzz.yml):
//   MERGE_SEEDS=20000 MERGE_FIRST=100000 node --test test/merge-properties.test.mjs
// A failure names its seed: MERGE_SEEDS=1 MERGE_FIRST=<seed> runs it again, alone.
const SEEDS = Number(process.env.MERGE_SEEDS || 400), FIRST = Number(process.env.MERGE_FIRST || 1);

// A small fixed generator: the same edits on every run.
const random = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

// One random edit, as the app makes them (js/edit.js); one the app would refuse (a day
// left without stops) is not made. Returns the new trip.
function edit(trip, r, history){
  const next = anyEdit(trip, r, history);
  return validateTrip(next).ok ? next : trip;
}
function anyEdit(trip, r, history){
  const pick = list => list[Math.floor(r() * list.length)];
  const lists = trip.days.flatMap(d => d.plans ? d.plans.map(p => ({date: d.date, plan: p.id})) : [{date: d.date, plan: null}]);
  const stops = placed(trip);
  const n = Math.floor(r() * 1e6);
  const k = r();
  try{
    if(k < .14 || !stops.length){ const l = pick(lists); return addStop(trip, {date: l.date, plan: l.plan}, {time: `${10 + Math.floor(r() * 12)}:${String(Math.floor(r() * 6) * 10).padStart(2, "0")}`, title: "Stop " + n}).trip; }
    const x = pick(stops), ref = {date: x.date, plan: x.plan, id: x.stop.id};
    if(k < .34){ const f = pick(["cost", "time", "text", "title"]);
      const v = f === "cost" ? Math.floor(r() * 90) : f === "time" ? `${10 + Math.floor(r() * 12)}:${String(Math.floor(r() * 6) * 10).padStart(2, "0")}` : `${f} ${n}`;
      return updateStop(trip, ref, {...x.stop, [f]: v}).trip; }
    if(k < .52){ const l = pick(lists); return updateStop(trip, ref, r() < .5 ? x.stop : {...x.stop, cost: Math.floor(r() * 90)}, {date: l.date, plan: l.plan}).trip; }
    if(k < .62) return removeStop(trip, ref);
    const d = pick(trip.days);
    if(k < .72) return updateDay(trip, d.date, pick([{notes: [...(d.notes || []), "Note " + n]}, {notes: (d.notes || []).slice(1)}, {title: "Day " + n}, {stay: "Hotel " + n}]));
    if(k < .76) return addDay(trip, {date: dayAfter(trip.days[trip.days.length - 1].date), city: "Lisboa", stops: [{id: "s" + n, time: "10:00", title: "Stop " + n}]});
    if(k < .79 && trip.days.length > 2) return removeDay(trip, d.date);
    if(k < .76){
      const y = pick(stops), yref = {date: y.date, plan: y.plan, id: y.stop.id};
      const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], closed = y.stop.closed || [];
      const next = r() < .5 || !closed.length ? [...new Set([...closed, pick(days)])] : closed.slice(1);
      return updateStop(trip, yref, {...y.stop, closed: next.length ? next : undefined}).trip;
    }
    if(k < .79){
      const info = JSON.parse(JSON.stringify(trip.info || []));
      if(info.length && r() < .5){ const sec = pick(info); if(r() < .5 && sec.items.length > 1) sec.items.splice(Math.floor(r() * sec.items.length), 1); else sec.items.push({label: "Line " + n, text: "Text " + n}); }
      else info.push({title: "Section " + n, items: [{label: "Line " + n, text: "Text " + n}]});
      return {...trip, info};
    }
    if(k < .84){
      if(d.plans && r() < .4) return removePlan(trip, d.date, pick(d.plans).id).trip;
      if(d.plans && r() < .3) return renamePlan(trip, d.date, pick(d.plans).id, "Plan " + n);
      return addPlan(trip, d.date, {name: "Plan " + n, stops: [{id: "p" + n, time: "11:00", title: "Plan stop " + n}]}, "First " + n).trip;
    }
    if(k < .92){
      const xs = trip.expenses || [];
      if(xs.length && r() < .4) return removeExpense(trip, pick(xs).id);
      if(xs.length && r() < .5){ const e = pick(xs); return updateExpense(trip, e.id, {...e, cost: Math.floor(r() * 500)}); }
      return addExpense(trip, {title: "Expense " + n, cost: Math.floor(r() * 500)}).trip;
    }
    // Changing one's mind: back to how the trip was a few edits ago.
    if(history.length) return JSON.parse(JSON.stringify(contentOf(pick(history))));
  }catch(e){ /* an edit the trip does not allow (no plan there, last day): none */ }
  return trip;
}

// A side: a few edits from the common version, each one a version as on a phone.
async function side(root, r){
  let t = root;
  const seen = [root];
  for(let i = 0, n = 1 + Math.floor(r() * 5); i < n; i++){
    const next = edit(t, r, seen);
    if(same(next, t)) continue;
    t = await commit(next, t);
    seen.push(t);
  }
  return t;
}

// What a side did to a stop it shares with the common version, by id: untouched,
// changed where it is, moved (and maybe changed), removed. Null when the id is not
// in one place only on both, so "the same stop" is not clear.
function did(root, t, id){
  const before = single(root, id);
  if(!before) return null;
  const xs = at(t, id);
  if(!xs.length){
    // Its day, or its plan, gone with it: the rules of days and plans decide.
    const day = t.days.find(d => d.date === before.date);
    const root0 = root.days.find(d => d.date === before.date);
    const whole = !day || (before.plan && (day.plans ? !day.plans.some(p => p.id === before.plan) : planOf(root0, day.stops) !== before.plan));
    return {kind: whole ? "container" : "removed"};
  }
  if(xs.length > 1) return null;
  const now = xs[0];
  if(!samePlace(now, before, t, root)) return {kind: "moved", now, before};
  return canonical(now.stop) === canonical(before.stop) ? {kind: "untouched", now} : {kind: "changed", now};
}

// Whether a list of the join kept stops both sides removed between them (js/merge.js:
// never left empty): then a removal can be undone, on purpose.
function emptied(root, a, b, before){
  const list = t => { const d = t.days.find(x => x.date === before.date); return !d ? null : before.plan ? (d.plans || []).find(p => p.id === before.plan)?.stops || null : d.plans ? null : d.stops; };
  const la = list(a), lb = list(b);
  if(!la || !lb) return false;
  const ids = l => new Set(l.map(s => s.id));
  const A = ids(la), B = ids(lb), Z = ids(list(root) || []);
  // Every stop of each side is one the other side removed from the common version.
  return [...A].every(id => Z.has(id) && !B.has(id)) && [...B].every(id => Z.has(id) && !A.has(id));
}

async function check(seed){
  const r = random(seed);
  const root = await ensureVersion(demo());
  const a = await side(root, r), b = await side(root, r);
  const m = mergeTrips(root, a, b);
  const say = what => `seed ${seed}: ${what}`;
  assert.ok(validateTrip(a).ok && validateTrip(b).ok, say("a side is not a valid trip: the generator's fault"));

  assert.ok(validateTrip(m).ok, say("invalid: " + validateTrip(m).errors.slice(0, 3).join("; ")));
  assert.equal(canonical(mergeTrips(root, b, a)), canonical(m), say("not symmetric"));
  assert.ok(same(mergeTrips(root, a, root), a), say("joining with an untouched copy changed something"));
  assert.ok(same(mergeTrips(root, a, a), a), say("joining a version with itself changed something"));

  // No copies.
  for(const id of new Set(placed(m).map(x => x.stop.id)))
    assert.ok(at(m, id).length <= Math.max(at(a, id).length, at(b, id).length), say(`"${id}" in ${at(m, id).length} places, ${at(a, id).length} and ${at(b, id).length} on the two sides`));

  // No loss, and removals kept: for every stop of the common version, what one side did
  // while the other left it alone.
  for(const id of new Set(placed(root).map(x => x.stop.id))){
    const da = did(root, a, id), db = did(root, b, id);
    if(!da || !db) continue;
    for(const [mine, other, who] of [[da, db, "a"], [db, da, "b"]]){
      if(other.kind !== "untouched") continue;
      // Its day or plan gone on the other side: the rules of days and plans decide.
      // Unless each side removed what the other kept, and the list would be left empty.
      if(mine.kind === "removed" && !emptied(root, a, b, single(root, id))) assert.equal(at(m, id).length, 0, say(`"${id}" removed on ${who}, untouched on the other, still there`));
      if(mine.kind === "changed" || mine.kind === "moved"){
        const got = at(m, id);
        assert.equal(got.length, 1, say(`"${id}" ${mine.kind} on ${who}: in ${got.length} places (${got.map(where).join(", ")})`));
        assert.ok(samePlace(got[0], mine.now, m, who === "a" ? a : b), say(`"${id}" ${mine.kind} on ${who} to ${where(mine.now)}, joined at ${where(got[0])}`));
        assert.equal(canonical(got[0].stop), canonical(mine.now.stop), say(`"${id}" ${mine.kind} on ${who}: its fields not kept`));
      }
    }
  }

  // Stops added on one side only (ids the common version and the other side lack).
  for(const [t, other, who] of [[a, b, "a"], [b, a, "b"]])
    for(const x of placed(t)) if(!at(root, x.stop.id).length && !at(other, x.stop.id).length && at(t, x.stop.id).length === 1){
      const got = at(m, x.stop.id);
      assert.equal(got.length, 1, say(`"${x.stop.id}" added on ${who} at ${where(x)}: in ${got.length} places`));
    }

  // Texts in lists (a day's notes, a place's closing days, the lines of the Info page):
  // one added on one side stays; one removed on one side, kept on the other, goes.
  const textLists = t => {
    const out = new Map();
    for(const d of t.days){
      out.set(`notes ${d.date}`, d.notes || []);
      for(const x of placed({days: [d]})) if(single(t, x.stop.id)) out.set(`closed ${x.stop.id}`, x.stop.closed || []);
    }
    for(const sec of t.info || []) out.set(`info ${sec.title}`, sec.items.map(i => i.label));
    return out;
  };
  const LZ = textLists(root), LA = textLists(a), LB = textLists(b), LM = textLists(m);
  for(const key of new Set([...LA.keys(), ...LB.keys()])){
    if(!LM.has(key)) continue;          // the day, the stop or the section went: their own rules
    const z = LZ.get(key) || [], x = LA.get(key), y = LB.get(key), got = LM.get(key);
    for(const [mine, other, who] of [[x, y, "a"], [y, x, "b"]]){
      if(!mine) continue;
      for(const t of mine) if(!z.includes(t) && !(other || []).includes(t)) assert.ok(got.includes(t), say(`${key}: "${t}" added on ${who} lost`));
      if(other) for(const t of z) if(!mine.includes(t) && other.includes(t) && x && y) assert.ok(!got.includes(t), say(`${key}: "${t}" removed on ${who}, kept on the other, still there`));
    }
  }

  // Expenses: none twice, none lost that one side added.
  const exp = t => (t.expenses || []).map(e => e.id);
  for(const id of new Set(exp(m))) assert.equal(exp(m).filter(x => x === id).length, 1, say(`expense "${id}" twice`));
  for(const [t, other, who] of [[a, b, "a"], [b, a, "b"]])
    for(const id of exp(t)) if(!exp(root).includes(id) && !exp(other).includes(id)) assert.ok(exp(m).includes(id), say(`expense "${id}" added on ${who} lost`));

  // Converges: joined again with either side (now its ancestor), nothing changes.
  const mv = await commit(m, a);
  assert.ok(same(mergeTrips(a, mv, a), mv), say("joining again with a changed the result"));
}

test("every join of two random sides is valid, symmetric, neutral, makes no copies and loses nothing", async () => {
  const failures = [];
  for(let seed = FIRST; seed < FIRST + SEEDS; seed++){
    try{ await check(seed); }
    catch(e){ failures.push(e.message); if(failures.length >= 8) break; }
  }
  assert.deepEqual(failures, []);
});

// Phones (or a phone, the service and a chat) that edit, restore old versions and sync
// in any order, as js/trips.js does with a file received: newer taken, older kept,
// diverged joined from the most recent version both have seen.
async function replicas(seed){
  const r = random(seed), pick = list => list[Math.floor(r() * list.length)];
  const root = await ensureVersion(demo());
  const N = 3;
  const known = Array.from({length: N}, () => new Map([[root.version.id, root]]));
  const head = Array(N).fill(root), made = [root];
  const receive = async (i, j) => {
    for(const [id, v] of known[j]) known[i].set(id, v);   // the versions come with it, as on the service
    const mine = head[i], theirs = head[j], rel = relation(mine, theirs);
    if(rel === "same" || rel === "older") return;
    if(rel === "newer"){ head[i] = theirs; return; }
    const baseId = commonBase(mine, theirs, new Set(known[i].keys()));
    const joined = await commitMerge(mergeTrips(baseId ? known[i].get(baseId) : null, mine, theirs), mine, theirs);
    known[i].set(joined.version.id, joined);
    head[i] = joined;
  };
  for(let step = 0; step < 40; step++){
    const i = Math.floor(r() * N);
    if(r() < .55){
      // An edit, or History → Restore of any version this phone has.
      const next = r() < .15 ? JSON.parse(JSON.stringify(contentOf(pick([...known[i].values()])))) : edit(head[i], r, []);
      if(same(next, head[i])) continue;
      const v = await commit(next, head[i]);
      known[i].set(v.version.id, v);
      head[i] = v;
      made.push(v);
    }else await receive(i, (i + 1 + Math.floor(r() * (N - 1))) % N);
  }
  // Everyone syncs with everyone until nothing changes.
  for(let round = 0; round < 6 && new Set(head.map(h => h.version.id)).size > 1; round++)
    for(let i = 0; i < N; i++) for(let j = 0; j < N; j++) if(i !== j) await receive(i, j);
  const say = what => `replicas, seed ${seed}: ${what}`;
  assert.equal(new Set(head.map(h => h.version.id)).size, 1, say("the phones did not end on the same version"));
  const end = head[0];
  assert.ok(validateTrip(end).ok, say("invalid: " + validateTrip(end).errors.slice(0, 3).join("; ")));
  for(const id of new Set(placed(end).map(x => x.stop.id))){
    const most = Math.max(...made.map(v => at(v, id).length));
    assert.ok(at(end, id).length <= most, say(`"${id}" in ${at(end, id).length} places, never more than ${most} in any version made`));
  }
}

test("phones that edit, restore and sync in any order end on the same version, valid, nothing multiplied", async () => {
  const failures = [];
  for(let seed = FIRST; seed < FIRST + SEEDS / 4; seed++){
    try{ await replicas(seed); }
    catch(e){ failures.push(e.message); if(failures.length >= 8) break; }
  }
  assert.deepEqual(failures, []);
});
