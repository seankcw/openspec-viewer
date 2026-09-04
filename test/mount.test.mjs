/**
 * The page mounted under a path, without a store: what the handler decides before it
 * reads anything. Answering from the store is `answer()`, tested through the routes; this
 * pins the address rules, which are the part that fails silently — a page served from
 * `/viewer` asks for `/api/board.json`, gets somebody else's page back, and shows a
 * store with nothing in it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mounted } from "../server/mount.mjs";

/** A request and a response the handler can write to, and what it wrote. */
function exchange(url, originalUrl = `/viewer${url}`) {
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(chunk = "") {
      this.body += chunk;
    },
  };
  let passed = false;
  mounted()({ url, originalUrl }, res, () => {
    passed = true;
  });
  return { res, passed };
}

describe("mounted", () => {
  it("sends a page asked for without its slash to the address it can ask from", () => {
    const { res } = exchange("/", "/viewer");
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, "/viewer/");
  });

  it("keeps the query on the way", () => {
    const { res } = exchange("/?mode=dark", "/viewer?mode=dark");
    assert.equal(res.headers.location, "/viewer/?mode=dark");
  });

  it("answers a path no snapshot writes as JSON, not as the page", () => {
    const { res } = exchange("/api/nothing.json");
    assert.equal(res.statusCode, 404);
    assert.match(res.headers["content-type"], /json/);
    assert.deepEqual(JSON.parse(res.body), {
      error: "no snapshot file api/nothing.json",
    });
  });

  it("hands anything that is not the page, an answer or an asset to the next handler", () => {
    const { passed } = exchange("/no-such-asset.js");
    assert.equal(passed, true);
  });
});
