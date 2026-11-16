## What changes for the traveller

<!-- One or two sentences. Screenshots at phone width for visual changes. -->

## Checked on

- [ ] iPhone, Safari
- [ ] iPhone, installed on the Home Screen
- [ ] Android, Chrome
- [ ] Airplane mode, after one online visit
- [ ] Light and dark theme
- [ ] Stops, versions or files changed: two phones swapping files end on the same version
- [ ] Manifest or stop form changed: Android, share a place from Google Maps

<!-- Leave unticked what you could not try, and say so. -->

## Checklist

- [ ] `npm run check`, `npm test` and `npm run e2e` pass
- [ ] No real trip data and no API keys in the changes
- [ ] If the trip format changed: validator, tests, `docs/trip-format.md` and the skill are updated
- [ ] If interface texts changed: every language in `js/i18n.js` is updated
- [ ] If files were added or removed: `node tools/check-precache.mjs --fix` was run
