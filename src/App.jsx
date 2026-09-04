import { AppShell } from "@astryxdesign/core/AppShell";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Switch } from "@astryxdesign/core/Switch";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Typeahead, TypeaheadItem } from "@astryxdesign/core/Typeahead";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { TreeList } from "@astryxdesign/core/TreeList";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { useMemo, useState } from "react";
import { href, POLL_MS, SNAPSHOT, useApi, useRoute } from "./api.js";
import {
  capabilityFlag,
  capabilityTreeByNamespace,
  changeTreeByNamespace,
  isCurrent,
  leafOf,
} from "./capabilities.js";
import { loadMode, MODES, saveMode } from "./mode.js";
import { displayName, loadPlainNames, savePlainNames } from "./names.js";
import { suggestions } from "./suggest.js";
import { changeState } from "./summary.js";
import { iso } from "./time.js";
import Board from "./views/Board.jsx";
import { Archive, SpecDetail, Specs } from "./views/Catalog.jsx";
import ChangeDetail from "./views/ChangeDetail.jsx";
import NamespaceDetail from "./views/NamespaceDetail.jsx";
import DocDetail from "./views/Doc.jsx";
import Search from "./views/Search.jsx";

/** Sync state of the store clone, which everything else on the page is read from. */
function StoreStatus({ store }) {
  const bits = [];
  if (store.branch) bits.push(`branch ${store.branch}`);
  if (store.dirty) bits.push(`${store.dirty} uncommitted file(s)`);
  if (store.upstream) {
    if (store.behind) bits.push(`${store.behind} behind ${store.upstream}`);
    if (store.ahead) bits.push(`${store.ahead} unpushed`);
    if (!store.behind && !store.ahead)
      bits.push(`up to date with ${store.upstream}`);
  } else if (store.git) {
    bits.push("no upstream configured");
  }

  return (
    <VStack gap={1}>
      <HStack gap={2} align="center" wrap="wrap">
        <Text weight="semibold">{store.id ?? "(local)"}</Text>
        {/* The path is where the clone was read from, which on a served page is a
            directory the reader can open. In a snapshot it is a directory on whatever
            machine wrote the files, which tells the reader nothing and looks like a leak. */}
        {!SNAPSHOT && (
          <Text size="sm" color="secondary" className="mono">
            {store.path}
          </Text>
        )}
      </HStack>
      <Text size="sm" color="secondary">
        {bits.join(" · ")}
      </Text>
    </VStack>
  );
}

/**
 * Warnings about the clone itself, not about the plans.
 *
 * They come first because everything below is read from this working copy: a board built
 * from a stale clone is confidently wrong, which is worse than a board that is missing.
 */
function StoreWarnings({ store }) {
  return (
    <VStack gap={2}>
      {!store.git && (
        <Banner
          status="warning"
          container="card"
          title="The store is not a git repository"
          description="Plans cannot be shared, and with no history there are no idle times."
        />
      )}
      {store.behind > 0 && (
        <Banner
          status="warning"
          container="card"
          title={`This clone is ${store.behind} commit(s) behind ${store.upstream}`}
          description={`Everything below may already be out of date. Run ${store.cli} sync.`}
        />
      )}
      {store.dirty > 0 && (
        <Banner
          status="info"
          container="card"
          title={`${store.dirty} uncommitted file(s) in the store`}
          description="Checkmarks nobody pushed are invisible to the team — the store is the only notification channel."
        />
      )}
    </VStack>
  );
}

/**
 * The namespace tree as TreeList data.
 *
 * Recursive because the tree is: `storefront/checkout` is two levels wherever the store
 * puts a third, and TreeList draws the guide lines and the indent from the nesting it is
 * handed. A namespace's own changes come before the namespaces inside it — they belong to
 * the row above them, and pushing them under an expanded subtree would separate them
 * from it.
 *
 * Expanded by default at every level: a nav that opens closed makes a reader click to
 * find out whether there was anything to click for. What they collapse stays collapsed —
 * TreeList keeps its own overrides over this data.
 */
function treeItem(node, view, arg, plain) {
  return {
    id: node.path,
    label: displayName(node.name, plain),
    isExpanded: true,
    // Every change beneath this namespace, not the rows immediately under it, so a
    // collapsed branch still says how much is in there.
    endContent: (
      <Text size="sm" color="secondary" hasTabularNumbers>
        {node.count}
      </Text>
    ),
    children: [
      ...node.items.map((change) => changeItem(node, change, view, arg, plain)),
      ...node.children.map((child) => treeItem(child, view, arg, plain)),
    ],
  };
}

