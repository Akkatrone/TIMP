// A question in a small dialog over the page, answered with one of its buttons.
// It replaces confirm(): the browser's own box cannot follow the app's look, and some
// viewers (claude.ai) answer it with "no" without showing it.
//
//   const answer = await ask({title, text, actions: [{id: "no", label: "Cancel"},
//                                                     {id: "yes", label: "Delete", kind: "danger"}]});
//
// `text` is a sentence, or a list of sentences and of {title, items} groups shown as
// short lists. Resolves with the id of the button, or null when the dialog is closed
// another way (Escape, a tap outside). The first button takes the focus: put the safe
// one first.
//
// `check`, {label, checked}: a box above the buttons. Once the dialog is answered,
// check.checked says how the traveller left it.

import { esc } from "./util.js";

export function ask({title, text = "", actions, check}){
  return new Promise(resolve => {
    const d = document.createElement("dialog");
    d.className = "ask";
    d.setAttribute("aria-labelledby", "ask-title");
    const body = [].concat(text).filter(Boolean).map(x => typeof x === "string" ? `<p>${esc(x)}</p>`
      : `<section><h3>${esc(x.title)}</h3><ul>${x.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></section>`).join("");
    const box = check ? `<label class="ask-check"><input type="checkbox"${check.checked ? " checked" : ""}><span>${esc(check.label)}</span></label>` : "";
    d.innerHTML = `<h2 id="ask-title">${esc(title)}</h2>${body}${box}` +
      `<div class="ask-actions">${actions.map(a => `<button type="button" class="btn ${esc(a.kind || "")}" data-answer="${esc(a.id)}">${esc(a.label)}</button>`).join("")}</div>`;
    document.body.appendChild(d);
    const done = answer => {
      if(check) check.checked = d.querySelector(".ask-check input").checked;
      if(d.open) d.close();
      d.remove();
      resolve(answer);
    };
    d.addEventListener("click", e => {
      const b = e.target.closest("[data-answer]");
      if(b) done(b.dataset.answer);
      else if(e.target === d) done(null);   // the dimmed backdrop
    });
    d.addEventListener("cancel", e => { e.preventDefault(); done(null); });
    d.showModal();
    d.querySelector("[data-answer]").focus();
  });
}
