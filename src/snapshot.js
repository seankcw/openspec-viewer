/**
 * The page served as files, with no store behind it.
 *
 * Every answer the API gives is a function of the store's disk and history, and both are
 * fixed at the moment somebody runs `openspec-viewer snapshot`. So the answers can be
 * written down — one file per route and argument — and the built page served from
 * anywhere that serves files, a manual site or a static host, with nothing to run.
 *
 * This file is the agreement between the two halves: the writer under `server/` files
 * each answer at the path this names, and the page asks for it at the same path. It is
 * pure so both can import it, and so the agreement can be tested without either.
 */

/**
 * How a snapshot announces itself: a tag the writer puts in the page's `<head>`, holding
 * the moment the store was read. The page reads it once on load; a served page has none.
 */
export const SNAPSHOT_META = "openspec-viewer-snapshot";

/**
 * The tag's value when the page is mounted live rather than frozen: a server answering
 * the snapshot's paths from the store on each request, as a manual's dev server does
 * under `/viewer/`. The page then asks relatively, as a snapshot does, but keeps reading
 * the store as the served page does — nothing on it is older than the last request.
 */
export const LIVE = "live";

/** Routes whose answer depends on no argument, filed as one document each. */
const WHOLE = new Set(["/api/board", "/api/specs", "/api/archive"]);

/**
 * The searchable text, in two halves: the plan, and the archive. The second is most of
 * the store's text and all of it frozen, so it is a file of its own, fetched only when
 * the reader asks for shipped changes — the same choice the served page makes per query.
 */
const CORPUS = { "api/search.json": false, "api/search-archive.json": true };

/** Routes filed under their one argument, and which parameter carries it. */
const BY_ARGUMENT = {
  "/api/change": "id",
  "/api/validate": "id",
  "/api/spec": "id",
  "/api/doc": "path",
};

/**
 * Where a snapshot files the answer to one API request.
 *
 * Relative rather than absolute, so the page resolves it against wherever it was mounted:
 * a snapshot under `/viewer/` asks for `/viewer/api/board.json` without having been told
 * about `/viewer/`. Arguments keep their slashes, because a capability's `/` is a
 * directory in the store and reads as one here — `api/spec/storefront/checkout.json`.
 *
 * Search is the one route with no fixed answer, so it has no file here; the page runs it
 * over the corpus the snapshot ships. See `corpusPath`.
 */
export function snapshotPath(request) {
  const url = new URL(request, "http://localhost");
  if (WHOLE.has(url.pathname)) return `api${url.pathname.slice(4)}.json`;
  if (url.pathname === "/api/corpus")
    return corpusPath(url.searchParams.get("archive") === "1");

  const param = BY_ARGUMENT[url.pathname];
  if (!param) throw new Error(`no snapshot for ${url.pathname}`);
  const value = url.searchParams.get(param);
  if (!value) throw new Error(`missing ?${param} for ${url.pathname}`);

  const segments = value.split("/").map(encodeURIComponent).join("/");
  return `api${url.pathname.slice(4)}/${segments}.json`;
}

/** Where the corpus half is filed — see `CORPUS`. */
export const corpusPath = (archive) =>
  archive ? "api/search-archive.json" : "api/search.json";

/** The request whose answer is one corpus half, for a writer that goes through `answer`. */
export const corpusRequest = (archive) =>
  archive ? "/api/corpus?archive=1" : "/api/corpus";

/**
 * The request a snapshot file answers — `snapshotPath` read backwards — or null when the
 * path is no file a snapshot writes. This is what lets a server stand where the files
 * would be: asked for `api/change/guest-checkout.json`, it answers `/api/change?id=guest-checkout`
 * from the store instead of from disk, and the page cannot tell the difference.
 */
export function requestFor(file) {
  if (file in CORPUS) return corpusRequest(CORPUS[file]);

  const match = file.match(/^api\/([^/]+?)(?:\/(.+))?\.json$/);
  if (!match) return null;
  const [, route, rest] = match;
  const pathname = `/api/${route}`;

  if (WHOLE.has(pathname)) return rest === undefined ? pathname : null;

  const param = BY_ARGUMENT[pathname];
  if (!param || rest === undefined) return null;
  const value = rest.split("/").map(decodeURIComponent).join("/");
  return `${pathname}?${param}=${encodeURIComponent(value)}`;
}

/**
 * The page's own `<head>`, with the snapshot tag in it. The built page is copied whole
 * and this is the one edit made to it, so the page is otherwise exactly the one the
 * binary serves.
 */
export function stamp(html, at) {
  const tag = `<meta name="${SNAPSHOT_META}" content="${at}" />`;
  return html.replace(/<head>/i, `<head>\n    ${tag}`);
}