/**
 * One change in the nav: where to find it, how far along it is, and the one thing about
 * it that might need a person — see `changeState`. The dot is the only thing in this
 * column that reports rather than links.
 *
 * The id carries the namespace because a change that deltas two of them is a row under
 * each, and TreeList tracks a row by its id.
 */
function changeItem(node, change, view, arg, plain) {
  const state = changeState(change);

  return {
    id: `${node.path}/${change.id}`,
    label: displayName(change.id, plain),
    href: href("change", change.id),
    isSelected: view === "change" && arg === change.id,
    endContent: (
      <HStack gap={2} align="center">
        <Text size="sm" color="secondary" hasTabularNumbers>
          {change.done}/{change.total}
        </Text>
        <StatusDot
          variant={state.variant}
          label={state.label}
          tooltip={state.label}
        />
      </HStack>
    ),
  };
}

/**
 * The capability tree, built the same way — but opening closed, and only as far as it has
 * to.
 *
 * A store has a few changes in development and every capability it has ever shipped, so the
 * two trees are different sizes by a factor of five or so: expanding this one on arrival
 * would bury the working set under the finished one. Closed, it is one row per product,
 * which is the map. Reading a spec opens the branch that holds it and nothing else.
 */
function specTreeItem(node, open, plain) {
  return {
    id: `spec:${node.path}`,
    label: displayName(node.name, plain),
    isExpanded: open === node.path || open.startsWith(`${node.path}/`),
    endContent: (
      <Text size="sm" color="secondary" hasTabularNumbers>
        {node.count}
      </Text>
    ),
    children: [
      ...node.items.map((cap) => specItem(cap, open, plain)),
      ...node.children.map((child) => specTreeItem(child, open, plain)),
    ],
  };
}

/** What each kind of suggestion is, said once under the name it completes. */
const SUGGESTION = {
  search: "search every document",
  capability: "capability",
  change: "change in development",
};

/**
 * The box at the top of the nav.
 *
 * A search is a route, so it is a page with an address: it survives a reload, it can be
 * linked, and Back leaves it. Nothing runs while you type — a query reads every markdown
 * file in the store, which is nothing for a question somebody asked and eight questions a
 * second for one they are still typing.
 *
 * The menu underneath is the other half. Two questions arrive at this box: "where does it
 * say webhook", which only the text can answer, and "take me to the checkout spec", which
 * is a name the reader half-remembers and a page the tree already holds. The completions
 * answer the second — the store's capabilities and its changes in development, both
 * already in the browser for the tree itself, so there is no request and nothing to keep in
 * sync. The search is always the first entry and the one Enter takes, so the box does what
 * it did before and the completions are what the arrows reach.
 */
function SearchBox({ specs, changes }) {
  const source = useMemo(() => {
    const lists = {
      capabilities: specs.map((cap) => cap.capability),
      changes: changes.map((change) => change.id),
    };
    return {
      search: (query) => suggestions(query, lists),
      // Nothing before a query. An empty box has nothing to complete, and offering the
      // first eight capabilities alphabetically would be a menu that answers no question.
      bootstrap: () => [],
    };
  }, [specs, changes]);

  return (
    <Typeahead
      label="Search the store"
      isLabelHidden
      size="sm"
      // Never holds a selection: picking a suggestion is a navigation, not a value, so
      // the box is empty again on the page it just opened.
      value={null}
      onChange={(item) => {
        if (!item) return;
        const { view, arg } = item.auxiliaryData;
        window.location.hash = href(view, arg);
      }}
      searchSource={source}
      // Local work over two lists already in memory, so there is nothing to debounce
      // and no round trip to wait out.
      debounceMs={0}
      maxMenuItems={9}
      renderItem={(item) => (
        <TypeaheadItem
          item={item}
          description={SUGGESTION[item.auxiliaryData.kind]}
        />
      )}
      startIcon={<Icon icon="search" size="sm" />}
      placeholder="Find a line in the store"
    />
  );
}

/**
 * One capability: its name without the namespace the rows above already say, and a dot
 * only when there is something to say about it.
 *
 * A shipped capability nobody is rewriting gets nothing, which is the point — three
 * quarters of this tree is that, and a dot on every row would make the ones that need an
 * answer disappear into it. Same vocabulary as the index page's flags.
 */
