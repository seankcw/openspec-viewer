import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";
import { href, useSearch } from "../api.js";
import { docHref } from "../links.js";

/**
 * What each scope is called, in the words the nav already uses for the same three places.
 * A result is a thing to click, so it is filed under the row the reader would have clicked
 * to reach it — not under a vocabulary this page invents for itself.
 */
const SCOPES = {
  baseline: { label: "Production", variant: "neutral" },
  development: { label: "In development", variant: "info" },
  archive: { label: "Shipped", variant: "neutral" },
};

/**
 * Where a result goes.
 *
 * A shipped spec has a page of its own and so does a change, and both render the document
 * the way the store means it to be read — with its lens, its outline and its scenarios
 * addressable. Everything else is served by the document route, which is what that route is
 * for: a file in the store with no page dedicated to it.
 */
function destination(result) {
  if (result.scope === "baseline") {
    return result.artifact === "spec" && result.capability
      ? href("spec", result.capability)
      : docHref(result.path);
  }
  return result.change ? href("change", result.change) : docHref(result.path);
}

/**
 * The same destination, with the scenario the reader asked for.
 *
 * `?at=` is read on the way into a spec: it opens the requirement holding that scenario
 * whatever the lens says and scrolls to it. It travels in the query rather than the
 * fragment because the fragment is already the route — the same reason the copy-link button
 * on a scenario builds it this way.
 */
const at = (to, id) => (id ? `?at=${encodeURIComponent(id)}${to}` : to);

/** The query, marked inside the line that matched, so a hit is found by eye and not read for. */
function Highlight({ text, query }) {
  const parts = [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  let from = 0;
  for (;;) {
    const found = haystack.indexOf(needle, from);
    if (found === -1) break;
    if (found > from) parts.push(text.slice(from, found));
    parts.push(
      <mark key={found}>{text.slice(found, found + needle.length)}</mark>,
    );
    from = found + needle.length;
  }
  parts.push(text.slice(from));
  return parts;
}

/**
 * One document that holds the query: what it is, and the lines themselves.
 *
 * The lines are the point. A list of filenames would be a worse `git grep` — the reason to
 * read this in the viewer rather than in a terminal is that the file is named as a
 * capability or a change and the line is one click from where it lives.
 */
function Result({ result, query, id }) {
  const scope = SCOPES[result.scope] ?? SCOPES.baseline;
  const to = destination(result);

  return (
    <Card padding={4}>
      <VStack gap={2}>
        <HStack gap={2} align="center" wrap="wrap">
          <Badge variant={scope.variant} label={scope.label} />
          <Link href={to} size="sm" weight="medium">
            {result.capability ?? result.change}
          </Link>
          <Text size="sm" color="secondary">
            {result.artifact}
          </Text>
          {/* The change a delta belongs to, when the row is already named after the
              capability it deltas — which of the two is the heading depends on the file,
              and a delta is both. */}
          {result.capability && result.change && (
            <Text size="sm" color="secondary">
              in {result.change}
            </Text>
          )}
          {id && result.defines && (
            <Badge variant="success" label="defined here" />
          )}
        </HStack>

        <VStack gap={1}>
          {result.hits.map((hit) => (
            <HStack key={hit.line} gap={2} align="start" className="hit">
              <Link
                href={at(to, id ? query : "")}
                size="sm"
                className="mono hit-line"
              >
                {hit.line}
              </Link>
              <Text
                size="sm"
                color={hit.heading ? "primary" : "secondary"}
                weight={hit.heading ? "medium" : undefined}
                className="hit-text"
              >
                <Highlight text={hit.text} query={query} />
              </Text>
            </HStack>
          ))}
          {result.total > result.hits.length && (
            <Text size="sm" color="secondary">
              and {result.total - result.hits.length} more in this document
            </Text>
          )}
        </VStack>

        <Text size="sm" color="secondary" className="mono">
          {result.path}
        </Text>
      </VStack>
    </Card>
  );
}

/**
 * Everything in the store that says what the reader typed.
 *
 * The archive is a switch rather than a filter over one answer: it is most of the store's
 * text and all of it frozen, so it is read only when someone asks for the record rather
 * than the plan. Off by default, and never remembered — which of the two you want belongs
 * to the question you are asking, and the next question is usually about the plan.
 */
export default function Search({ query }) {
  const [archive, setArchive] = useState(false);
  const q = query ?? "";

  const { data, error, loading } = useSearch(q, { archive });

  const head = (
    <VStack gap={2}>
      <Heading level={1}>{q ? `“${q}”` : "Search"}</Heading>
      <HStack gap={4} align="center" wrap="wrap">
        <Text size="sm" color="secondary">
          {data
            ? `${data.hits} line${data.hits === 1 ? "" : "s"} in ${data.matched} of ${data.scanned} documents`
            : "Reading the store"}
        </Text>
        <Switch
          label="Include shipped changes"
          value={archive}
          onChange={setArchive}
        />
      </HStack>
    </VStack>
  );

  if (!q) {
    return (
      <VStack gap={4} className="doc-page">
        <Heading level={1}>Search</Heading>
        <EmptyState
          title="Nothing asked yet"
          description="Type in the box at the top of the nav. Every markdown file under openspec/ is read — specs, proposals, designs, task lists and the documents filed beside them."
          isCompact
        />
      </VStack>
    );
  }

  return (
    <VStack gap={4} className="doc-page">
      {head}

      {loading && <Spinner label={`Searching for ${q}`} />}

      {error && (
        <EmptyState title="The search failed" description={error} isCompact />
      )}

      {data?.id && data.matched > 0 && (
        <Text size="sm" color="secondary">
          That is an id the store issues, so this is every place it lives: where
          it is defined, and everything citing it.
        </Text>
      )}

      {data && data.query.length < 2 && (
        <EmptyState
          title="Two characters or more"
          description="A shorter query matches most of the store, which is not an answer."
          isCompact
        />
      )}

      {data && data.query.length >= 2 && data.matched === 0 && (
        <EmptyState
          title="Nothing in the store says that"
          description={
            archive
              ? "Every document under openspec/ was read, the archive included."
              : "The archive was not read. Turn on shipped changes to search the record of what already shipped."
          }
          isCompact
        />
      )}

      {data?.results.map((result) => (
        <Result
          key={result.path}
          result={result}
          query={data.query}
          id={data.id}
        />
      ))}

      {data?.truncated && (
        <Text size="sm" color="secondary">
          Only the first {data.results.length} documents are shown. Narrow the
          query rather than scrolling — this one is in {data.matched} of them.
        </Text>
      )}
    </VStack>
  );
}
