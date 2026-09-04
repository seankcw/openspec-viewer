/**
 * The store as HTTP. One connect-style handler, mounted three times: on Vite's dev
 * server, on its preview server, and on the plain Node server the published binary
 * runs. Defining the routes here rather than in vite.config.js is what keeps those
 * three honest — an endpoint that works in development and 404s in the shipped tool is
 * the failure this file exists to make impossible.
 *
 * GET only: this is a viewer, and writes belong to `openspec claim` / `done` /
 * `unclaim` so that every change to the plan stays a commit somebody can push.
 */

import { board } from "./board.mjs";
import {
  archive,
  capability,
  capabilityCatalog,
  conflicts,
} from "./catalog.mjs";
import { change, validate } from "./change.mjs";
import { doc } from "./doc.mjs";
import { search } from "./search.mjs";
import { changeIds, resolveRoot } from "./store.mjs";

const ROUTES = {
  "/api/board": () => {
    const data = board();
    const root = resolveRoot();
    // Folded into the board rather than given its own view: it is a directory scan per
    // change, and it is the warning PM most needs before the archive that would expose it.
    return {
      ...data,
      conflicts: conflicts(root.path, changeIds(root.path)),
    };
  },
  "/api/change": (url) => {
    const id = url.searchParams.get("id");
    if (!id) return { error: "missing ?id" };
    return change(id) ?? { error: `no change named '${id}'` };
  },
  "/api/validate": (url) => {
    const id = url.searchParams.get("id");
    return id ? validate(id) : { error: "missing ?id" };
  },
  "/api/specs": () => ({ specs: capabilityCatalog() }),
  "/api/spec": (url) => {
    const id = url.searchParams.get("id");
    if (!id) return { error: "missing ?id" };
    return capability(id) ?? { error: `no capability named '${id}'` };
  },
  "/api/archive": () => ({ archive: archive() }),
  // The archive is opt-in rather than a filter over one answer: it is most of the store's
  // text and all of it frozen, so reading it on every query would be work the reader
  // usually did not ask for and results they would have to scroll past.
  "/api/search": (url) => {
    const q = url.searchParams.get("q");
    if (q === null) return { error: "missing ?q" };
    return search(q, { archive: url.searchParams.get("archive") === "1" });
  },
  // Addressed by path rather than by id, because a document outside `openspec/` has no
  // id — what a spec's link gives us is where the file is, and that is the whole key.
  "/api/doc": (url) => {
    const path = url.searchParams.get("path");
    if (!path) return { error: "missing ?path" };
    return doc(path) ?? { error: `no document at '${path}'` };
  },
};

/**
 * Pay the first request's costs before it arrives.
 *
 * Opening the tool costs about two seconds of work that is then good for the rest of the
 * process: a CLI spawn to resolve the store, a walk of the history to index it by path,
 * and two git reads per change to date the task lists. Left lazy, every one of those
 * lands on the first request the page makes — which is the page the reader opened the
 * tool to look at.
 *
 * So the board is answered once and the answer thrown away, on a timer after the server
 * starts listening: it touches everything the first screen needs, through the same code
 * path that serves it, so nothing here can warm a cache the request does not use. The
 * work overlaps with the browser starting rather than following it.
 *
 * Swallows everything. A store that cannot be read is a real error, but it is the
 * request's to report with a status code, not a reason to fail before answering anything.
 */
export function warmUp() {
  try {
    ROUTES["/api/board"]();
  } catch {
    // Left for the first request to surface properly.
  }
}

/** True for any path this handler owns, so a static server knows what not to answer. */
export const isApiPath = (pathname) => pathname.startsWith("/api/");

/**
 * The answer to one request, as the route would give it. Throws on a path no route
 * owns, and returns the route's own `{ error }` for an argument it cannot serve.
 *
 * The one entry both the handler below and the snapshot writer go through, so a
 * snapshot files exactly what the server would have said — an answer that differs
 * between the two is the failure this file exists to make impossible.
 */
export function answer(request) {
  const url = new URL(request, "http://localhost");
  const route = ROUTES[url.pathname];
  if (!route) throw new Error(`no route ${url.pathname}`);
  return route(url);
}

/**
 * `(req, res) => void`, in the shape both connect and `node:http` accept.
 *
 * Vite mounts it at '/api' and rewrites `req.url` to the remainder, keeping the browser's
 * path on `originalUrl`; the bare Node server passes the whole path through. Reading
 * `originalUrl ?? url` covers both without either caller knowing about the other.
 */
export function apiHandler(req, res) {
  const url = new URL(req.originalUrl ?? req.url, "http://localhost");
  const route = ROUTES[url.pathname];

  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");

  if (!route) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `no route ${url.pathname}` }));
    return;
  }

  try {
    const result = route(url);
    // Routes report "no such change" / "missing ?id" by returning an `error` key rather
    // than throwing, so the status has to follow the body — a 200 carrying an error is
    // a thing every caller has to remember to special-case.
    if (result?.error) res.statusCode = 404;
    res.end(JSON.stringify(result));
  } catch (err) {
    // Usually the store id in the repo's openspec/config.yaml is not registered on this
    // machine, or the openspec CLI is not on PATH. Pass the CLI's own words through — it
    // explains that better than we can.
    res.statusCode = 500;
    res.end(
      JSON.stringify({ error: err.stderr?.toString().trim() || err.message }),
    );
  }
}
