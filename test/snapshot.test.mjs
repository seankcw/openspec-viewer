/**
 * A snapshot is two halves that never meet: a writer filing answers on one machine, and
 * a page asking for them on another, later. What holds them together is one function
 * naming the file for a request, so that function is what these pin — a page asking at
 * one path for a file the writer left at another is a snapshot that reads as an empty
 * store, with nothing anywhere to say why.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { storeDocuments } from "../server/snapshot.mjs";
import { searchDocuments } from "../src/search.js";
import {
  corpusPath,
  SNAPSHOT_META,
  snapshotPath,
  stamp,
} from "../src/snapshot.js";

describe("snapshotPath", () => {
  it("files a whole answer under its route", () => {
    assert.equal(snapshotPath("/api/board"), "api/board.json");
    assert.equal(snapshotPath("/api/specs"), "api/specs.json");
    assert.equal(snapshotPath("/api/archive"), "api/archive.json");
  });

  it("files an answer with an argument under that argument", () => {
    assert.equal(
      snapshotPath("/api/change?id=add-guest-checkout"),
      "api/change/add-guest-checkout.json",
    );
    assert.equal(
      snapshotPath("/api/validate?id=add-guest-checkout"),
      "api/validate/add-guest-checkout.json",
    );
  });

  it("keeps the slashes a capability or a document path carries", () => {
    assert.equal(
      snapshotPath("/api/spec?id=storefront%2Fcheckout"),
      "api/spec/storefront/checkout.json",
    );
    assert.equal(
      snapshotPath("/api/doc?path=docs%2Fprds%2Fcart.md"),
      "api/doc/docs/prds/cart.md.json",
    );
  });

  it("encodes what a URL would not carry as a segment", () => {
    assert.equal(
      snapshotPath("/api/doc?path=docs%2Fa%20note.md"),
      "api/doc/docs/a%20note.md.json",
    );
  });

  it("is relative, so the page resolves it against wherever it is mounted", () => {
    assert.ok(!snapshotPath("/api/board").startsWith("/"));
    assert.ok(!corpusPath(false).startsWith("/"));
  });

  it("has no file for a search, which is answered from the corpus", () => {
    assert.throws(() => snapshotPath("/api/search?q=cart"), /no snapshot/);
  });

  it("refuses an argument it was not given", () => {
    assert.throws(() => snapshotPath("/api/change"), /missing \?id/);
  });
});

describe("stamp", () => {
  it("puts the snapshot tag in the page's head and changes nothing else", () => {
    const html =
      "<!doctype html>\n<html>\n  <head>\n    <title>x</title>\n  </head>\n</html>\n";
    const out = stamp(html, "2026-01-02T03:04:05.000Z");

    assert.match(
      out,
      new RegExp(
        `<head>\\s*<meta name="${SNAPSHOT_META}" content="2026-01-02T03:04:05.000Z" />`,
      ),
    );
    assert.equal(out.replace(/<meta[^>]*>\n\s*/, ""), html);
  });
});

describe("storeDocuments", () => {
  const root = mkdtempSync(join(tmpdir(), "openspec-viewer-snapshot-"));
  after(() => rmSync(root, { recursive: true, force: true }));

  it("lists every markdown file in a store with no history, skipping what no store publishes", () => {
    for (const path of [
      "README.md",
      "docs/prds/cart.md",
      "openspec/specs/cart/spec.md",
      "node_modules/x/README.md",
      ".git/description.md",
      "dist/index.md",
      "src/notes.txt",
    ]) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), "# x\n");
    }

    // The order is the writer's business, not the reader's: every file is written whatever
    // it is.
    assert.deepEqual(storeDocuments(root).sort(), [
      "README.md",
      "docs/prds/cart.md",
      "openspec/specs/cart/spec.md",
    ]);
  });
});

describe("searchDocuments", () => {
  // The browser runs this over the shipped corpus; the server runs it over the files it
  // read. One case here, so that a change to the shape of an answer breaks in the suite
  // rather than in a search box.
  it("answers in the shape the search view reads", () => {
    const answer = searchDocuments(
      [
        {
          path: "openspec/specs/cart/spec.md",
          text: "# Cart\nThe cart holds items.\n",
        },
        {
          path: "openspec/changes/guest-checkout/proposal.md",
          text: "No cart here.\n",
        },
      ],
      "cart",
    );

    assert.equal(answer.scanned, 2);
    assert.equal(answer.matched, 2);
    assert.equal(answer.results[0].path, "openspec/specs/cart/spec.md");
    assert.equal(answer.results[0].scope, "baseline");
    assert.equal(answer.results[0].defines, true);
    assert.equal(answer.results[1].scope, "development");
  });
});
