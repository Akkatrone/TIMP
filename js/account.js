// The account's sheets: the form to make an account with the sharing service (a sign-up
// code, a handle, a passkey), and the chat apps linked to it. They only collect and ask
// js/share.js; what happens after is the caller's.

import { t, getLang } from "./i18n.js";
import { esc } from "./util.js";
import { ask } from "./ask.js";
import { signUp, ShareError, linkedApps, unlinkApp } from "./share.js";

const FINGER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6.5 8.5a6.5 6.5 0 0111.6-2.4M18.9 9.2c.4 1.6.4 3.3.1 4.8M5.6 11.5v2.2c0 2.6 1 5 2.7 6.8"/><path d="M8.6 12v1.7a8.6 8.6 0 002.2 5.8M12 9.8a2.3 2.3 0 012.3 2.3v1.6c0 1.6.4 3.1 1.2 4.4"/><path d="M12 13v.8a11 11 0 001.7 5.9"/></svg>';

/** What the service said, for people: its known sentences in the app's language. */
export function accountError(e){
  if(!(e instanceof ShareError)) return t("accountFailed");
  if(e.status === 0) return t("accountOffline");
  if(/^code:/.test(e.message)) return t("codeInvalid");
  if(/^handle: already/.test(e.message)) return t("handleTaken");
  if(/^handle:/.test(e.message)) return t("handleBad");
  if(e.status === 429 || e.status === 503) return t("accountBusy");
  return t("accountFailed");
}

/**
 * Opens the form.
 * @param {object} o
 *   onDone(user)   the account was made and this phone is signed in
 *   onSignIn()     the person has an account already
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
  const can = scopes => t(scopes.includes("trips:write") ? (scopes.includes("trips:read") ? "chatsReadWrite" : "chatsWrite") : "chatsRead");
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
