// Every sheet over the page (design/README.md, SH1–SH2): a <dialog> with its title and ×,
// open on the tap in its final shape; what is slow arrives inside it. A tap on the dim
// backdrop, × (or any [data-close]) or Escape closes it; closed, it leaves the page.

import { t } from "./i18n.js";
import { esc } from "./util.js";

let n = 0;

/**
 * @param {{title: string, body: string, id?: string, form?: boolean, cls?: string}} o
 *   id: the title's; form: a <form method="dialog"> (Enter submits it), whose × says
 *   Cancel; cls: the sheet's own class
 * @returns {HTMLDialogElement} open
 */
export function openSheet({title, body, id = "sheet-" + (++n), form = false, cls = ""}){
  const dlg = document.createElement("dialog");
  dlg.className = ("sheet " + cls).trim();
  dlg.setAttribute("aria-labelledby", id);
  const [open, close] = form ? ['form method="dialog" novalidate', "form"] : ["div", "div"];
  dlg.innerHTML = `<${open} class="sheet-form"><div class="sheet-head"><h2 id="${esc(id)}">${esc(title)}</h2>` +
    `<button type="button" class="iconbtn" data-close aria-label="${esc(t(form ? "cancel" : "close"))}">×</button></div>${body}</${close}>`;
  document.body.appendChild(dlg);
  dlg.addEventListener("click", e => { if(e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
  dlg.addEventListener("close", () => dlg.remove());
  dlg.showModal();
  return dlg;
}
