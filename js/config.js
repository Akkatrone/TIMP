// Settings of a published copy of the app. Leave them empty while developing:
// tools/build.mjs fills them in when the site is published (see .github/workflows),
// so a fork has its own without editing anything.

// Address of the project page, used for the "how to create a trip file" links.
export const REPO_URL = "";

// Address of the link resolver (worker/), which turns a Google Maps short link into
// name, address, position and kind of place. Empty: the app reads links on its own.
export const RESOLVER_URL = "";
