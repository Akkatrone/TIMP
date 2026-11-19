// The form to make an account with the sharing service: a sign-up code, a handle, a
// passkey. It only collects and asks js/share.js; what happens after is the caller's.

import { t } from "./i18n.js";
import { esc } from "./util.js";
import { signUp, ShareError } from "./share.js";

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