function specItem(cap, open, plain) {
  const flag = capabilityFlag(cap);

  return {
    id: `spec:${cap.capability}`,
    label: displayName(leafOf(cap.capability), plain),
    href: href("spec", cap.capability),
    isSelected: open === cap.capability,
    endContent: flag ? (
      <StatusDot
        variant={flag.variant}
        label={flag.label}
        tooltip={flag.label}
      />
    ) : undefined,
  };
}

function Nav({
  view,
  arg,
  changes,
  specs,
  mode,
  onMode,
  plainNames,
  onPlainNames,
}) {
  // Nothing to hang under Production until the catalogue arrives, and the row is a
  // disclosure and nothing else — with no tree under it there is nothing left to show.
  const hasSpecs = specs.some(isCurrent);

  return (
    <SideNav
      // Wide enough for the tree it holds: a change id under three levels of namespace
      // wrapped to three lines at the default 260, and a nav that wraps is a nav you read
      // rather than scan. Draggable from there because how much of it you want is a
      // property of your screen and what you are doing, and remembered per browser for
      // the same reason the appearance is.
      resizable={{
        defaultWidth: 340,
        minWidth: 240,
        maxWidth: 620,
        autoSaveId: "openspec-viewer.nav-width",
      }}
      footer={
        <VStack gap={1} padding={3}>
          <SegmentedControl
            value={mode}
            onChange={onMode}
            label="Appearance"
            size="sm"
            layout="fill"
          >
            {MODES.map((m) => (
              <SegmentedControlItem
                key={m.value}
                value={m.value}
                label={m.label}
              />
            ))}
          </SegmentedControl>
          {/* The ids are what you paste into the CLI, so they are one click away rather
              than gone: this reads the column as sentences, and turning it off puts the
              store's own spelling back. */}
          <Switch
            label="Names, not ids"
            value={plainNames}
            onChange={onPlainNames}
          />
        </VStack>
      }
      header={
        <VStack gap={2} padding={3}>
          <HStack gap={2} align="center" wrap="wrap">
            <Heading level={1}>Plan board</Heading>
            <Badge variant="neutral" label="read-only" />
          </HStack>
          {/* Above the tree, because it answers the question the tree cannot: the tree
              says what is in the store, and this says where it says something. */}
          <SearchBox specs={specs} changes={changes} />
        </VStack>
      }
    >
      <SideNavSection title="Overview" className="nav-section">
        <SideNavItem
          href={href("board")}
          label="Board"
          size="sm"
          isSelected={view === "board"}
        />
        {/* The index page is a page, so it is a row that goes to it and does nothing
            else. It reads the catalogue by namespace, which is what it is called. */}
        <SideNavItem
          href={href("specs")}
          label="Namespace"
          size="sm"
          isSelected={view === "specs"}
        />
        {/* The tree of what is in production, under a row of its own — the same shape as
            In Development below it, since they are the same kind of thing: a tree of the
            store's namespaces with no page of its own to link to. `isSelected` is never
            set here; when a spec is open the row for it inside the tree is the one to
            mark. */}
        {hasSpecs && (
          <SideNavItem
            label="Production"
            size="sm"
            collapsible={{ defaultIsCollapsed: false }}
          >
            <TreeList
              className="nav-tree"
              density="compact"
              items={capabilityTreeByNamespace(specs.filter(isCurrent)).map(
                (node) =>
                  specTreeItem(node, view === "spec" ? arg : "", plainNames),
              )}
            />
          </SideNavItem>
        )}
        {/* Changes in development, under a row of their own rather than a section heading —
            the same shape as Production above it. No link on this one either, because the
            page for what is in development is the board directly above it. */}
        <SideNavItem
          label="In Development"
          size="sm"
          collapsible={{ defaultIsCollapsed: false }}
        >
          <TreeList
            className="nav-tree"
            density="compact"
            items={changeTreeByNamespace(changes).map((node) =>
              treeItem(node, view, arg, plainNames),
            )}
          />
        </SideNavItem>
        <SideNavItem
          href={href("archive")}
          label="Shipped changes"
          size="sm"
          isSelected={view === "archive"}
        />
      </SideNavSection>
    </SideNav>
  );
}

