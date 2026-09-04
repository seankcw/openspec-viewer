/**
 * The page mounted live under a path, for a host that has the store but not the root.
 *
 * A manual's dev server is the case: it serves its own page at `/`, so the viewer's
 * `/api/...` has no room, and a snapshot written to disk would be stale the moment a
 * spec was saved. What it can give is a path — `/viewer/` — and under it this handler
 * serves the page as a snapshot page, asking relatively, and answers each of the
 * snapshot's paths from the store as the request arrives: `requestFor` reads the file's
 * name back into the request it stands for, and `answer` is the same function the served
 * page is answered by. The page is stamped `live` rather than with a time, so it keeps
 * reading the store on the timer the served page does.
 *
 * In the shape both connect and `node:http` accept, and mounted with `use("/viewer",
 * handler)`, which strips the mount from `req.url` and keeps the whole on `originalUrl`.
 */

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LIVE, requestFor, stamp } from "../src/snapshot.js";
import { answer } from "./api.mjs";

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const DIST = join(PKG_ROOT, "dist");

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

/**
 * A path inside dist/, or null for anything that escapes it — the only thing standing
 * between a served directory and `GET /../../.ssh/id_rsa`.
 */
function assetFor(rel) {
  const inside = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const abs = join(DIST, inside);
  if (!abs.startsWith(DIST)) return null;
  if (existsSync(abs) && statSync(abs).isFile()) return abs;
  return null;
}

/** True when there is a built page to mount — the one thing this cannot make. */
export const hasPage = () => existsSync(join(DIST, "index.html"));

export function mounted() {
  return (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");

    if (rel === "") {
      // The page asks for `api/board.json` relative to its own address, so the address
      // has to end in a slash: from `/viewer` that resolves to `/api/board.json`, which
      // is somebody else's route or nobody's.
      const whole = new URL(req.originalUrl ?? req.url, "http://localhost");
      if (!whole.pathname.endsWith("/")) {
        res.statusCode = 302;
        res.setHeader("location", `${whole.pathname}/${whole.search}`);
        res.end();
        return;
      }
      res.setHeader("content-type", TYPES[".html"]);
      res.setHeader("cache-control", "no-store");
      res.end(stamp(readFileSync(join(DIST, "index.html"), "utf8"), LIVE));
      return;
    }

    if (rel.startsWith("api/")) {
      res.setHeader("content-type", TYPES[".json"]);
      res.setHeader("cache-control", "no-store");
      const request = requestFor(rel);
      if (!request) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `no snapshot file ${rel}` }));
        return;
      }
      try {
        const result = answer(request);
        if (result?.error) res.statusCode = 404;
        res.end(JSON.stringify(result));
      } catch (err) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error: err.stderr?.toString().trim() || err.message,
          }),
        );
      }
      return;
    }

    const file = assetFor(rel);
    if (!file) {
      next?.();
      if (!next) {
        res.statusCode = 404;
        res.end("Not found");
      }
      return;
    }
    res.setHeader(
      "content-type",
      TYPES[extname(file)] ?? "application/octet-stream",
    );
    res.setHeader("cache-control", "no-store");
    createReadStream(file).pipe(res);
  };
}
