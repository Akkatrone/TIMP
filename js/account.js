// The account's sheets: the form to make an account with the sharing service (a sign-up
// code, a handle, a passkey), and the chat apps linked to it. They only collect and ask
// js/share.js; what happens after is the caller's.

import { t, getLang } from "./i18n.js";
import { esc } from "./util.js";
import { ask } from "./ask.js";
import { signUp, ShareError, linkedApps, unlinkApp, passkeys, openSessions, endOtherSessions, removePasskey, addPasskey, needsSignIn, signInAgain,
  recoveryState, makeRecoveryCodes, recoverAccount } from "./share.js";

const FINGER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6.5 8.5a6.5 6.5 0 0111.6-2.4M18.9 9.2c.4 1.6.4 3.3.1 4.8M5.6 11.5v2.2c0 2.6 1 5 2.7 6.8"/><path d="M8.6 12v1.7a8.6 8.6 0 002.2 5.8M12 9.8a2.3 2.3 0 012.3 2.3v1.6c0 1.6.4 3.1 1.2 4.4"/><path d="M12 13v.8a11 11 0 001.7 5.9"/></svg>';

/** What the service said, for people: its known sentences in the app's language. */
export function accountError(e){
  if(!(e instanceof ShareError)) return t("accountFailed");
  if(e.status === 0) return t("accountOffline");
  if(/^code:/.test(e.message)) return t("codeInvalid");
  if(/^handle: already/.test(e.message)) return t("handleTaken");
  if(/^handle:/.test(e.message)) return t("handleBad");
  if(/^passkey: already on this device/.test(e.message)) return t("passkeyHere");
  if(/^passkey: another account/.test(e.message)) return t("passkeyOther");
  if(/^recovery:/.test(e.message)) return t("recoverBad");
  if(e.status === 429 || e.status === 503) return t("accountBusy");
  return t("accountFailed");
}

/**
 * Opens the form.
 * @param {object} o
 *   onDone(user)   the account was made and this phone is signed in
 *   onSignIn()     the person has an account already
 *   onRecover()    the person lost every passkey and has a recovery code
 */
export function openSignUp(o){
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.setAttribute("aria-labelledby", "acct-title");
  dlg.innerHTML = `
  <form method="dialog" class="sheet-form" novalidate>
    <div class="sheet-head">
      <h2 id="acct-title">${esc(t("signUpTitle"))}</h2>
      <button type="button" class="iconbtn" data-close aria-label="${esc(t("cancel"))}">×</button>
    </div>
    <p class="foot">${esc(t("accountHelp"))}</p>
    <div class="field">
      <label for="acct-code">${esc(t("fSignupCode"))}</label>
      <input id="acct-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH-…">
    </div>
    <div class="field">
      <label for="acct-handle">${esc(t("fHandle"))}</label>
      <input id="acct-handle" type="text" autocomplete="username webauthn" autocapitalize="off" spellcheck="false" maxlength="30">
      <p class="foot">${esc(t("fHandleHelp"))}</p>
    </div>
    <div class="passkey">${FINGER}<span>${esc(t("passkeyHelp"))}</span></div>
    <p class="errbox" data-error role="alert" hidden></p>
    <p class="foot"><button type="button" class="linkbtn" data-recover>${esc(t("lostPasskey"))}</button></p>
    <div class="sheet-actions">
      <button type="button" class="btn" data-signin>${esc(t("haveAccount"))}</button>
      <span class="grow"></span>
      <button type="submit" class="btn primary">${esc(t("createPasskey"))}</button>
    </div>
  </form>`;
  document.body.appendChild(dlg);
  const $ = sel => dlg.querySelector(sel);
  const fail = (text, focus) => { const box = $("[data-error]"); box.textContent = text; box.hidden = false; if(focus) $(focus).focus(); };
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", e => {
    if(e.target === dlg || e.target.closest("[data-close]")) dlg.close();
    else if(e.target.closest("[data-signin]")){ dlg.close(); o.onSignIn(); }
    else if(e.target.closest("[data-recover]")){ dlg.close(); o.onRecover(); }
  });
  $("form").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("#acct-code").value.trim(), handle = $("#acct-handle").value.trim();
    if(!code) return fail(t("codeRequired"), "#acct-code");
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}$/.test(handle)) return fail(t("handleBad"), "#acct-handle");
    const go = $("[type=submit]");
    go.disabled = true;
    try{
      const user = await signUp(code, handle);
      if(user){ dlg.close(); o.onDone(user); }
    }catch(err){
      fail(accountError(err), /^handle/.test(err && err.message) ? "#acct-handle" : /^code/.test(err && err.message) ? "#acct-code" : null);
    }finally{ go.disabled = false; }
  });
  dlg.showModal();
  $("#acct-code").focus();
}

