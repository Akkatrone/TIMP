# MapLibre GL JS 6.16.0

From npm, `maplibre-gl@6.16.0` (BSD-3-Clause, see LICENSE), package integrity
`sha512-gApO66EMtoDZuio680RUBvskR7ahFd/NNhLN4tBAs+Y7FeT4gQV8zVFgYVMRmFxQznOEzecW19w6xOd9XjZjiA==`.

Three files of its `dist/`, unchanged:

- `maplibre-gl.css`
- `maplibre-gl.mjs`, saved as `maplibre-gl.js`
- `maplibre-gl-worker.mjs`, saved as `maplibre-gl-worker.js`

Only the names change, so that any static host serves them as JavaScript (some
serve `.mjs` as a download). `js/livemap.js` imports the first and names the worker
with `setWorkerUrl`. To update: take the same three files of a newer version, at least
two weeks old, and change the version here.

They are not stored for offline use (tools/lib/app-files.mjs): the interactive map
needs a connection anyway.
