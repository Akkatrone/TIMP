// The contract between the app and its sharing service (accounts, sync, sharing):
// every route, what it takes and what it answers. One table, as FIELDS is for the trip
// file: the checks on both sides, the OpenAPI page and the lock are made from it.
// No DOM here: the service runs this file too.
//
// Inside a version only additions: a new route, a new optional field in a request, a
// new field in an answer. Anything else is /v2/, next to /v1/. contract/v1.lock.json
// is the contract as released; `node tools/check-contract.mjs` fails on a change that
// would break a client or a service built on it.

export const API = "1";

/*
 * A field: {type, req, null, values, of, doc}
 *   type: "text" | "number" | "bool" | "any" | "list" (items: `of`) | the name of a shape
 *   req: always there; null: may be null; values: one of them (text)
 */
const text = (doc, more = {}) => ({type: "text", req: true, doc, ...more});
const num = doc => ({type: "number", req: true, doc});

export const SHAPES = {
  user: {
    id: text("The account's id."),
    handle: text("The name others see: lower case letters, digits, dots, dashes."),
    name: {type: "text", doc: "A display name; may be empty."},
    since: text("When the account was made (ISO date).")
  },
  session: {
    token: text("Goes in `Authorization: Bearer <token>` on every request; kept on the phone."),
    user: {type: "user", req: true, doc: "Who signed in."}
  },
  ceremony: {
    challengeId: text("Sent back with the passkey's answer."),
    publicKey: {type: "any", req: true, doc: "The options for navigator.credentials (WebAuthn), as JSON."}
  },
  tripSummary: {
    id: text("The service's id of the trip (not the file's)."),
    localId: text("The id in the trip file."),
    title: text("Its title."),
    head: text("Its latest version id."),
    role: text("What the user may do with it.", {values: ["owner", "edit", "read"]}),
    visibility: text("Who sees it.", {values: ["private", "people", "link", "public"]}),
    firstDay: {type: "text", req: true, null: true, doc: "Its first date."},
    lastDay: {type: "text", req: true, null: true, doc: "Its last date."},
    days: num("How many days."),
    updatedAt: text("When it last changed here (ISO date).")
  },
  pushResult: {
    trip: text("The service's id of the trip."),
    kind: text("What the version sent was to the one here.", {values: ["new", "same", "newer", "older", "diverged"]}),
    head: text("The trip's version now: the phone takes it."),
    merged: {type: "any", doc: "When `kind` is diverged: the joined trip, the same a phone would make."}
  },
  versionInfo: {
    id: text("Version id."),
    parents: {type: "list", of: "text", req: true, doc: "The versions it was made from."},
    date: {type: "text", req: true, null: true, doc: "When it was made."},
    by: text("Handle of who sent it.")
  },
  privateSet: {
    data: {type: "any", req: true, null: true, doc: "The private expenses, as the trip file's `private` section, or null."},
    rev: num("Revision: send it back with the next change; 0 when there are none.")
  },
  invite: {
    token: text("Goes to one person, who accepts it signed in."),
    role: text("What they will be able to do.", {values: ["read", "edit"]}),
    expires: text("Until when it can be accepted (ISO date).")
  },
  member: {
    id: {type: "text", doc: "Account id (absent for the owner)."},
    handle: text("Their handle."),
    role: text("Their role.", {values: ["owner", "edit", "read"]})
  },
  ok: {ok: {type: "bool", req: true, doc: "Done."}},
  error: {
    error: text("A short sentence, safe to show."),
    current: {type: "any", doc: "With 409 on private expenses: what is there now, to join and send again."}
  }
};

/*
 * A route: {method, path, auth, body, answer, doc}
 *   path: ":name" are parameters; auth: a session is needed; body: its fields (requests
 *   with a body); answer: a shape's name, or fields.
 */
