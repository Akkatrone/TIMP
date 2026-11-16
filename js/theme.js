// Applies the theme chosen on this device before the page is drawn, so the light
// theme never flashes on a phone set to dark. Loaded as a plain script, not a module.
// The choice itself is made on the Trips page (see setTheme in js/app.js).
try{
  var theme = localStorage.getItem("timp-theme");
  if(theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
}catch(e){}
