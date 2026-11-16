// Interface strings. The trip's own texts come from the trip file.
// To add a language: copy the "en" block, translate it, add it to STRINGS.

// Languages the interface can be shown in, by their own name.
export const LANGS = {en: "English", it: "Italiano"};

export const STRINGS = {
  en: {
    tagline: "A pocket travel guide that works without internet.",
    welcomeLead: "The app is the same for everyone. Your trip is a file that stays on this device: it is never uploaded anywhere.",
    loadTrip: "Load a trip file",
    tryDemo: "Try the example trip",
    installTitle: "Before you leave",
    installIos: "**iPhone**: open this page in Safari, tap Share, then «Add to Home Screen». Load the trip from the icon on the Home Screen, not from Safari.",
    installAndroid: "**Android**: open the browser menu and tap «Install app» or «Add to Home screen».",
    installOnce: "Open the app once with a connection, then it also works in airplane mode.",
    makeYourOwn: "How to create a trip file",
    day: "Day", today: "today", info: "Info", trips: "Trips",
    arrival: "Start", night: "Night", doneCount: "{a}/{b} done",
    mapOpen: "Map of the day", mapClose: "Close the map",
    viewLive: "Map", viewImage: "Picture", viewSchema: "Sketch",
    choosePlan: "Choose the plan", mapType: "Type of map", dayMap: "Map of the day",
    stopsOfDay: "Stops of the day",
    openInMaps: "Open in Google Maps ↗", mapLink: "Map ↗", routeLink: "Directions ↗",
    onlyInSketch: "only in the sketch", offSketch: "off the sketch",
    footLive: "Lines are straight between stops. For transport times use «Directions» on a stop.",
    footImage: "The numbers match the pins in the picture and the stops below.",
    footSketch: "Sketch to scale, positions are approximate.",
    footNumbers: "The numbers match the stops below.",
    offlineMap: "You are offline: the interactive map needs a connection. The sketch is still available.",
    mapLoading: "Loading the map…",
    mapFailed: "The map could not be loaded. Use the sketch, or try again with a connection.",
    googleKeyBad: "Google Maps refused the key for this site: showing OpenStreetMap instead.",
    footDay: "Times are indicative. Tap a description to read it all. Tap the circle to mark a stop as done, or «Skip» if you leave it out: both are saved on this phone.",
    markDone: "Mark as done", markUndone: "Mark as not done",
    skip: "Skip", unskip: "Restore", skipped: "Skipped", skippedOne: "1 skipped", skippedCount: "{n} skipped",
    expandAll: "Show all descriptions in full", collapseAll: "Shorten all descriptions",
    language: "Language", langAuto: "Automatic",
    whereYouSleep: "Where you sleep",
    yourTrips: "Your trips", current: "open", open: "Open", remove: "Delete",
    updateTrip: "Load or update a trip",
    removeConfirm: "Delete «{t}» from this device? The stops you marked as done are deleted too.",
    imported: "«{t}» loaded.", updated: "«{t}» updated.", removed: "Trip deleted.",
    importFailed: "This file cannot be used",
    notJson: "The file is not valid JSON.",
    daysCount: "{n} days", loadedOn: "loaded on {d}",
    storageWarn: "This browser does not keep data (private window?): the trip will be gone when you close the page.",
    googleKeyTitle: "Google Maps key (optional)",
    googleKeyHelp: "Without a key the interactive map uses OpenStreetMap. A key written in the trip file is used automatically; a key saved here applies to every trip on this device.",
    googleKeyFromTrip: "The open trip carries its own key.",
    save: "Save", saved: "Saved.",
    about: "About", version: "Version {v}",
    updateReady: "A new version is ready.", reload: "Update",
    offlineReady: "Ready to work offline.",
    newer: "←", older: "→"
  },
  it: {
    tagline: "Una guida di viaggio tascabile che funziona senza internet.",
    welcomeLead: "L'app è uguale per tutti. Il tuo viaggio è un file che resta su questo dispositivo: non viene caricato da nessuna parte.",
    loadTrip: "Carica un file viaggio",
    tryDemo: "Prova il viaggio di esempio",
    installTitle: "Prima di partire",
    installIos: "**iPhone**: apri questa pagina in Safari, tocca Condividi, poi «Aggiungi alla schermata Home». Carica il viaggio dall'icona nella Home, non da Safari.",
    installAndroid: "**Android**: apri il menu del browser e tocca «Installa app» o «Aggiungi a schermata Home».",
    installOnce: "Apri l'app una volta con la rete: poi funziona anche in modalità aereo.",
    makeYourOwn: "Come creare un file viaggio",
    day: "Giorno", today: "oggi", info: "Info", trips: "Viaggi",
    arrival: "Partenza", night: "Notte", doneCount: "{a}/{b} fatte",
    mapOpen: "Mappa del giorno", mapClose: "Chiudi la mappa",
    viewLive: "Mappa", viewImage: "Immagine", viewSchema: "Schema",
    choosePlan: "Scegli il piano", mapType: "Tipo di mappa", dayMap: "Mappa del giorno",
    stopsOfDay: "Tappe del giorno",
    openInMaps: "Apri in Google Maps ↗", mapLink: "Mappa ↗", routeLink: "Percorso ↗",
    onlyInSketch: "solo nello schema", offSketch: "fuori schema",
    footLive: "Le linee sono dritte tra le tappe. Per gli orari dei mezzi usate «Percorso» nella singola tappa.",
    footImage: "I numeri sono quelli dei segnaposto nell'immagine, riportati anche accanto alle tappe qui sotto.",
    footSketch: "Schema in scala, posizioni indicative.",
    footNumbers: "I numeri sono quelli delle tappe qui sotto.",
    offlineMap: "Sei offline: la mappa interattiva ha bisogno della rete. Lo schema resta disponibile.",
    mapLoading: "Carico la mappa…",
    mapFailed: "Non sono riuscito a caricare la mappa. Usa lo schema, o riprova con la rete.",
    googleKeyBad: "Google Maps ha rifiutato la chiave per questo sito: uso OpenStreetMap.",
    footDay: "Gli orari sono indicativi. Toccate una descrizione per leggerla tutta. Toccate il cerchio per segnare una tappa fatta, o «Salta» se la lasciate fuori: resta salvato su questo telefono.",
    markDone: "Segna come fatta", markUndone: "Segna come da fare",
    skip: "Salta", unskip: "Ripristina", skipped: "Saltata", skippedOne: "1 saltata", skippedCount: "{n} saltate",
    expandAll: "Mostra tutte le descrizioni per intero", collapseAll: "Accorcia tutte le descrizioni",
    language: "Lingua", langAuto: "Automatica",
    whereYouSleep: "Dove dormite",
    yourTrips: "I tuoi viaggi", current: "aperto", open: "Apri", remove: "Elimina",
    updateTrip: "Carica o aggiorna un viaggio",
    removeConfirm: "Eliminare «{t}» da questo dispositivo? Si perdono anche le tappe segnate come fatte.",
    imported: "«{t}» caricato.", updated: "«{t}» aggiornato.", removed: "Viaggio eliminato.",
    importFailed: "Questo file non si può usare",
    notJson: "Il file non è un JSON valido.",
    daysCount: "{n} giorni", loadedOn: "caricato il {d}",
    storageWarn: "Questo browser non conserva i dati (finestra privata?): il viaggio sparirà alla chiusura della pagina.",
    googleKeyTitle: "Chiave Google Maps (facoltativa)",
    googleKeyHelp: "Senza chiave la mappa interattiva usa OpenStreetMap. Una chiave scritta nel file viaggio viene usata da sola; una chiave salvata qui vale per tutti i viaggi su questo dispositivo.",
    googleKeyFromTrip: "Il viaggio aperto ha già la sua chiave.",
    save: "Salva", saved: "Salvato.",
    about: "Informazioni", version: "Versione {v}",
    updateReady: "È pronta una nuova versione.", reload: "Aggiorna",
    offlineReady: "Pronta per funzionare offline.",
    newer: "←", older: "→"
  }
};

let lang = "en";

export function setLang(code){
  const short = String(code || "").toLowerCase().slice(0, 2);
  lang = STRINGS[short] ? short : "en";
  document.documentElement.lang = lang;
  return lang;
}

export function deviceLang(){
  return (navigator.languages && navigator.languages[0]) || navigator.language || "en";
}

export function getLang(){ return lang; }

export function t(key, vars){
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if(vars) Object.entries(vars).forEach(([k, v]) => { s = s.replace(`{${k}}`, v); });
  return s;
}