export const ROUTES = {
  health: {method: "GET", path: "/v1/health", auth: false, answer: {ok: {type: "bool", req: true}, api: {type: "list", of: "text", req: true, doc: "The API versions served."}}, doc: "Whether the service is up, and which API versions it has."},
  registerOptions: {method: "POST", path: "/v1/auth/register/options", auth: false, body: {code: text("A sign-up code."), handle: text("The handle wanted.")}, answer: "ceremony", doc: "Sign-up, step one: the code and the handle are checked; the phone gets what its passkey signs."},
  register: {method: "POST", path: "/v1/auth/register", auth: false, body: {challengeId: text("From step one."), credential: {type: "any", req: true, doc: "The new passkey, as PublicKeyCredential.toJSON()."}}, answer: "session", doc: "Sign-up, step two: the account, its passkey, a session."},
  loginOptions: {method: "POST", path: "/v1/auth/login/options", auth: false, body: {}, answer: "ceremony", doc: "Sign-in, step one."},
  login: {method: "POST", path: "/v1/auth/login", auth: false, body: {challengeId: text("From step one."), credential: {type: "any", req: true, doc: "The passkey's answer, as PublicKeyCredential.toJSON()."}}, answer: "session", doc: "Sign-in, step two: a session."},
  logout: {method: "POST", path: "/v1/auth/logout", auth: true, body: {}, answer: "ok", doc: "Ends this session."},
  me: {method: "GET", path: "/v1/me", auth: true, answer: "user", doc: "The signed-in account."},
  trips: {method: "GET", path: "/v1/trips", auth: true, answer: {trips: {type: "list", of: "tripSummary", req: true}}, doc: "The user's trips and those shared with them, newest change first."},
  createTrip: {method: "POST", path: "/v1/trips", auth: true, body: {trip: {type: "any", req: true, doc: "A trip file with its version, as the app keeps it."}}, answer: "pushResult", doc: "A trip sent for the first time (again: a push)."},
  trip: {method: "GET", path: "/v1/trips/:id", auth: true, answer: "tripSummary", doc: "One trip."},
  deleteTrip: {method: "DELETE", path: "/v1/trips/:id", auth: true, answer: "ok", doc: "The owner deletes a trip, for everyone."},
  history: {method: "GET", path: "/v1/trips/:id/history", auth: true, answer: {versions: {type: "list", of: "versionInfo", req: true}}, doc: "Its versions, newest first."},
  version: {method: "GET", path: "/v1/trips/:id/versions/:version", auth: true, answer: "any", doc: "A version, as its trip file. Never changes."},
  push: {method: "POST", path: "/v1/trips/:id/push", auth: true, body: {trip: {type: "any", req: true, doc: "The trip as the phone has it."}}, answer: "pushResult", doc: "A version from a phone: taken, or joined."},
  getPrivate: {method: "GET", path: "/v1/trips/:id/private", auth: true, answer: "privateSet", doc: "The user's own private expenses of a trip."},
  putPrivate: {method: "PUT", path: "/v1/trips/:id/private", auth: true, body: {data: {type: "any", req: true, null: true, doc: "The whole set, or null to remove it."}, rev: num("The revision it was made from.")}, answer: "privateSet", doc: "Replaces them, if `rev` is still the one here (409 otherwise, with `current`)."},
  invite: {method: "POST", path: "/v1/trips/:id/invites", auth: true, body: {role: text("read or edit.", {values: ["read", "edit"]})}, answer: "invite", doc: "The owner invites one person."},
  acceptInvite: {method: "POST", path: "/v1/invites/accept", auth: true, body: {token: text("The invite's token.")}, answer: "tripSummary", doc: "The trip joins the user's \"Shared with you\"."},
  members: {method: "GET", path: "/v1/trips/:id/members", auth: true, answer: {members: {type: "list", of: "member", req: true}}, doc: "Who a trip is shared with."},
  removeMember: {method: "DELETE", path: "/v1/trips/:id/members/:user", auth: true, answer: "ok", doc: "The owner takes someone off; anyone can leave."}
};

/* ---------- checks ---------- */

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);

function value(v, f, path, errors){
  if(v === null){ if(!f.null) errors.push(`${path}: must not be null`); return; }
  switch(f.type){
    case "any": return;
    case "text":
      if(typeof v !== "string") errors.push(`${path}: must be a text`);
      else if(f.values && !f.values.includes(v)) errors.push(`${path}: must be one of ${f.values.join(", ")}`);
      return;
    case "number": if(typeof v !== "number" || !Number.isFinite(v)) errors.push(`${path}: must be a number`); return;
    case "bool": if(typeof v !== "boolean") errors.push(`${path}: must be true or false`); return;
    case "list":
      if(!Array.isArray(v)){ errors.push(`${path}: must be a list`); return; }
      v.forEach((x, i) => value(x, {type: f.of}, `${path}[${i}]`, errors));
      return;
    default: fields(v, SHAPES[f.type], path, errors);
  }
}

// Fields a check does not know are let through: a newer side may send more.
function fields(o, spec, path, errors){
  if(!isObj(o)){ errors.push(`${path || "body"}: must be an object`); return; }
  for(const [k, f] of Object.entries(spec)){
    const p = path ? `${path}.${k}` : k;
    if(o[k] === undefined){ if(f.req) errors.push(`${p}: is required`); continue; }
    value(o[k], f, p, errors);
  }
}

const specOf = s => typeof s === "string" ? (s === "any" ? null : SHAPES[s]) : s;

/** The problems of a request body for a route; [] when it is right. */
export function checkRequest(name, body){
  const r = ROUTES[name], errors = [];
  if(r.body) fields(body, r.body, "", errors);
  return errors;
}

/** The problems of an answer of a route (status 2xx); [] when it is right. */
export function checkAnswer(name, body){
  const spec = specOf(ROUTES[name].answer), errors = [];
  if(spec) fields(body, spec, "", errors);
  return errors;
}

/** A route's address, with its parameters: pathOf("push", {id: "a b"}) → "/v1/trips/a%20b/push". */
export function pathOf(name, params = {}){
  return ROUTES[name].path.replace(/:(\w+)/g, (_, k) => {
    if(params[k] === undefined) throw new Error(`${name}: missing ${k}`);
    return encodeURIComponent(params[k]);
  });
}

/* ---------- the lock: what a released version promises ---------- */

