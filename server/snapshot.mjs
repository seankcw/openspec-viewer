/**
 * The store, written down: every answer the API would give, filed where the page will
 * ask for it, beside a copy of the built page that knows to ask there.
 *
 * Nothing here decides what an answer holds. Each is produced by the same route the
 * served page is answered by — `answer()` in api.mjs — and filed at the path the page
 * computes for the same request, so the two halves cannot disagree about either. What
 * this file decides is *which* requests to answer, which the server never had to:
 * a server waits to be asked, and a snapshot has to ask everything first.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { corpusRequest, snapshotPath, stamp } from "../src/snapshot.js";
import { answer } from "./api.mjs";
import { resolveRoot } from "./store.mjs";

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const DIST = join(PKG_ROOT, "dist");

/**
 * Every markdown file in the store, as store-relative paths — the whole of what the
 * document route will answer for, since a link out of a spec can name any of them.
 *
 * From git where there is git, because the index already says which files are the
 * store's: a walk would have to guess at `node_modules/`, at build output, at whatever a
 * store's own tooling leaves behind. A store with no history is walked, skipping only
 * what no store means to publish.
 */
export function storeDocuments(storePath) {
  try {
    return execFileSync("git", ["ls-files", "-z", "--", "*.md", "*.MD"], {
      cwd: storePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\0")
      .filter(Boolean)
      .sort();
  } catch {
    return walk(storePath);
  }
}

const SKIPPED = new Set(["node_modules", "dist"]);

function walk(root, rel = "") {
  const out = [];
  let entries;
  try {
    entries = readdirSync(join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || SKIPPED.has(entry.name)) continue;
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(root, path));
    else if (/\.md$/i.test(entry.name)) out.push(path);
  }
  return out;
}

/**
 * Write the snapshot into `outDir`: the page, then the answers.
 *
 * The board is read first because it is the index the rest is enumerated from — the
 * changes in development are its rows — and because it is the request the page makes
 * first, so a store that cannot be read fails here before a directory has been made.
 *
 * `validate` runs `openspec validate --strict` per change, which is the CLI spawned once
 * per change at a couple of seconds each. On, because the served page shows it; off for
 * a store where that is longer than the rest of the snapshot put together.
 */
export function writeSnapshot(
  outDir,
  { validate = true, log = () => {} } = {},
) {
  const at = new Date().toISOString();
  const out = resolve(outDir);
  const board = answer("/api/board");
  const root = resolveRoot();

  mkdirSync(out, { recursive: true });
  cpSync(DIST, out, { recursive: true });
  writeFileSync(
    join(out, "index.html"),
    stamp(readFileSync(join(DIST, "index.html"), "utf8"), at),
  );

  const file = (request, body) => {
    const path = join(out, snapshotPath(request));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(body));
  };

  const counts = { changes: 0, validated: 0, specs: 0, documents: 0 };

  file("/api/board", board);
  const catalog = answer("/api/specs");
  file("/api/specs", catalog);
  const archive = answer("/api/archive");
  file("/api/archive", archive);

  // In development and archived alike: a shipped change has a page too, reached from
  // the archive and from every capability's history.
  const changes = [
    ...board.changes.map((c) => c.id),
    ...archive.archive.map((a) => a.id),
  ];
  for (const id of changes) {
    const request = `/api/change?id=${encodeURIComponent(id)}`;
    file(request, answer(request));
    counts.changes++;
  }
  log(`  ${counts.changes} changes`);

  if (validate) {
    for (const { id } of board.changes) {
      const request = `/api/validate?id=${encodeURIComponent(id)}`;
      file(request, answer(request));
      counts.validated++;
    }
    log(`  ${counts.validated} validated`);
  }

  for (const { capability } of catalog.specs) {
    const request = `/api/spec?id=${encodeURIComponent(capability)}`;
    file(request, answer(request));
    counts.specs++;
  }
  log(`  ${counts.specs} capabilities`);

  for (const path of storeDocuments(root.path)) {
    const request = `/api/doc?path=${encodeURIComponent(path)}`;
    const body = answer(request);
    // Not every tracked file passes the document route's own gate — one the git index
    // lists but the working copy no longer holds, say — and the route's word is final.
    if (body?.error) continue;
    file(request, body);
    counts.documents++;
  }
  log(`  ${counts.documents} documents`);

  for (const archived of [false, true]) {
    const request = corpusRequest(archived);
    file(request, answer(request));
  }

  return { at, out, ...counts };
}

/** True when the built page exists to be copied — the one thing this cannot make. */
export const hasPage = () => existsSync(join(DIST, "index.html"));
