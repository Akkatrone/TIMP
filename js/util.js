// Text from a trip file is never trusted as HTML: it is always escaped.

export function esc(s){
  return String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
}

// Escaped text with the one piece of markup trip files may use: **bold**.
export function rich(s){
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

export function mapsUrl(query){
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
}

export function dirUrl(query){
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(query) + "&travelmode=transit";
}

// What to search for when a stop is opened in Google Maps.
export function stopQuery(s){
  if(s.query) return s.query;
  if(s.lat !== undefined) return s.lat + "," + s.lng;
  return "";
}

export function dateParts(iso, lang){
  const d = new Date(iso + "T12:00:00Z");
  const fmt = opts => new Intl.DateTimeFormat(lang, {timeZone: "UTC", ...opts}).format(d);
  const long = fmt({weekday: "long", day: "numeric", month: "long"});
  return {
    dow: fmt({weekday: "short"}).replace(".", ""),
    long: long.charAt(0).toUpperCase() + long.slice(1)
  };
}

export function todayIn(timezone){
  try{
    return new Intl.DateTimeFormat("en-CA", {timeZone: timezone || undefined, year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
  }catch(e){
    return "";
  }
}

// The JSON in a text pasted from a chat: the ```json block, or what lies between the
// first "{" and the last "}". Assistants wrap the file in a sentence or two.
export function jsonIn(text){
  const s = String(text || "");
  const fence = /```[a-z]*[ \t]*\r?\n([\s\S]*?)```/i.exec(s);
  if(fence && fence[1].includes("{")) return fence[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  return a >= 0 && b > a ? s.slice(a, b + 1) : s.trim();
}
