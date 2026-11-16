// Versions of a trip, in the way Git versions a project.
//
// A version id is a hash of the trip's content and of the versions it comes from
// (its parents). The same content with the same parents always gives the same id,
// on any device. A trip file carries its version:
//
//   "version": {"id": "…", "parents": ["…"], "history": ["…", "…"], "date": "…"}
//
// `history` lists every earlier version, newest first: it is how a device tells
// whether a file it receives is newer, older, or went its own way.
// No DOM here: Node runs it in the tests (it needs Web Crypto, in Node 20+).

export const ID_LENGTH = 16;   // hex characters kept from SHA-256
export const SHORT = 7;        // characters shown, as Git does

export const shortId = id => String(id || "").slice(0, SHORT);

// The trip without its version: what the id is computed from.
export function contentOf(trip){
  const {version, ...rest} = trip;
  return rest;
}

// JSON with keys in a fixed order, so the same data always gives the same text.
export function canonical(value){
  if(Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if(value && typeof value === "object"){
    return "{" + Object.keys(value).filter(k => value[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

async function sha256(text){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function versionId(trip, parents){
  const hash = await sha256(canonical({content: contentOf(trip), parents: [...parents].sort()}));
  return hash.slice(0, ID_LENGTH);
}

// Puts the version right after the trip's id, where a person reading the file looks.
function withVersion(content, version){
  const {format, id, ...rest} = contentOf(content);
  return {format, id, version, ...rest};
}

// The version a trip carries. A file written before versions existed gets its root
// version, computed from its content: every device computes the same one.
export async function ensureVersion(trip){
  if(trip.version && trip.version.id) return trip;
  return withVersion(trip, {id: await versionId(trip, []), parents: [], history: []});
}

// A version of `content` made from the version `prev`.
export async function childOf(content, prev){
  const parents = [prev.id];
  const id = await versionId(content, parents);
  return withVersion(content, {id, parents, history: [prev.id, ...prev.history], date: new Date().toISOString()});
}

// A new version of `content`, made from the trip `from`; `from` itself if nothing changed.
export async function commit(content, from){
  if(canonical(contentOf(content)) === canonical(contentOf(from))) return from;
  return childOf(content, from.version);
}

// Whether a trip's content still matches its version id (a file edited by hand does not).
export async function isIntact(trip){
  return !!(trip.version && trip.version.id) && await versionId(trip, trip.version.parents || []) === trip.version.id;
}

// A version joining two others, for the result of a merge.
export async function commitMerge(content, a, b){
  const parents = [a.version.id, b.version.id].sort();
  const id = await versionId(content, parents);
  const history = [...new Set([...parents, ...a.version.history, ...b.version.history])];
  return withVersion(content, {id, parents, history, date: new Date().toISOString()});
}

/**
 * How an incoming trip relates to the one on the device:
 *   "same"     the same version
 *   "newer"    the incoming one was made from this one: take it as it is
 *   "older"    this one was made from the incoming one: nothing to do
 *   "diverged" both changed since a common version: they need a merge
 */
export function relation(local, incoming){
  const l = local.version, i = incoming.version;
  if(l.id === i.id) return "same";
  if(i.history.includes(l.id)) return "newer";
  if(l.history.includes(i.id)) return "older";
  return "diverged";
}

// The most recent version both have seen, among those `known` (ids whose content the
// device still has). Null when there is none: the merge then has no base.
export function commonBase(local, incoming, known){
  const theirs = new Set([incoming.version.id, ...incoming.version.history]);
  return [local.version.id, ...local.version.history].find(id => theirs.has(id) && known.has(id)) || null;
}
