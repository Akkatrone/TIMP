// Applies the theme chosen on this device before the page is drawn, so the light
// theme never flashes on a phone set to dark. Loaded as a plain script, not a module.
// The choice itself is made on the Trips page (see setTheme in js/app.js).
try{
  var theme = localStorage.getItem("timp-theme");
  if(theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
}catch(e){}

// Android draws the scroll bar of the page itself over the content, whatever the CSS
// says. There the page scrolls inside <body> instead, whose bar can be hidden
// (css/app.css, .own-scroll; js/app.js, scroller).
if(/Android/i.test(navigator.userAgent)) document.documentElement.classList.add("own-scroll");

// Samsung Internet fails to install the app ("Download failed") with a manifest whose
// share target takes files. It gets the same manifest, sharing text and links only
// (manifest-basic.webmanifest; test/app.test.mjs keeps the two alike).
if(/SamsungBrowser/i.test(navigator.userAgent)){
  var manifest = document.querySelector('link[rel="manifest"]');
  if(manifest) manifest.setAttribute("href", "manifest-basic.webmanifest");
}
