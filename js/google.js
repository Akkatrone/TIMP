// Google's Maps JavaScript API, loaded once per page and shared by the interactive
// map (js/livemap.js) and the address search (js/geocode.js).
//
// The script can be loaded only once per page, with one key and one language: a
// different key or language, or another try after a refusal, needs a fresh page.

import { getLang } from "./i18n.js";

let googlePromise = null;
let refused = false;                // Google rejected the key for this site
let loadedWith = null;              // {key, lang} of the script in this page
const onRefusal = new Set();        // called when Google rejects the key

export function googleNeedsReload(key){
  return !!(key && loadedWith && (loadedWith.key !== key || loadedWith.lang !== getLang()));
}

// Whether Google refused this key in this page.
export function googleRefusedKey(key){
  return refused && !!loadedWith && loadedWith.key === key;
}

// Run `fn` if Google rejects the key; returns a function that stops listening.
export function whenGoogleRefuses(fn){
  onRefusal.add(fn);
  return () => onRefusal.delete(fn);
}

export function loadGoogle(key){
  if(googleNeedsReload(key)) return Promise.reject(new Error("google-reload"));
  if(refused) return Promise.reject(new Error("google-refused"));
  if(!googlePromise){
    loadedWith = {key, lang: getLang()};
    googlePromise = new Promise((resolve, reject) => {
      window.__timpGoogleReady = () => resolve(window.google.maps);
      const js = document.createElement("script");
      js.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) +
        "&v=weekly&loading=async&callback=__timpGoogleReady&language=" + encodeURIComponent(getLang());
      js.async = true;
      js.onerror = () => reject(new Error("google-load"));
      document.head.appendChild(js);
    }).catch(e => { googlePromise = null; throw e; });
  }
  return googlePromise;
}

// Google calls this global when the key is missing, wrong, or not allowed on this site.
window.gm_authFailure = () => {
  refused = true;
  [...onRefusal].forEach(fn => fn());
};