/**
 * The chat apps (Claude, ChatGPT…) that can reach the trips, each with what it can do,
 * since when, when last used, and Unlink: its keys stop working at once.
 * @param toast  says something short over the page
 */
export function openLinkedApps(toast){
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.setAttribute("aria-labelledby", "chats-title");
  dlg.innerHTML = `
  <div class="sheet-form">
    <div class="sheet-head">
      <h2 id="chats-title">${esc(t("chatsTitle"))}</h2>
      <button type="button" class="iconbtn" data-close aria-label="${esc(t("close"))}">×</button>
    </div>
    <p class="foot">${esc(t("chatsHelp"))}</p>
    <div class="chats" data-chats aria-busy="true"><p class="foot">…</p></div>
  </div>`;
  document.body.appendChild(dlg);
  const $list = dlg.querySelector("[data-chats]");
  const when = d => new Intl.DateTimeFormat(getLang(), {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}).format(new Date(d));
  const can = scopes => t(scopes.includes("trips:write") ? (scopes.includes("trips:read") ? "chatsReadWrite" : "chatsWrite") : "chatsRead")
    + (scopes.some(s => s.startsWith("private:")) ? t("chatsPrivate") : "");
  let apps = [];
  const draw = () => {
    $list.removeAttribute("aria-busy");
    $list.innerHTML = !apps.length ? `<p class="foot">${esc(t("chatsNone"))}</p>` : apps.map(a => `
      <div class="chat" data-chat="${esc(a.id)}">
        <span class="who"><b>${esc(a.client)}</b><small>${esc(can(a.scopes))}</small><small>${esc(t("chatsSince", {d: when(a.since)}))}</small><small>${esc(t("chatsUsed", {d: when(a.lastUsed)}))}</small></span>
        <button type="button" class="btn small danger" data-unlink="${esc(a.id)}">${esc(t("chatUnlink"))}</button>
      </div>`).join("");
  };
  const failed = e => { $list.removeAttribute("aria-busy"); $list.innerHTML = `<p class="errbox" role="alert">${esc(accountError(e))}</p>`; };
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", async e => {
    if(e.target === dlg || e.target.closest("[data-close]")){ dlg.close(); return; }
    const b = e.target.closest("[data-unlink]");
    if(!b) return;
    const app = apps.find(a => a.id === b.dataset.unlink);
    if(!app) return;
    const yes = await ask({title: t("chatUnlinkQ", {app: app.client}), text: t("chatUnlinkText"),
      actions: [{id: "no", label: t("cancel")}, {id: "yes", label: t("chatUnlink"), kind: "danger"}]});
    if(yes !== "yes") return;
    b.disabled = true;
    try{
      await unlinkApp(app.id);
      apps = apps.filter(a => a.id !== app.id);
      draw();
      toast(t("chatUnlinked", {app: app.client}));
    }catch(err){ b.disabled = false; toast(accountError(err)); }
  });
  dlg.showModal();
  linkedApps().then(list => { apps = list; draw(); }, failed);
}

/** A browser's User-Agent in a few words, "iPhone · Safari", "" if nothing is recognised. */
export function deviceName(ua){
  ua = String(ua || "");
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /CrOS/.test(ua) ? "ChromeOS"
    : /Macintosh|Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  // The order matters: Edge, Opera and Samsung say Chrome too, and Chrome says Safari.
  const app = /Edg(A|iOS)?\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "";
  return [os, app].filter(Boolean).join(" · ");
}

// Some things need a sign-in of the last minutes (the service says "sign in again"):
// adding or taking off a passkey, recovery codes, linking a chat app. The passkey is
// asked again, then the thing is done. A passkey to make needs a tap of its own
// (browsers allow one passkey prompt per tap): `again` labels it. null if the person
// stopped.
export async function recently(fn, again){
  try{ return await fn(); }
  catch(e){
    if(!needsSignIn(e)) throw e;
    const go = await ask({title: t("itsYouQ"), text: t("itsYouText"), actions: [{id: "no", label: t("cancel")}, {id: "yes", label: t("usePasskey"), kind: "primary"}]});
    if(go !== "yes" || !(await signInAgain())) return null;
    if(again && await ask({title: t("itsYouDone"), actions: [{id: "no", label: t("cancel")}, {id: "yes", label: again, kind: "primary"}]}) !== "yes") return null;
    return fn();
  }
}

/**
 * Who can get in: the account's passkeys (one more on this device, one taken off, never
 * the last), the recovery codes (made, shown once) and the devices signed in (all the
 * others signed out in one go).
 * @param o.toast  says something short over the page
 * @param o.save   save(file, title): gives a file to the person (share sheet or download)
 * @param o.handle the account's handle, for the codes' file
 */
