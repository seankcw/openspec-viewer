/**
 * Finding a line in the store.
 *
 * The nav is a tree, and a tree answers "what is there" rather than "where does it say
 * that". A store here is 499 markdown files and three megabytes of them, so the reader who
 * knows the wording and not the capability had one option, which was to leave and grep.
 *
 * The whole store is read on every query — 35ms for those three megabytes, which is inside
 * the time the request spends elsewhere and cheaper than the process spawn a `git grep`
 * would cost. Reading rather than grepping also means the answer covers a change nobody has
 * committed yet, which is the state a plan spends its first hour in.
 *
 * The matching itself lives in `src/search.js`, because a snapshot ships the same corpus
 * to the browser and runs the same function there — this file is only the half that
 * touches disk.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

import { classify, searchDocuments } from "../src/search.js";
import { read, resolveRoot } from "./store.mjs";

export { classify };

/**
 * Every markdown file under `openspec/`, as store-relative paths.
 *
 * The archive is skipped unless asked for. It is 46 of the 75 changes here and most of the
 * store's text, all of it frozen — included by default it would bury the plan anyone is
 * actually working on under the record of what already shipped.
 *
 * `archive: "only"` is the complement — the archive and nothing else — so a snapshot can
 * write the two halves as two files and the page fetch the second only when asked.
 */
export function markdownFiles(storePath, { archive }) {
  const out = [];

  const walk = (rel) => {
    let entries;
    try {
      entries = readdirSync(join(storePath, rel), { withFileTypes: true });
    } catch {
      return; // a store with no openspec/ directory has nothing to search
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      const path = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!archive && path === "openspec/changes/archive") continue;
        walk(path);
      } else if (entry.name.endsWith(".md")) {
        if (archive === "only" && !path.startsWith("openspec/changes/archive/"))
          continue;
        out.push(path);
      }
    }
  };

  walk("openspec");
  return out;
}

/** The searchable text of the store, read once: `{ path, text }` per markdown file. */
export function corpus(storePath, { archive = false } = {}) {
  return markdownFiles(storePath, { archive })
    .map((path) => ({ path, text: read(join(storePath, path)) }))
    .filter((doc) => doc.text !== null);
}

/** Every document in the store holding the query, in reading order. */
export function searchStore(storePath, query, { archive = false } = {}) {
  return searchDocuments(corpus(storePath, { archive }), query, { archive });
}

/** The same, for the store the viewer was started against. */
export const search = (query, options) =>
  searchStore(resolveRoot().path, query, options);