const flat = spec => spec && Object.fromEntries(Object.entries(spec).map(([k, f]) =>
  [k, {type: f.type, ...(f.of ? {of: f.of} : {}), ...(f.req ? {req: true} : {}), ...(f.null ? {null: true} : {}), ...(f.values ? {values: f.values} : {})}]));

/** The contract as data, without the docs: what contract/v1.lock.json keeps. */
export function lockOf(){
  return {
    api: API,
    shapes: Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, flat(s)])),
    routes: Object.fromEntries(Object.entries(ROUTES).map(([k, r]) => [k, {method: r.method, path: r.path, auth: r.auth,
      ...(r.body ? {body: flat(r.body)} : {}), answer: typeof r.answer === "string" ? r.answer : flat(r.answer)}]))
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What in `now` breaks what `lock` promised. Allowed: new routes, new shapes, new
 * optional request fields, new answer fields, values added to a request field.
 */
export function breaks(lock, now = lockOf()){
  const out = [];
  // An answer field: still there, as sure, of the same type, no new null, no new value.
  const answer = (was, is, where) => {
    if(typeof was === "string" || typeof is === "string"){ if(!same(was, is)) out.push(`${where}: answer changed`); return; }
    for(const [k, f] of Object.entries(was)){
      const g = is[k];
      if(!g){ out.push(`${where}.${k}: removed`); continue; }
      if(g.type !== f.type || g.of !== f.of) out.push(`${where}.${k}: type changed`);
      if(f.req && !g.req) out.push(`${where}.${k}: no longer always there`);
      if(g.null && !f.null) out.push(`${where}.${k}: may now be null`);
      if(f.values && (!g.values || g.values.some(v => !f.values.includes(v)))) out.push(`${where}.${k}: new values`);
    }
  };
  // A request field: still taken, of the same type, not newly required, no value dropped.
  const request = (was = {}, is = {}, where) => {
    for(const [k, f] of Object.entries(was)){
      const g = is[k];
      if(!g){ out.push(`${where}.${k}: no longer taken`); continue; }
      if(g.type !== f.type || g.of !== f.of) out.push(`${where}.${k}: type changed`);
      if(f.null && !g.null) out.push(`${where}.${k}: null no longer taken`);
      if(f.values && g.values && f.values.some(v => !g.values.includes(v))) out.push(`${where}.${k}: values dropped`);
    }
    for(const [k, g] of Object.entries(is)) if(!was[k] && g.req) out.push(`${where}.${k}: new and required`);
  };
  if(lock.api !== now.api) out.push(`api: ${lock.api} is now ${now.api}`);
  for(const [k, s] of Object.entries(lock.shapes)){
    if(!now.shapes[k]) out.push(`shape ${k}: removed`);
    else answer(s, now.shapes[k], `shape ${k}`);
  }
  for(const [k, r] of Object.entries(lock.routes)){
    const n = now.routes[k];
    if(!n){ out.push(`route ${k}: removed`); continue; }
    for(const p of ["method", "path", "auth"]) if(n[p] !== r[p]) out.push(`route ${k}: ${p} changed`);
    request(r.body, n.body, `route ${k} request`);
    answer(r.answer, n.answer, `route ${k} answer`);
  }
  return out;
}

/* ---------- for people and tools ---------- */

/** The contract as an OpenAPI 3.1 document. */
export function openApi(){
  const schema = f => {
    const base = f.type === "text" ? {type: "string", ...(f.values ? {enum: f.values} : {})}
      : f.type === "number" ? {type: "number"} : f.type === "bool" ? {type: "boolean"} : f.type === "any" ? {}
      : f.type === "list" ? {type: "array", items: schema({type: f.of})} : {$ref: `#/components/schemas/${f.type}`};
    return {...(f.null ? {anyOf: [base, {type: "null"}]} : base), ...(f.doc ? {description: f.doc} : {})};
  };
  const object = spec => ({type: "object", properties: Object.fromEntries(Object.entries(spec).map(([k, f]) => [k, schema(f)])), required: Object.keys(spec).filter(k => spec[k].req)});
  const answer = a => typeof a === "string" ? (a === "any" ? {} : {$ref: `#/components/schemas/${a}`}) : object(a);
  const paths = {};
  for(const [name, r] of Object.entries(ROUTES)){
    const path = r.path.replace(/:(\w+)/g, "{$1}");
    paths[path] = paths[path] || {};
    paths[path][r.method.toLowerCase()] = {
      operationId: name, summary: r.doc,
      parameters: [...r.path.matchAll(/:(\w+)/g)].map(m => ({name: m[1], in: "path", required: true, schema: {type: "string"}})),
      ...(r.auth ? {security: [{session: []}]} : {}),
      ...(r.body ? {requestBody: {required: true, content: {"application/json": {schema: object(r.body)}}}} : {}),
      responses: {200: {description: "Done.", content: {"application/json": {schema: answer(r.answer)}}},
        default: {description: "An error.", content: {"application/json": {schema: {$ref: "#/components/schemas/error"}}}}}
    };
  }
  return {openapi: "3.1.0", info: {title: "TIMP sharing service", version: API}, paths,
    components: {schemas: Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, object(s)])), securitySchemes: {session: {type: "http", scheme: "bearer"}}}};
}
