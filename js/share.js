// The app's side of the sharing service: the account, kept on this phone, and calls to
// the service as js/share-api.js describes them. Without SHARE_URL (js/config.js) none
// of this runs and nothing leaves the phone.
//
// Signing up and in uses a passkey (WebAuthn): the phone makes a key that never leaves
// it, opened with a fingerprint, the face or the PIN; the service keeps only its public
// half. No password anywhere.

import { SHARE_URL } from "./config.js";
import { getKV, setKV, delKV } from "./store.js";
import { ROUTES, pathOf, checkAnswer } from "./share-api.js";

const SESSION = "share:session";

/** Whether this copy of the app has a sharing service. */
export const hasService = () => !!SHARE_URL;

/** An error of the service: its status and its sentence (js/share-api.js, shape `error`). */
export class ShareError extends Error {
  constructor(status, message, current){
    super(message);
    this.status = status;
    this.current = current;
  }
}

/** The account on this phone: {token, user} or null. */
export async function session(){
  try{
    const s = await getKV(SESSION);
    return s && s.token && s.user ? s : null;
  }catch(e){ return null; }
}

/**
 * A route of the contract. Its answer is checked against the contract: anything else is
 * an error, never something half understood.
 */
export async function call(name, {params = {}, body, token} = {}){
  const r = ROUTES[name];
  const headers = {"Content-Type": "application/json"};
  if(r.auth){
    const s = token ? {token} : await session();
    if(!s) throw new ShareError(401, "sign in first");
    headers.Authorization = "Bearer " + s.token;
  }
  let res;
  try{
    res = await fetch(SHARE_URL + pathOf(name, params), {method: r.method, headers, body: r.body ? JSON.stringify(body || {}) : undefined, credentials: "omit"});
  }catch(e){ throw new ShareError(0, "offline"); }
  let data = null;
  try{ data = await res.json(); }catch(e){}
  if(!res.ok){
    // A session the service no longer knows is gone here too.
    if(res.status === 401 && r.auth && !token) await delKV(SESSION).catch(() => {});
    throw new ShareError(res.status, data && typeof data.error === "string" ? data.error : `error ${res.status}`, data && data.current);
  }
  const problems = checkAnswer(name, data);
  if(problems.length) throw new ShareError(502, "the service answered outside the contract: " + problems[0]);
  return data;
}

/* ---------- passkeys: JSON on the wire, bytes for the browser ---------- */

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const bytes = s => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

/** WebAuthn options as the service sends them (base64url) → as navigator.credentials wants them. */
export function creationOptions(o){
  return {...o, challenge: bytes(o.challenge), user: {...o.user, id: bytes(o.user.id)},
    excludeCredentials: (o.excludeCredentials || []).map(c => ({...c, id: bytes(c.id)}))};
}
export function requestOptions(o){
  return {...o, challenge: bytes(o.challenge), allowCredentials: (o.allowCredentials || []).map(c => ({...c, id: bytes(c.id)}))};
}

/** A new or used passkey as JSON for the service: toJSON() where the phone has it. */
export function credentialJSON(c){
  if(typeof c.toJSON === "function"){
    try{ return c.toJSON(); }catch(e){}
  }
  const r = c.response, out = {id: c.id, rawId: b64url(c.rawId), type: c.type, authenticatorAttachment: c.authenticatorAttachment || undefined,
    clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {}};
  if(r.attestationObject){
    const key = r.getPublicKey && r.getPublicKey();
    out.response = {clientDataJSON: b64url(r.clientDataJSON), attestationObject: b64url(r.attestationObject),
      authenticatorData: r.getAuthenticatorData ? b64url(r.getAuthenticatorData()) : undefined,
      publicKey: key ? b64url(key) : undefined, publicKeyAlgorithm: r.getPublicKeyAlgorithm ? r.getPublicKeyAlgorithm() : undefined,
      transports: r.getTransports ? r.getTransports() : []};
  }else{
    out.response = {clientDataJSON: b64url(r.clientDataJSON), authenticatorData: b64url(r.authenticatorData), signature: b64url(r.signature),
      userHandle: r.userHandle ? b64url(r.userHandle) : undefined};
  }
  return out;
}

// The person closed the passkey prompt, or the phone refused: not an error to report.
const cancelled = e => e && (e.name === "NotAllowedError" || e.name === "AbortError");

async function keep(s){
  await setKV(SESSION, {token: s.token, user: s.user});
  return s.user;
}

/** A new account: a sign-up code, a handle, a passkey. The user, or null if the person cancelled. */
export async function signUp(code, handle){
  const opt = await call("registerOptions", {body: {code, handle}});
  let cred;
  try{ cred = await navigator.credentials.create({publicKey: creationOptions(opt.publicKey)}); }
  catch(e){ if(cancelled(e)) return null; throw e; }
  return keep(await call("register", {body: {challengeId: opt.challengeId, credential: credentialJSON(cred)}}));
}

/** Signing in with a passkey of this app. The user, or null if the person cancelled. */
export async function signIn(){
  const opt = await call("loginOptions", {body: {}});
  let cred;
  try{ cred = await navigator.credentials.get({publicKey: requestOptions(opt.publicKey)}); }
  catch(e){ if(cancelled(e)) return null; throw e; }
  return keep(await call("login", {body: {challengeId: opt.challengeId, credential: credentialJSON(cred)}}));
}

/** Signing out: the session ends on the service (if it can be reached) and here. */
export async function signOut(){
  const s = await session();
  if(s) await call("logout", {token: s.token}).catch(() => {});
  await delKV(SESSION).catch(() => {});
}

/** The service as js/sync.js uses it: the routes of the contract, with this phone's session. */
export function serviceApi(){
  return {
    list: async () => (await call("trips")).trips,
    create: trip => call("createTrip", {body: {trip}}),
    push: (id, trip) => call("push", {params: {id}, body: {trip}}),
    version: (id, version) => call("version", {params: {id, version}}),
    getPrivate: id => call("getPrivate", {params: {id}}),
    putPrivate: (id, data, rev) => call("putPrivate", {params: {id}, body: {data, rev}})
  };
}

/** The owner deletes a trip from the account: gone for every phone and every person. */
export const deleteFromAccount = id => call("deleteTrip", {params: {id}});

/** Leaves a trip someone shared with this account. */
export const leaveTrip = (id, userId) => call("removeMember", {params: {id, user: userId}});