export function openDevices({toast, save, handle}){
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.setAttribute("aria-labelledby", "devices-title");
  dlg.innerHTML = `
  <div class="sheet-form devices">
    <div class="sheet-head">
      <h2 id="devices-title">${esc(t("devicesTitle"))}</h2>
      <button type="button" class="iconbtn" data-close aria-label="${esc(t("close"))}">×</button>
    </div>
    <section>
      <h3 class="sheet-h">${esc(t("passkeysTitle"))}</h3>
      <p class="foot">${esc(t("passkeysHelp"))}</p>
      <div class="chats" data-keys aria-busy="true"><p class="foot">…</p></div>
      <button type="button" class="btn" data-add-key>${FINGER}${esc(t("addPasskey"))}</button>
    </section>
    <section>
      <h3 class="sheet-h">${esc(t("recoveryTitle"))}</h3>
      <p class="foot" data-recovery>…</p>
      <button type="button" class="btn" data-make-codes hidden></button>
      <div class="codes" data-codes hidden>
        <textarea readonly rows="10" spellcheck="false" aria-label="${esc(t("recoveryTitle"))}"></textarea>
        <p class="foot">${esc(t("recoveryKeep"))}</p>
        <div class="sheet-actions"><button type="button" class="btn" data-copy-codes>${esc(t("copyLink"))}</button><button type="button" class="btn primary" data-save-codes>${esc(t("recoverySave"))}</button></div>
      </div>
    </section>
    <section>
      <h3 class="sheet-h">${esc(t("sessionsTitle"))}</h3>
      <div class="chats" data-sessions aria-busy="true"><p class="foot">…</p></div>
      <button type="button" class="btn danger" data-end-others hidden>${esc(t("endOthers"))}</button>
    </section>
  </div>`;
  document.body.appendChild(dlg);
  const $ = sel => dlg.querySelector(sel);
  // The year only when it is not this one.
  const when = d => new Intl.DateTimeFormat(getLang(), {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    ...(new Date(d).getFullYear() !== new Date().getFullYear() ? {year: "numeric"} : {})}).format(new Date(d));
  let keys = [], devices = [], recovery = null;
  const draw = () => {
    for(const box of [$("[data-keys]"), $("[data-sessions]")]) box.removeAttribute("aria-busy");
    $("[data-keys]").innerHTML = keys.map((k, i) => `
      <div class="chat" data-key="${esc(k.id)}">
        <span class="who"><b>${esc(deviceName(k.device) || t("passkeyN", {n: i + 1}))}</b><small>${esc(t("passkeyAdded", {d: when(k.added)}))}</small><small>${esc(k.lastUsed ? t("chatsUsed", {d: when(k.lastUsed)}) : t("passkeyUnused"))}</small></span>
        ${keys.length > 1 ? `<button type="button" class="btn small danger" data-remove-key="${esc(k.id)}">${esc(t("passkeyRemove"))}</button>` : ""}
      </div>`).join("") + (keys.length === 1 ? `<p class="foot">${esc(t("passkeyLast"))}</p>` : "");
    $("[data-sessions]").innerHTML = devices.map(d => `
      <div class="chat" data-session="${esc(d.id)}"${d.current ? " data-current" : ""}>
        <span class="who"><b>${esc(deviceName(d.device) || t("deviceUnknown"))}</b><small>${esc(d.current ? t("deviceThis") : t("deviceSince", {d: when(d.since)}))}</small></span>
      </div>`).join("");
    $("[data-end-others]").hidden = devices.length < 2;
    if(recovery){
      $("[data-recovery]").textContent = recovery.made ? t("recoveryLeft", {n: recovery.left, d: when(recovery.made)}) : t("recoveryNone");
      $("[data-make-codes]").textContent = t(recovery.made ? "recoveryAgain" : "recoveryMake");
      $("[data-make-codes]").hidden = false;
    }
  };
  const failed = e => { for(const box of [$("[data-keys]"), $("[data-sessions]")]){ box.removeAttribute("aria-busy"); box.innerHTML = `<p class="errbox" role="alert">${esc(accountError(e))}</p>`; } };
  const load = () => Promise.all([passkeys(), openSessions(), recoveryState()]).then(([k, d, r]) => { keys = k; devices = d; recovery = r; draw(); }, failed);
  const codesText = () => t("recoveryFile", {h: handle}) + "\n\n" + $("[data-codes] textarea").value + "\n";
  // One thing at a time: the buttons wait while the service answers.
  const busy = async (b, fn) => {
    b.disabled = true;
    try{ await fn(); }catch(err){ toast(accountError(err)); }
    finally{ b.disabled = false; }
  };
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", async e => {
    if(e.target === dlg || e.target.closest("[data-close]")){ dlg.close(); return; }
    const add = e.target.closest("[data-add-key]"), off = e.target.closest("[data-remove-key]"), others = e.target.closest("[data-end-others]");
    const make = e.target.closest("[data-make-codes]"), copy = e.target.closest("[data-copy-codes]"), keep = e.target.closest("[data-save-codes]");
    if(make){
      // New codes void the old ones: asked first when there are some.
      if(recovery && recovery.made && await ask({title: t("recoveryAgainQ"), text: t("recoveryAgainText"),
        actions: [{id: "no", label: t("cancel")}, {id: "yes", label: t("recoveryAgain"), kind: "primary"}]}) !== "yes") return;
      busy(make, async () => {
        const codes = await recently(makeRecoveryCodes);
        if(!codes) return;
        $("[data-codes] textarea").value = codes.join("\n");
        $("[data-codes]").hidden = false;
        await load();
        $("[data-codes]").scrollIntoView({block: "nearest"});
      });
      return;
    }
    if(copy){
      await navigator.clipboard.writeText(codesText()).then(() => toast(t("recoveryCopied")), () => $("[data-codes] textarea").select());
      return;
    }
    if(keep){
      const day = new Date().toISOString().slice(0, 10);
      await save(new File([codesText()], `timp-recovery-codes-${handle}-${day}.txt`, {type: "text/plain"}), t("recoveryTitle"));
      return;
    }
    if(add) busy(add, async () => {
      if(await recently(addPasskey, t("addPasskey"))){ toast(t("passkeyAddedDone")); await load(); }
    });
    else if(off){
      const yes = await ask({title: t("passkeyRemoveQ"), text: t("passkeyRemoveText"),
        actions: [{id: "no", label: t("cancel")}, {id: "yes", label: t("passkeyRemove"), kind: "danger"}]});
      if(yes === "yes") busy(off, async () => {
        if(await recently(() => removePasskey(off.dataset.removeKey))){ toast(t("passkeyRemoved")); await load(); }
      });
    }
    else if(others){
      const yes = await ask({title: t("endOthersQ"), text: t("endOthersText"),
        actions: [{id: "no", label: t("cancel")}, {id: "yes", label: t("endOthers"), kind: "danger"}]});
      if(yes === "yes") busy(others, async () => { await endOtherSessions(); toast(t("endOthersDone")); await load(); });
    }
  });
  dlg.showModal();
  load();
}

