// The sheet to share a trip on the account: who sees it and what they may do, the
// invites not accepted yet (taken back with one tap), and a new invite for one person,
// as a link sent however the owner likes. Only the trip's owner opens it.

import { t, getLang } from "./i18n.js";
import { esc } from "./util.js";
import { ask } from "./ask.js";
import { createInvite, pendingInvites, revokeInvite, tripMembers, leaveTrip, inviteLink } from "./share.js";
import { accountError } from "./account.js";

/**
 * @param {object} o
 *   rec     the trip's record (on the account, owned)
 *   toast   says something short over the page
 */
export function openShareSheet({rec, toast}){
  const id = rec.share.id;
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.setAttribute("aria-labelledby", "share-title");
  dlg.innerHTML = `
  <div class="sheet-form">
    <div class="sheet-head">
      <h2 id="share-title">${esc(t("shareTitle", {t: rec.trip.title}))}</h2>
      <button type="button" class="iconbtn" data-close aria-label="${esc(t("close"))}">×</button>
    </div>
    <section><h3 class="sheet-h">${esc(t("whoSees"))}</h3><div class="people" data-people aria-busy="true"><p class="foot">…</p></div></section>
    <section data-pending-box hidden><h3 class="sheet-h">${esc(t("pendingInvites"))}</h3><div class="people" data-pending></div></section>
    <section><h3 class="sheet-h">${esc(t("invitePerson"))}</h3>
      <div class="invite-new">
        <select data-role aria-label="${esc(t("invitePerson"))}"><option value="read">${esc(t("roleRead"))}</option><option value="edit">${esc(t("roleEdit"))}</option></select>
        <button type="button" class="btn primary" data-make>${esc(t("makeLink"))}</button>
      </div>
      <div class="invite-link" data-link hidden>
        <input type="text" readonly data-link-text aria-label="${esc(t("shareLink"))}">
        <div class="actions"><button type="button" class="btn small primary" data-send>${esc(t("shareLink"))}</button><button type="button" class="btn small" data-copy>${esc(t("copyLink"))}</button></div>
      </div>
      <p class="foot">${esc(t("linkHelp"))}</p>
    </section>
  </div>`;
  document.body.appendChild(dlg);
  const $ = sel => dlg.querySelector(sel);
  const role = r => t(r === "owner" ? "roleOwner" : r === "edit" ? "roleEdit" : "roleRead");
  const until = d => new Intl.DateTimeFormat(getLang(), {day: "numeric", month: "short"}).format(new Date(d));
  let people = [], pending = [];
  const draw = () => {
    $("[data-people]").removeAttribute("aria-busy");
    $("[data-people]").innerHTML = people.map(m => `<div class="person" data-person="${esc(m.id || "")}">
      <span class="who"><b>@${esc(m.handle)}</b><small>${esc(role(m.role))}${m.role === "owner" ? " · " + esc(t("you")) : ""}</small></span>
      ${m.role !== "owner" ? `<button type="button" class="btn small danger" data-remove="${esc(m.id)}" data-handle="${esc(m.handle)}">${esc(t("removePerson"))}</button>` : ""}</div>`).join("");
    $("[data-pending-box]").hidden = !pending.length;
    $("[data-pending]").innerHTML = pending.map(i => `<div class="person" data-invite="${esc(i.id)}">
      <span class="who"><b>${esc(role(i.role))}</b><small>${esc(t("inviteUntil", {d: until(i.expires)}))}</small></span>
      <button type="button" class="btn small" data-revoke="${esc(i.id)}">${esc(t("revoke"))}</button></div>`).join("");
  };
  const load = async () => {
    try{ [people, pending] = await Promise.all([tripMembers(id), pendingInvites(id)]); draw(); }
    catch(e){ $("[data-people]").removeAttribute("aria-busy"); $("[data-people]").innerHTML = `<p class="errbox" role="alert">${esc(accountError(e))}</p>`; }
  };
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", async e => {
    if(e.target === dlg || e.target.closest("[data-close]")){ dlg.close(); return; }
    const b = e.target.closest("button");
    if(!b) return;
    try{
      if(b.matches("[data-make]")){
        b.disabled = true;
        const inv = await createInvite(id, $("[data-role]").value);
        $("[data-link]").hidden = false;
        $("[data-link-text]").value = inviteLink(inv.token);
        await load();
      }else if(b.matches("[data-send]")){
        const url = $("[data-link-text]").value;
        if(navigator.share) await navigator.share({title: rec.trip.title, text: t("inviteText", {t: rec.trip.title}), url}).catch(() => {});
        else{ await navigator.clipboard.writeText(url); toast(t("linkCopied")); }
      }else if(b.matches("[data-copy]")){
        await navigator.clipboard.writeText($("[data-link-text]").value).catch(() => $("[data-link-text]").select());
        toast(t("linkCopied"));
      }else if(b.dataset.revoke){
        await revokeInvite(id, b.dataset.revoke);
        toast(t("inviteRevoked"));
        await load();
      }else if(b.dataset.remove){
        const h = b.dataset.handle;
        const yes = await ask({title: t("removePersonQ", {h}), text: t("removePersonText"),
          actions: [{id: "no", label: t("cancel")}, {id: "yes", label: t("removePerson"), kind: "danger"}]});
        if(yes !== "yes") return;
        await leaveTrip(id, b.dataset.remove);
        toast(t("personRemoved", {h}));
        await load();
      }
    }catch(err){ toast(accountError(err)); }
    finally{ b.disabled = false; }
  });
  dlg.showModal();
  load();
}
