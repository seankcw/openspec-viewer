# @seankcw/openspec-viewer

A read-only dashboard over an [OpenSpec](https://github.com/Fission-AI/OpenSpec) store,
for the three people who read one for different reasons.

```bash
pnpm add -D @seankcw/openspec-viewer
pnpm exec openspec-viewer          # opens http://localhost:5175
```

**The directory you run it in is the whole configuration.** The store is resolved by the
`openspec` CLI, which must be on PATH — so run it in a repo whose `openspec/config.yaml`
declares `store: <id>` and you get that registered clone, or run it inside a store and
you get the store itself. The viewer never resolves a path of its own, which is what
stops it and the CLI disagreeing about what they are looking at.

| Variable              | Default    | For                                                                                                                                                                           |
| --------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENSPEC_VIEWER_CLI` | `openspec` | The command the board prints for claim, unclaim and sync. Set it to your wrapper — `OPENSPEC_VIEWER_CLI="pnpm plan"` — so the commands on the page can be pasted as they are. |
| `OPENSPEC_VIEWER_CWD` | cwd        | Where to resolve the store from, when the process cannot be started in the right directory.                                                                                   |

`--port <n>` moves it off 5175; `--no-open` leaves the browser alone.

## Design

Built with [Astryx](https://astryx.atmeta.com/) (`@astryxdesign/core` + the neutral
theme). The app supplies no visual design of its own — `src/app.css` is three imports,
a page background, and one monospace class. The published package has **no runtime
dependencies**: Astryx, React and Mermaid are bundled into `dist/` at pack time, and the
servers under `server/` are Node built-ins only, so installing this adds nothing to a
consumer's own tree.

**Diagrams.** A ` ```mermaid ` block in any artifact is drawn rather than printed —
design docs are where an OpenSpec store keeps its flowcharts and ER diagrams, and a store's
own rules ask for them by name. Mermaid is four times the size of the rest of the app put
together, so it is imported dynamically and splits itself further by diagram type: nothing
is fetched until a document with a diagram in it is opened, and then only the types that
document uses. The fence stays on screen until its picture is ready, and stays for good if
the diagram does not parse, with the error under it.

**Setup is two halves, and both are required.** The stylesheets define the design tokens;
`<Theme>` in `src/main.jsx` applies the root class that reads them. With the CSS alone
every component still resolves to the browser default and the whole page renders in
Times. `npx astryx init` was skipped deliberately — it writes AI-agent instructions into
`CLAUDE.md` / `AGENTS.md` at the project root, which is not what this package needed.

The theme package's README calls the wrapper `XDSTheme`; 0.1.9 exports it as `Theme`.

## Two readings of the board

The board opens **simplified**: every change in development on one line — its id, who
holds it, how far along it is, and when it last moved — grouped under the same namespaces
the nav and the capability index use, in two columns once the window is wide enough for
them. Most people who open this are asking how far along the plan is — a PM before a
standup, a lead between meetings — and the queues, the panels and a task group table per
change are the wrong answer to that question.

Above the bands: how many changes there are, how many are finished and waiting to be
archived, and four counts you can press to narrow the board to one of them. They are
queues rather than states, so a change that is finished *and* in a conflict is in both and
the counts do not sum to the total — that change is the one about to be archived into the
hazard, and burying it in whichever count was tested first is how it gets missed. The
conflict warnings stay in this reading for the same reason; nothing else does.

A change filed under two namespaces is listed under both, and each row says where else it
is filed, so the second sighting reads as one change seen twice rather than a duplicate.

The `Simplified` switch at the top of the board turns the rest back on, and the choice is
remembered per browser. `?board=full` and `?board=simple` do the same from a link, for the
visit only. Everything below describes the full reading.

## The strip

Six tiles across the top of the full board. Five are queues — **conflicts, idle claims, ready
to archive, built on a gap, unclaimed** — and the sixth is the store's sync state, which is
not a queue and so does not filter anything.

The design rule is that **every tile is zero when there is nothing to do.** Inventory
counts ("48 specs, 81 archived, 100% complete") describe a store at rest and read most
reassuring exactly when the tool has nothing useful to say. These read the other way.

Selecting a tile narrows the board to what it counts: group-level queues drop the
non-matching groups rather than only the non-matching changes, so clicking "2 idle claims"
gives two rows, not two tables you still have to read. `?filter=idle` does the same from a
link. The counts and the panels below come from one function, because a tile reading 2
over a list showing 3 is how a status strip stops being believed.

**Ready to archive** is the only tile that is new information rather than a re-ranking: a
change at 20/20 still in development. `plan done` says so when the last box is ticked, but only
to whoever ticked it, and archiving is PM's call alone.

**Built on a gap** is the second. A schema declares its artifacts in the order they are
written, each built on the one before, so an artifact missing at the *end* of that list is
the next one due and says nothing — which is why "changes missing an artifact" was a panel
listing twenty-five of twenty-nine changes in a store here, and no help. A gap is one
missing *underneath* a written one: passed over, with everything after it written anyway.
Even that is not a queue until somebody has checked a box over it, and then it is: thirteen
changes here, seven of them with every task done, which means seven changes about to fold a
capability into the baseline with no user journeys and no test cases, silently. The panel
puts those first, since archiving is the last moment the gap can be filled.

Unclaimed work is collapsed by default — it is the longest list and the least urgent,
and expanded it put six rows of shell commands between the reader and the board.

## What it shows

| View                | Answers                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Board**           | Every change in development and its overall progress; switched to full, its task groups, who owns each, and how long each claim has been idle                               |
| **Change**          | Every artifact it carries, rendered — one tab per file, in the order its schema declares them — plus the capabilities it deltas, artifact completeness, `validate --strict` |
| **Namespace**       | An index of every capability — shipped, unshipped or retired — grouped by namespace, marked where a change is rewriting it                                                  |
| **Capability**      | One spec in full, with its history and an outline rail                                                                                                                      |
| **Shipped changes** | The archive, and which capability each shipped change produced                                                                                                              |

### Tabs on a change

The tabs are that change's own files. Which files a change is supposed to have is decided
by the workflow schema it was created under — `spec-driven` writes proposal / specs /
design / tasks, `full-planning` adds a `ui.md`, and a store can fork its own. Two changes
in one store can sit on different schemas, so the tab set is read per change: the schema
gives the order, the directory gives which of them exist, and a file the schema never
declared (a `README.md` beside the proposal) is still shown, last. What is _missing_ is
the Artifacts card at the top of the page, not a tab onto a file nobody has written.

**The tab is in the address**, as a third route segment — `#/change/<id>/tasks`,
`#/spec/<capability>/test-cases`. Which document is open is the whole of what the page is
showing, so a URL that leaves it out is a link to a different page than the one the sender
was reading, and a reload put them back on the proposal. In the route rather than the
query because a query survives a navigation: the tab left on one change would decide which
tab the next change opened on, and the two need not carry the same artifacts. The router
already listens for the hash, so back and forward step through the documents a reader
opened. A route naming a tab the change has not got falls back to its first artifact, the
same way it always has.

**A position leaves with the page it named**, because it travels in the same string.
`?to=` and `?at=` describe somewhere inside one document, and they ride in the fragment
after the route — `#/change/<id>/specs?at=<scenario>`. Following a link in the nav writes
that fragment whole, so the position goes with the page it belonged to; there is no rule
enforcing it and nothing to sweep up afterwards. In the query, which is the half that does
not move when the fragment does, the position outlived its page: the address the reader
copied said they were somewhere they were not, and a reload sent the page hunting for an
anchor it had never heard of. What is left in the query is the reading — `?mode=dark`,
`?board=`, `?filter=` — which is about the visit rather than about a page, and is meant to
survive. A link written the old way still lands: the query is read once on the way in and
the address corrected, so what was pasted into a task last month still opens on the thing
it named.

Everyone sees the same board in the same order, and every panel is absent when it has
nothing to say — including artifact coverage, which lists only the changes missing
something.

### Appearance

Auto / Light / Dark sits at the foot of the sidebar and drives Astryx's `<Theme mode>`.
Auto follows the OS. It persists per browser, and `?mode=dark` overrides it for one visit
so a link can carry the view it was written for. The three values are Astryx's own `ThemeMode` union — `Theme` acts on `light` and
`dark` and treats anything else as "follow the system", so a typo would quietly behave
like Auto rather than fail, and a test pins them to the published type.

## The five things it infers

Everything else on the page is a file read. These five are derived, so all of them are
tested against fixtures rather than trusted.

**Idle claims.** The CLI can tell you @dana owns group 5; it cannot tell you the
claim landed nine days ago and nothing has been checked off since — the exact failure
claim-at-pickup exists to prevent, since a name on idle work reads as "covered". Every
claim and checkmark is a commit against one `tasks.md`, so each group's clock is the
later of _when the current owner's unbroken hold began_ and _the newest commit that
raised its checked count_, the latter searched only within that owner's stretch so
nobody inherits their predecessor's activity. Past 3 days it is worth asking about; past
7 it is called out with the `plan unclaim` command.

It reads the file's _state_ at each commit, not commit messages. Subjects like
`Claim add-guest-checkout group 3 for @dana` are parseable, but staleness derived from
them breaks the day someone rewords or amends a commit — and this store's fixtures were
authored in bulk commits no subject pattern matches.

When history cannot account for the current owner, the column shows `—`. An age inferred
from missing history would aim the nudge at the wrong person.

**Capability conflicts.** Two in-development changes deltaing the same capability are
never flagged by git — each change is its own folder, so both push cleanly. It breaks at
archive time, when the second is written against a baseline the first already rewrote,
and a `## MODIFIED` block whose headers no longer match silently drops the rest of the
requirement. Nothing else warns about this, so the board names the overlap early.

**Gaps in a plan.** A schema declares a change's artifacts in the order they are written,
each built on the one before, and the store's own config says so. Nothing checks it. An
artifact missing at the end of that list is simply the next one due — but one missing
underneath an artifact that *was* written was passed over, and everything after it was
written without it. That alone is still not work anybody has to do: it is closed by the
next artifact somebody writes. What makes it a queue is a checkmark on top of it, and the
worst case is a change with every box ticked, because archiving folds its deltas into the
baseline as they stand and takes the gap with them.

**A fold that will land wrong.** `openspec archive` replaces a baseline requirement with
the one under a change's `## MODIFIED Requirements`, pairing them by the requirement's own
heading. A heading that has drifted does not fail: the rewrite lands nowhere, the baseline
keeps what it had, and the change ships against a requirement nobody updated. The page used
to warn about this on every MODIFIED delta whether or not anything was wrong with it, which
is a warning nobody reads by the second one — it is now the answer to a check, and names
the requirement. The comparison flattens whitespace deliberately: what the CLI matches on
is its own business, and a banner raised over a double space would be exactly as ignorable
as the unconditional one it replaced.

**Ids that name nothing.** Every scenario and story carries a permanent id, and journeys,
tasks, test cases and review comments all cite one as a bare string — a join table written
in prose, with nothing checking either end. A citation resolves if anything in the store
defines it: a task legitimately names a scenario in a capability its own change does not
touch, and a delta's journeys legitimately name scenarios already in the baseline. Narrower
scopes were tried against a real store and each one reported citations as broken that were
simply defined elsewhere. Where an unresolved id is the tail of one that exists — a long
capability prefix written from memory and cut short — the page says which one was probably
meant. The other half is duplicates, counted within one document only, since one scenario
appears in the change that introduced it, the baseline it folded into, and every change
rewriting it.

**A cited id opens what it names.** A scenario id is written down once and cited from
everywhere else, and on the page those citations were bare monospace strings: a task row
carrying six of them said that six scenarios govern the work and nothing about which. Every
one the store defines is now a link, with the scenario itself — its title and its
GIVEN/WHEN/THEN, parsed by the same reader the spec page uses — under the pointer, and
`?at=` on the other end so following it opens the requirement holding that scenario and
scrolls to it. On a change, it opens the tab holding the delta rather than the change's
first artifact.

Which copy it opens is the part worth deciding carefully: the same id appears in the change
that introduced it, in the baseline it folded into, and in every change rewriting it. The
baseline wins, because that is what the store is held to today; a scenario that has not
shipped opens the change bringing it in, and the archive is last. Only the ids a page
actually cites travel to the browser — the store defines fourteen hundred of them, and a
change page needs the thirty-odd it is about to render. Nothing is underlined until the
pointer is on it, since six citations in link blue would make the cross-references the
loudest thing on a task row.

## Getting around

Two pieces of navigation, both borrowed from [spek](https://github.com/spekhq/spek):

**An "On this page" rail** beside every artifact — the proposal's _Why → What Changes →
Capabilities → Impact_, or a spec's requirements and scenarios. Astryx renders markdown
headings without ids and its `useOutlineFromDOM` only collects headings that have one, so
the heading renderer is overridden to attach an anchor derived from the heading's own
text. That makes the rendered DOM the single source of truth: the rail cannot list a
heading that is not on the page, and switching tabs re-reads it with no wiring. Anchors are
namespaced per document, because the specs view stacks several capabilities and every spec
has a "Purpose". The slug scheme is Astryx's own, and a test executes their function to
prove the two still agree.

**Every heading is an address.** The anchor the rail needs is one the reader cannot see, so
hovering a heading reveals a copy button beside it — the same one a scenario carries — and
it puts the whole URL on the clipboard: origin, the route the reader is on, and
`?to=<anchor>` after it. Query syntax inside the fragment, not the query itself: a URL has
one fragment and this app spends it on the route, so a position shares it rather than takes
it. Pasted back, `?to=` opens the document, picks the tab holding the heading and scrolls to
it. It is shown on hover and on focus only: fifty headings each flying a copy icon read as
a toolbar per line rather than as a document.

Arriving on a link that names a place marks it — `?to=` a heading, and with it everything
under that heading down to the next one of the same level or above; `?at=` the scenario it
names. The yellow is a search hit's, for the same reason: this is the thing you asked for.
Scrolling to a heading leaves it at the top of the window, which is exactly where it would
be if the reader had scrolled there themselves, so without the mark the page gives no sign
of having answered anything. It fades out on its own, because an arrival is not a notice to
be dismissed.

**An index, not a wall.** `#/specs` lists capabilities — name, size, when it last changed,
and whether a change is rewriting it — one line each. The text lives one click away at
`#/spec/<capability>`. Rendering all four specs end to end made the one you wanted the
hardest thing to find, and the page grew with the store; the list endpoint no longer ships
the bodies either.

**A namespace opens.** Every place a namespace is written — the bands on the board, the
bands in the index, the line above a change's id — goes to `#/namespace/<path>`, which
lists what is being built in it and what it already covers. It was the one piece of
structure the store names everywhere and nothing could open, and the two halves answer
different questions: the capabilities say what the area covers, and the changes say what
else is being built in it, which is the softer version of the warning the board only
raises once two changes write the same capability. A nested path is stepped through
segment by segment — `storefront → checkout` — and each segment is its own link, since a
product is a place in the tree exactly as much as an area inside it. The page holds
everything below the namespace, not only what is filed at it, and needs no endpoint: both
lists are filters over what the board and the index already return.

**A search box**, above the tree, because a tree answers "what is there" and not "where
does it say that". `#/search/<query>` reads every markdown file under `openspec/` — 35ms
for the three megabytes in a store this size, which is cheaper than the process a `git
grep` would spawn, and it sees a change nobody has committed yet. Matching is a
case-insensitive substring rather than a regex: the reader is retyping a phrase out of a
spec, and `specs/**` or `(BREAKING)` is a regex that either throws or quietly means
something else.

What makes it worth having over a grep is not the matching. Every path in the store says
what the file is, so a hit is filed under the same three places the nav uses — production,
in development, shipped — with the capability or the change named rather than the path,
and the line itself on the row. The archive is a switch and off by default: it is most of
the store's text and all of it frozen. A query that is nothing but an id the store issues
— `checkout-SC-07`, `checkout-US-01` — is a lookup rather than a search, showing the one
document that defines it beside everything citing it, and each result opens the scenario
itself through the `?at=` link a scenario's copy button already builds.

**The box completes names as you type them.** Two questions arrive at one box: "where does
it say webhook", which only the text can answer, and "take me to the checkout spec", which
is a name half-remembered and a page the tree holds. The menu answers the second — the
store's capabilities and its changes in development, ranked so the capability *named*
after the query comes before one that merely contains the letters, and a word of a kebab id
before letters buried mid-word. Both lists are already in the browser for the nav's own
tree, so completion costs no request, no index and nothing to keep in sync: what completes
is exactly what can be navigated to. The search itself is always the first entry and the
one Enter takes, so the box still does what it did before the menu existed.

**Grouped by namespace**, because the store already writes one into every capability path —
`shared-ui/cart`, `checkout/guest-checkout` — and a flat alphabetical run throws
it away. On a store of fifty-odd capabilities that is nine or ten groups instead of one
list nine screens long. Groups flow into columns as the window widens, using CSS
multi-column rather than a grid so the alphabetical order still reads down a column instead
of across a row. There is no grid/list toggle: the window already carries the signal one
would ask for, and a read-only viewer has nowhere to keep the answer.

**Changed by**, on each capability at `#/spec/<capability>` — which changes touched it,
newest first, in development or archived. In front of a spec the question is always "what put
this here, and what is about to change it"; both directions were in the tree already and
only the index was missing. It is deliberately not on the index, where it was the same
list repeated under every row.

That view also lists capabilities that have **not** shipped. `openspec/specs/` holds only
archived behavior, so a catalogue built from it alone silently omits everything in development —
which on a store early in its life is most of what anyone wants to read.

**Three states, not two.** A capability with a baseline is shipped. One without is normally
_unshipped_ — behavior a change is still bringing in — but one whose newest delta did
nothing except remove requirements is _retired_, behavior the store withdrew. They used to
read the same, so a withdrawn capability was filed as work arriving. Only a lone REMOVED
counts: a delta that also adds is a rewrite, and a capability re-added after a removal is
arriving again.

**Contested capabilities** are named on the index too. Two in-development changes deltaing one
capability is the conflict the board counts, and until now the one page that shows what is
changing each capability never said which one it would break.

## Reading a spec

Specs are the one artifact every role reads, and as plain markdown they are a wall of grey
with the load-bearing words indistinguishable from the sentences around them. So scenario
steps are pulled into an aligned keyword column and obligations are marked in prose:

```
Requirement: Cart holds line items
The cart SHALL hold one line item per distinct product.        ← warm

  WHEN   a shopper adds a product that is not in the cart      ← blue
  THEN   the cart contains one line for that product           ← green
   AND   the subtotal is recomputed                            ← muted
```

Colours come from the theme's own syntax tokens, not literal blue/green/grey. Those tokens
are declared with `light-dark()`, so both modes and any theme swap come for free.

Two things worth knowing about the implementation:

- **Astryx's Markdown cannot do this alone.** It lets you override the paragraph, heading,
  code and link renderers but not lists — and OpenSpec writes every step as a list item
  (`- **WHEN** …`), which is exactly where the keywords are. So `bdd.js` splits a spec into
  step runs and everything else; the steps are rendered here and the rest still goes
  through Markdown untouched. The tests' load-bearing case is the round trip — every line
  in, every line out — because a parser that quietly drops a paragraph makes the page say
  something false about the spec.
- **It is opt-in.** Proposals and design docs render as ordinary prose; colouring a stray
  "must" in a proposal would imply a normative weight the document does not carry.

## Hosting it as files

```bash
pnpm exec openspec-viewer snapshot out/viewer    # then serve out/ anywhere
```

The served page needs a Node process with the store on its disk, the `openspec` CLI on its
PATH and git behind it, which rules out every host that serves files and runs nothing —
and that is where a team's manual already lives. `snapshot` is the same page with every
answer written down first: it copies the built page into the directory, then asks its own
routes everything the page could ask — the board, the catalogue, the archive, every change,
every capability, every markdown file in the store, `validate --strict` per change in
development — and files each answer as JSON where the page will look for it.

**One page, two ways of asking.** The page decides which it is from a `<meta>` tag the
writer stamps into `index.html`, holding the moment the store was read. Nothing is rebuilt:
the snapshot is the same `dist/` the binary serves, so a published copy of this package can
write one without Vite. A snapshot page fetches `api/board.json` instead of `/api/board`,
relative rather than absolute, so the directory can sit under any path — `/viewer/` on a
manual site — without having been told about it. It never polls, since the files cannot
change under it, and the foot of the page says when the snapshot was taken rather than when
it was last read.

**Search runs in the browser.** It is the one route with no fixed answer, so the writer
ships the text instead — the plan in one file, the archive in a second fetched only when
the reader asks for shipped changes — and the page runs the same matching over it that the
server runs over the disk. The same function, in `src/search.js`, so the two cannot rank a
query differently.

**A missing file says so.** A static host answers a path it does not have with the page
itself, which is what lets a deep link into a single-page site load at all, and so a
document not in the snapshot arrives as HTML with a 200 on it. The page checks the content
type before parsing and reports `Not in this snapshot` rather than a parser's confusion.

**What it costs.** A snapshot of a store here is about a thousand files and fourteen
megabytes of JSON, most of it the archive and the documents, and forty seconds to write
with validation on. `--no-validate` drops the CLI runs, which are most of that time.

## Read-only, deliberately

No writes, and no write endpoint. Claims and checkmarks stay git commits made by the
CLI, because an unpushed claim is not a claim and `git log` on a change's `tasks.md` is
the build log. A dashboard that could edit the store would break both. It prints the
command to run instead — under whatever name `OPENSPEC_VIEWER_CLI` gives it — so the
action still lands as a commit someone can push.

## Borrowing the readings

Two things here are not file reads — how long a claim has sat without progress, and which
capabilities two in-development changes both delta — and a second tool over the same store
wants those answers rather than a second implementation of them to disagree with this one
at the edges. Same for splitting a spec into its own shapes, which is where a renderer
that is not this one would otherwise write its own parser.

So they are published, in two entries that follow the split the rest of the package does:

```js
// Node: reads disk and git. Also parseTasks, snapshots, deltasInDevelopment.
import {
  capabilityState,
  changeIds,
  conflicts,
  idleness,
} from "@seankcw/openspec-viewer/lib/store";

// Isomorphic: pure string work. Also scenarioName, scenarioAnchor, stepKind.
import {
  emphasize,
  parseSpec,
  scenarioIndex,
  splitSpec,
} from "@seankcw/openspec-viewer/lib/spec";
```

**The entries are the whole contract.** Everything under `server/` and `src/` is internal
and moves whenever the views need it to; these do not change shape without a major
version. Reaching past them into a file directly is pinning yourself to a layout nobody
promised to keep.

Two properties make them usable from a build rather than only from this server. Every
store-side function takes an **explicit store path** — nothing resolves a store of its own
— and none of them spawns the openspec CLI, so a consumer that already knows where its
store is needs no CLI on PATH. `lib/spec` touches neither disk nor `window`, so it runs in
a build script, a test, or a browser bundle.

Types ship beside each entry as hand-written `.d.mts`, because a build step to emit them
would put a compiler between a consumer and nine functions. `test/lib.test.mjs` imports
through the package's own name, calls every export, and asserts the shapes those files
describe — so a return value that drifts fails the suite rather than only misleading
whoever reads the declarations. It also checks that `files` ships everything the entries
re-export, which is the one failure that would otherwise appear after a publish and
nowhere before it.

What is deliberately **not** published: the views, `useApi`, the hash routes, and the
Mermaid renderer. They are Astryx components wired to this server's endpoints and its
router, so they are the parts a consuming app has to own.

## Layout

```
openspec-viewer/
├── bin/openspec-viewer.mjs  # the installed command: serves dist/ + the API over node:http
├── lib/                     # the published entries: the readings, and their types
│   ├── store.mjs            # idle claims, conflicts, capability state — Node only
│   └── spec.mjs             # parsing a spec's requirements, scenarios and steps
├── server/                  # all disk + git access. Node only, never bundled.
│   ├── store.mjs            # store resolution (cached), git helpers, sync status
│   ├── api.mjs              # the read-only JSON routes, shared by the binary and Vite
│   ├── board.mjs            # changes, task groups, idle inference
│   ├── change.mjs           # one change: artifact bodies, capabilities, completeness, validate
│   ├── artifacts.mjs        # which files a change has, ordered by its workflow schema
│   ├── catalog.mjs          # baseline specs, archive, capability conflicts
│   ├── search.mjs           # reading every document for a phrase, and filing the hits
│   ├── deltas.mjs           # whether a MODIFIED block still matches the baseline
│   ├── references.mjs       # the ids the store defines, cites, and resolves to
│   └── doc.mjs              # store markdown outside openspec/, and the path confinement
├── vite.config.js           # the React plugin, and the API mounted for dev + preview
├── src/
│   ├── App.jsx              # AppShell, nav, appearance, store warnings
│   ├── views/               # Board, ChangeDetail, Catalog (specs + archive), Search, Doc
│   ├── components/bits.jsx  # owner, idle, progress, artifact rendering
│   ├── toc.js               # anchors, and the address of a position inside a page
│   ├── spec.js              # reading requirements and scenarios out of a spec
│   ├── links.js             # resolving a document's relative links into routes
│   ├── suggest.js           # what the search box completes, and how it ranks it
│   ├── tabs.js              # which artifact a change page opens on
│   └── time.js              # idle thresholds and relative formatting
└── test/                    # the inferences, and the readings they are built on
```

`GET /api/board`, `/api/change?id=`, `/api/validate?id=`, `/api/specs`, `/api/archive`,
`/api/search?q=`, `/api/doc?path=`.

The store path is never hardcoded and never derived from this package's location:
`store.mjs` asks `openspec list --json` in the directory the viewer was started from. If
the id is not registered on your machine, or the CLI is not on PATH, the page says so and
passes the CLI's own message through.

## Notes

- **Spawning the openspec CLI costs ~2s**, which made the board slower than its own poll
  interval. The resolved store is cached for the life of the process — restart the dev
  server after `openspec store register`. Artifact completeness is still schema-driven
  from `openspec status --json`, cached against the change's file list so it re-runs only
  when files actually appear or disappear. `validate --strict` has its own endpoint so
  the artifacts never wait on it.
- **It does not fetch.** Polling every 5s while shelling out to the network would hammer
  the remote, so the page shows your clone as of the last fetch somebody did — and says
  loudly when that clone is behind or dirty.
- **It polls rather than watching.** The store changes when someone runs git, not while
  the page is open. Artifact bodies are fetched once per visit — re-rendering a proposal
  under the reader's cursor every 5s is worse than being 5s stale.
- **A document's links are rewritten as it renders.** The store's markdown is written to
  be read on disk, so a spec cites its PRD as `../../../docs/prds/x.md`. Left alone the
  browser resolves that against the page URL — always `/` under hash routing — and asks
  for a path no route owns. `src/links.js` resolves each link against the document it
  came from and points it at `#/doc/<path>`, which `/api/doc` serves. A link the viewer
  cannot serve renders as text carrying its resolved path, never as a click that 404s.
  The path is data from a document, so `storeRelative` confines it: inside the store,
  markdown, and not absolute — anything else is a 404 rather than a file.
- `pnpm build && pnpm preview` works: the API is mounted on the preview server too. It
  is still a local tool — the bundle needs a Node server with the store on disk, which is
  what `bin/openspec-viewer.mjs` is.

## Planning its own work

This repo is an OpenSpec store as well as the tool that reads one. `openspec/config.yaml`
carries the context and the per-artifact rules a change here is written against; the
proposals, specs, and task lists themselves live under `openspec/changes/` and
`openspec/specs/` once there are any, and `.claude/` holds the skills and `/opsx:`
commands `openspec init` installed.

Which means the viewer can be pointed at itself, and that is the loop to develop in:

```bash
pnpm dev          # started here, it resolves this repo as its store
```

`store.mjs` runs `openspec list --json` in the directory the viewer was started from, so
there is nothing to configure — the board you are looking at is this repo's own changes.
Run `pnpm dev` from another repo's directory, or set `OPENSPEC_VIEWER_CWD`, to read that
store instead.

## Tests

```bash
pnpm test
```

CI runs them on every push, and again before a tag publishes, so the inferences below are
checked by the pipeline rather than by whoever last opened the tool.

Staleness is tested by building real git histories in a temp repo with backdated commits;
conflicts by building stores that actually overlap, since the real store has none and
would return an empty list whether the check worked or not. The artifact test writes
schemas and change directories that disagree with each other, since a file the viewer
does not know about is not rendered wrong, it is simply absent, and nothing on the page
says half the change is missing.

## Releasing

Publishing happens in CI, not from a laptop: bump `version` in `package.json`, commit,
then push a matching `v<version>` tag. `.github/workflows/release.yml` runs the tests,
refuses a tag that disagrees with the manifest, builds `dist/` through `prepack`, and
publishes with the Actions token — so nobody needs `write:packages` on their own account.

Installing from GitHub Packages needs authentication even though the package is public.
A consumer repo wants an `.npmrc` with the scope and a token:

```
@seankcw:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```
