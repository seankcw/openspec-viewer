/**
 * Finding a line in a set of documents. Pure string work, so the browser can run it over
 * a corpus the snapshot shipped and the server can run it over the files it just read,
 * and the two cannot rank the same query differently.
 *
 * What makes this worth having over a grep is not the matching, which is a substring. It is
 * that every path in an OpenSpec store says what the file is — a shipped spec, a delta on a
 * change in development, something frozen in the archive — so a hit can be filed under the
 * same three words the rest of this dashboard uses, and an id can be shown in all three
 * places it lives at once.
 */

import { REFERENCE_ID } from "./spec.js";

/** A query shorter than this matches most of the store, which is not an answer. */
export const MIN_QUERY = 2;

/** Hits kept per file. The count is reported whole; this is what the page draws. */
const HITS_PER_FILE = 5;

/** Files kept. A query that matches more than this is a query to narrow, not to page. */
const MAX_FILES = 100;

/** A matching line, cut to what a result row can show without becoming the document. */
const LINE_LIMIT = 240;

/** An id, and nothing else, is a lookup rather than a search — see `defines` below. */
const IS_ID = new RegExp(`^(?:${REFERENCE_ID})$`, "i");

/** Reading order, and the order the results are grouped in. */
const SCOPES = ["baseline", "development", "archive"];

/**
 * What a store path says the file is.
 *
 * Pure path reading: `openspec/specs/<capability>/spec.md` is the shipped baseline for that
 * capability, the same path under `changes/<id>/` is a delta on a change in development,
 * and under `changes/archive/<id>/` it is frozen. Nothing is opened to decide this, and
 * nothing else in the store needs consulting — which is the property that lets a result row
 * name a capability and a change without a second read.
 */
export function classify(path) {
  const parts = path.split("/");
  const artifact = parts[parts.length - 1].replace(/\.md$/, "");

  if (parts[1] === "specs") {
    return {
      scope: "baseline",
      capability: parts.slice(2, -1).join("/") || null,
      change: null,
      artifact,
    };
  }

  if (parts[1] === "changes") {
    const archived = parts[2] === "archive";
    const at = archived ? 3 : 2;
    // Everything between the change's own directory and the file: `specs/<capability>`
    // for a delta, nothing at all for an artifact of the change itself.
    const inside = parts.slice(at + 1, -1);
    return {
      scope: archived ? "archive" : "development",
      capability:
        inside[0] === "specs" ? inside.slice(1).join("/") || null : null,
      change: parts[at] ?? null,
      artifact,
    };
  }

  // A README at the top of the store, or anything else a store files there.
  return { scope: "baseline", capability: null, change: null, artifact };
}

/**
 * The matching lines in one document.
 *
 * A heading is flagged rather than ranked here, because what it means depends on the query:
 * for a phrase it is a requirement or a scenario named after what you asked for, and for an
 * id it is the one line in the store that defines it — every other hit on that id is
 * something citing it.
 */
function hitsIn(text, needle) {
  const hits = [];
  let total = 0;

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].toLowerCase().includes(needle)) continue;
    total++;
    if (hits.length >= HITS_PER_FILE) continue;
    const line = lines[i].trim();
    hits.push({
      line: i + 1,
      text: line.length > LINE_LIMIT ? `${line.slice(0, LINE_LIMIT)}…` : line,
      heading: line.startsWith("#"),
    });
  }

  return { hits, total };
}

/** Headings first, then the most hits, then the store's own order. */
function rank(a, b) {
  const scope = SCOPES.indexOf(a.scope) - SCOPES.indexOf(b.scope);
  if (scope !== 0) return scope;
  const heading = Number(b.defines) - Number(a.defines);
  if (heading !== 0) return heading;
  if (b.total !== a.total) return b.total - a.total;
  return a.path.localeCompare(b.path);
}

/**
 * Every document holding the query, in reading order.
 *
 * `documents` is `{ path, text }` pairs with store-relative paths, already narrowed to
 * the scope being asked about — whether the archive is in it is the caller's decision,
 * and `archive` here only records that decision on the answer.
 *
 * Case-insensitive substring, not a regex: the reader is typing a phrase out of a spec —
 * `specs/**`, `HKD 10`, `(BREAKING)` — and every one of those is a regex that either
 * throws or quietly means something else.
 */
export function searchDocuments(documents, query, { archive = false } = {}) {
  const q = String(query ?? "").trim();
  const id = IS_ID.test(q);
  const answer = {
    query: q,
    archive,
    id,
    scanned: 0,
    matched: 0,
    hits: 0,
    truncated: false,
    results: [],
  };
  if (q.length < MIN_QUERY) return answer;

  const needle = q.toLowerCase();
  const found = [];

  for (const { path, text } of documents) {
    answer.scanned++;
    if (!text || !text.toLowerCase().includes(needle)) continue;

    const { hits, total } = hitsIn(text, needle);
    if (!total) continue;

    answer.matched++;
    answer.hits += total;
    found.push({
      path,
      ...classify(path),
      // Whether this document is where the thing asked for is written down, rather than
      // one of the places citing it. Only meaningful for an id, and the reason a lookup
      // does not need a second endpoint.
      defines: hits.some((h) => h.heading),
      total,
      hits,
    });
  }

  found.sort(rank);
  answer.truncated = found.length > MAX_FILES;
  answer.results = found.slice(0, MAX_FILES);
  return answer;
}