export default function App() {
  const { view, arg, tab, position } = useRoute();
  const [mode, setMode] = useState(loadMode);
  const [plainNames, setPlainNames] = useState(loadPlainNames);
  // Polled only while the board is the view being read. The nav needs this data
  // everywhere, so it is still fetched on every view — but the store is read by shelling
  // out to git, and a poll landing every 5s behind a spec the reader just clicked makes
  // that spec wait for a board nobody is looking at. Coming back to the board reloads it.
  const { data, error, at } = useApi("/api/board", { poll: view === "board" });
  // The catalogue behind the nav's Production tree. Never polled: a capability arrives
  // when a change is archived, which is not something that happens while you are looking
  // at the page — and the index view asks for it again when it opens.
  const { data: catalog } = useApi("/api/specs", { poll: false });

  const chooseMode = (next) => {
    setMode(next);
    saveMode(next);
  };

  const choosePlainNames = (next) => {
    setPlainNames(next);
    savePlainNames(next);
  };

  // Everything renders inside <Theme>: it applies the root class the design tokens hang
  // off, so anything outside it — including this loading state — falls back to unstyled
  // browser defaults.
  if (!data) {
    return (
      <Theme theme={neutralTheme} mode={mode}>
        <VStack gap={3} padding={6}>
          {error ? (
            <Banner
              status="error"
              container="card"
              title="Cannot read the store"
              description={
                <VStack gap={2}>
                  <Text size="sm">{error}</Text>
                  <Text size="sm" color="secondary">
                    The store: id in openspec/config.yaml resolves through the
                    per-machine registry. If it is not registered here, run
                    openspec store register &lt;path&gt;.
                  </Text>
                </VStack>
              }
            />
          ) : (
            <Spinner label="Reading the store" />
          )}
        </VStack>
      </Theme>
    );
  }

  return (
    <Theme theme={neutralTheme} mode={mode}>
      <AppShell
        height="fill"
        contentPadding={5}
        sideNav={
          <Nav
            specs={catalog?.specs ?? []}
            view={view}
            arg={arg}
            changes={data.changes}
            mode={mode}
            onMode={chooseMode}
            plainNames={plainNames}
            onPlainNames={choosePlainNames}
          />
        }
        banner={
          error ? (
            <Banner
              status="warning"
              title="Refresh failed"
              description={`${error} — showing the board read at ${new Date(at).toLocaleTimeString()}.`}
            />
          ) : undefined
        }
      >
        <VStack gap={4}>
          {/* The clone's state, held to the column the pages below it are set at. These
              are two short sentences and a warning apiece; given the width of the window
              they were a title alone on a line two thousand pixels long. */}
          <VStack gap={4} className="store-head">
            <StoreStatus store={data.store} />

            <StoreWarnings store={data.store} />
          </VStack>

          {view === "board" && <Board board={data} plainNames={plainNames} />}
          {view === "change" && (
            <ChangeDetail id={arg} tab={tab} position={position} />
          )}
          {view === "namespace" && (
            <NamespaceDetail id={arg} plainNames={plainNames} />
          )}
          {view === "specs" && <Specs plainNames={plainNames} />}
          {view === "spec" && (
            <SpecDetail id={arg} tab={tab} position={position} />
          )}
          {view === "archive" && <Archive />}
          {view === "search" && <Search query={arg} />}
          {/* No nav entry: a store document is reached by following a link out of an
              artifact, never from a list. */}
          {view === "doc" && <DocDetail id={arg} />}

          <HStack gap={2} align="center" wrap="wrap">
            <Text size="sm" color="secondary">
              {SNAPSHOT ? "Snapshot of the store taken" : "Read from disk"}
            </Text>
            {/* On the served page, the client's fetch time rather than the server's read
              time: the two clocks differ by enough that generatedAt rendered as "in a
              few seconds". A snapshot has no client-side read worth dating — its files
              are as old as the moment the writer read the store, which is the one time
              the reader needs. */}
            <Timestamp
              value={SNAPSHOT ?? iso(at)}
              format="relative"
              size="sm"
              color="secondary"
              isLive
            />
            <Text size="sm" color="secondary">
              {SNAPSHOT
                ? "· nothing here updates until the next snapshot is published · claims and checkmarks are git commits, and this page only reads them."
                : `· polling every ${POLL_MS / 1000}s · claims and checkmarks are git commits, and this page only reads them.`}
            </Text>
          </HStack>
        </VStack>
      </AppShell>
    </Theme>
  );
}