/**
 * Every passkey lost: the handle and one recovery code, then a new passkey made on this
 * phone. Every other device is signed out.
 * @param onDone(user)  signed in on this phone
 * @param onClose()     the form is closed, done or not
 */
export function openRecover({onDone, onClose = () => {}}){
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.setAttribute("aria-labelledby", "recover-title");
  dlg.innerHTML = `
  <form method="dialog" class="sheet-form" novalidate>
    <div class="sheet-head">
      <h2 id="recover-title">${esc(t("recoverTitle"))}</h2>
      <button type="button" class="iconbtn" data-close aria-label="${esc(t("cancel"))}">×</button>
    </div>
    <p class="foot">${esc(t("recoverHelp"))}</p>
    <div class="field">
      <label for="rec-handle">${esc(t("fHandle"))}</label>
      <input id="rec-handle" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="31">
    </div>
    <div class="field">
      <label for="rec-code">${esc(t("fRecoveryCode"))}</label>
      <input id="rec-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH-…">
    </div>
    <div class="passkey">${FINGER}<span>${esc(t("recoverPasskey"))}</span></div>
    <p class="errbox" data-error role="alert" hidden></p>
    <div class="sheet-actions">
      <span class="grow"></span>
      <button type="submit" class="btn primary">${esc(t("createPasskey"))}</button>
    </div>
  </form>`;
  document.body.appendChild(dlg);
  const $ = sel => dlg.querySelector(sel);
  const fail = text => { const box = $("[data-error]"); box.textContent = text; box.hidden = false; };
  dlg.addEventListener("close", () => { dlg.remove(); onClose(); });
  dlg.addEventListener("click", e => { if(e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
  $("form").addEventListener("submit", async e => {
    e.preventDefault();
    const handle = $("#rec-handle").value.trim(), code = $("#rec-code").value.trim();
    if(!handle || !code) return fail(t("recoverBad"));
    const go = $("[type=submit]");
    go.disabled = true;
    try{
      const user = await recoverAccount(handle, code);
      if(user){ dlg.close(); onDone(user); }
    }catch(err){ fail(accountError(err)); }
    finally{ go.disabled = false; }
  });
  dlg.showModal();
  $("#rec-handle").focus();
}
