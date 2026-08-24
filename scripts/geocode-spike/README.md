# P0.1a — Geocoder coverage sweep

Throwaway harness. Answers one question, per area:

> Given a coordinate, does the geocoder return a locality that resolves to a
> canonical key in `utils/pakistan_areas.ts`?

That is **"is there a usable answer at all"**, not "is the answer correct".
Correctness is P0.1b and needs labelled points. This stage needs none, which is
why it runs first and may settle the branch on its own: if canonical resolution
is low everywhere, correctness is academic — the auto-fill path does not exist
regardless of how accurate the geocoder is.

## Provider

Default is **LocationIQ** — hosted Nominatim, so the response shape and the
parsing are identical to a self-hosted instance. Free tier is ~2 req/s and
5,000/day.

The whole national sweep is about **3,544 points** (Karachi 696, Lahore 540,
Islamabad 1,180, the seven mid cities 648, the 48 city-only entries 480), so it
fits inside one free day and roughly 30 minutes of wall time. Karachi alone is
696.

```bash
export LOCATIONIQ_API_KEY=pk.xxxxx
```

Never put this in `.env`. That file sits beside `EXPO_PUBLIC_*` variables, and
anything with that prefix is inlined into the shipped app bundle — a geocoding
key there is scrapeable and billable by anyone with the app. The scripts refuse
to run if a key appears under an `EXPO_PUBLIC_`-prefixed name.

### Google baseline

`--baseline` runs a capped second provider over the same points (default 200) so
the report can say what Google buys over LocationIQ. It is a *comparison*, not a
candidate for the whole run.

**Google is awkward as the production provider**, and the constraints do not
show up during the spike:

- Its terms permit caching for performance only, with a 30-day limit — P1.1
  wants an indefinite cache.
- Building a persistent lookup from its output is against its terms, which is
  exactly what the P3.5 gazetteer is. Self-hosted Nominatim is ODbL, which
  permits that with attribution and share-alike.
- Its terms require results be used with a Google map. `MapPicker` sets no
  `provider`, and only an Android Maps key exists, so **iOS renders Apple Maps**.

So use the baseline to size the gap and make the call on evidence — not to
quietly become the provider.

### Self-hosted Nominatim

Still supported: `--provider=nominatim --base=http://localhost:8080`, with a
compose file in `nominatim/`. Read the disk warning in it first.

## Running it

```bash
# 1. Draw extents on satellite imagery. Saves straight to extents.json.
node scripts/geocode-spike/draw-extents.js     # -> http://localhost:8081

# 2. Generate sample points.
node scripts/geocode-spike/generate-points.js

# 3. Sweep. Resumable — safe to interrupt, and it resumes after a quota wall.
LOCATIONIQ_API_KEY=pk.xxx node scripts/geocode-spike/sweep.js

#    With the capped Google comparison:
LOCATIONIQ_API_KEY=pk.xxx GOOGLE_GEOCODING_API_KEY=... \
  node scripts/geocode-spike/sweep.js --baseline

# 4. Score it.
node scripts/geocode-spike/report.js
```

Outputs land in `out/` (gitignored): `report.md`, `unmatched.log`,
`centroids.json`.

## Drawing the boxes

`draw-extents.js` serves a local page on :8081: pick an area from the sidebar,
drag a rectangle over it, and it writes `extents.json` immediately. Progress is
shown as `n / 244 drawn`, boxes can be re-drawn or cleared, and reopening the
page restores what is already saved.

The basemap is **Esri satellite imagery, deliberately not OSM tiles** — see the
next section for why that distinction decides whether the spike means anything.
The optional labels overlay is also Esri, so using it for orientation is safe.

It runs as a small server rather than a `file://` page because a `file://` page
can neither write `extents.json` nor fetch its own sibling JSON.

## Two ways to get points

### A. Label-first (no extents, gives P0.1a *and* P0.1b)

Scatter random points over **one** bounding box, have Google name each, keep the
ones it can place. That yields **labelled** points — so it answers not just "did
anything resolvable come back" but "did it resolve to the **correct** area",
which is the number promotion actually needs.

```bash
GOOGLE_GEOCODING_API_KEY=... LOCATIONIQ_API_KEY=... \
  node scripts/geocode-spike/label-sweep.js \
    --bbox=24.77,66.95,25.05,67.35 --city=Karachi --count=2000 --cap=2000
node scripts/geocode-spike/label-report.js
```

Human effort is one box. Points in the sea, on industrial land or in empty
scrub cost one call and are dropped — if Google cannot name it, it was not a
useful sample. `--cap` is a hard ceiling so a typo in `--count` cannot become a
surprise bill.

**This measures agreement with Google, not truth.** Where both providers are
wrong the same way, it cannot see it. That is what calibration is for:

**`truth.json` is required before the agreement numbers mean anything.** Copy
`truth.example.json` and collect 20-30 genuinely known points — team members'
own rooftops, unambiguous landmarks, and some deliberately near area
boundaries. The report scores *both* providers against it, and if the labeller
itself is under 70% it says so and tells you not to read the agreement section
as coverage.

`truth.json` is **gitignored and must stay so** — home rooftop coordinates are
personal data and do not belong in a repository.

Google is doing measurement here, not production. None of the terms problems
that rule it out as the provider apply: nothing is cached, shipped, or built
into a lookup.

### B. Extents-first (draw the areas)

Trace each area, then sample inside it. More human effort and the points are
unlabelled, but it does not depend on a second provider being right, and it
gives you per-area extents you keep. Use it for areas you care about
specifically, or where the label-first sample came back thin.

The two compose: run A for breadth, draw B for the areas A could not cover.

## Shapes: freehand outlines and boxes

An area is a list of **shapes**. Each is either a traced polygon or a box, and
one area can mix them:

```json
"Karachi::Korangi": [
  { "polygon": [[24.800,67.120],[24.800,67.170],[24.820,67.170],[24.820,67.140]] },
  { "minLat": 24.860, "maxLat": 24.880, "minLng": 67.120, "maxLng": 67.150 }
]
```

**Freehand is the default**, because most of these places are not rectangles. A
loose box around Korangi or Orangi swallows part of the neighbouring area, and
every point landing in the spill is one the geocoder answers **correctly** while
the scorer counts it as a miss — pushing a good area below the promotion
threshold. Extent quality is the dominant error source in this whole exercise.

**Box mode is still there and still right for some areas.** Islamabad's sectors
and planned blocks genuinely are rectangles, and a box states that more honestly
than a hand-traced outline pretending to a precision it does not have.

A bare object is read as a single box, so older files keep working.

In the tool: pick an area, drag to trace (or drag a box in Box mode), and drag
again to add another shape. The sidebar shows a count, **Undo shape** removes
the last, **×** clears the area, **Fit** zooms to the union.

Three things happen automatically, and each matters:

- **Points are split by true area, not evenly.** Polygon area is computed by
  shoelace on a local projection, so a traced outline and an equivalent box
  agree. An equal split would give a small sliver the same weight as the main
  body, over-sampling one corner.
- **Points land inside the shape, not its bounding box.** The grid is
  over-provisioned by the bbox-fill ratio before rejection sampling, so an
  L-shaped or thin polygon still yields its full allocation — without that,
  rejection sampling would quietly under-deliver for exactly the awkward shapes
  polygons exist to describe.
- **Shared edges count as interior.** Boundary means "near the edge of the
  *area*", not "near the edge of a shape". Where two shapes abut, that seam is
  internal, and judging each alone would flood the boundary sample with points
  nowhere near the real edge. Since boundary-correct is one of the three
  promotion conditions, that distortion would feed straight into whether an area
  is trusted for auto-fill. The band scales with shape size rather than being an
  absolute distance, which would swallow a compact area whole while barely
  touching a large one.

Shapes under one hectare are rejected as misclicks, and a freehand trace needs
at least three points.

## Why extents are hand-drawn

The repo has no boundaries and no centroids, and the plan explicitly forbids
sampling from existing user coordinates: their provenance is unknown, so a
disagreement between a stored pin and a stored address tells you that *something*
disagrees, not which side is wrong. Scoring the geocoder against that data would
report a false negative and kill a path that may actually work.

So a human draws one bounding box per area off satellite imagery, tight to the
built-up extent, and the scripts do the rest. **Box quality is the main source of
error in this whole exercise**: a box that spills into the neighbouring area
produces points the geocoder answers correctly and the scorer counts as misses,
pushing a good area below the promotion threshold.

## Reading the report

`meets 1a floor` is only the **first of three** promotion conditions. An area may
be set `geocodeReliable: true` only when all three hold, with at least 20 samples:

| Condition | Threshold | Stage |
|---|---|---|
| Resolves to a canonical key | ≥70% | P0.1a |
| Labelled points resolve to the **correct** area | ≥70% | P0.1b |
| Boundary-sampled points resolve correctly | ≥50% | P0.1b |

The third matters: an area that only geocodes correctly at its centre is not
reliable, because real users live at its edges.

**The scripts never write `geocodeReliable`.** Promotion is a reviewed decision
that also depends on P0.1b, and a script that edits the registry would make an
unreviewed promotion a one-command mistake.

### Errors are not misses

A rate limit, a timeout or a 5xx is **not** the geocoder saying "nothing here".
The sweep records them in a separate field and the report scores against answers
actually received, so an area whose points all failed reads as *unmeasured*
(`resolves: —`, `no (answered 0<20)`) rather than as 0% coverage.

This matters because the alternative is a silent false negative: an outage or a
quota wall would look like poor coverage and could kill the auto-fill branch on
an infrastructure artifact. For the same reason a 429 stops the run rather than
being written as a data point, and 15 consecutive failures trip a circuit
breaker instead of grinding through the retry ladder for hours.

### Two numbers that are not what they look like

- **Boundary share is high by geometry.** The outer ring of a grid is most of
  the grid, so a large fraction of points are classified boundary. That makes
  the test conservative, which is the right bias — but it is not representative
  of where users live.
- **`maxSampleRadiusMeters` in `centroids.json` is not a containment threshold.**
  It is the spread of where someone drew a box, not the extent of the area.
  Using it for the P2.4 containment check would fire on correct pins and stay
  silent on wrong ones. Derive that threshold from the P0.1b boundary sample.

## The city-level number

The 48 registry cities with no town data are sampled at city level only, and
answer one question: does the geocoder return the right city? That figure
decides whether the tier-C flow (city + pin + house number) is viable
nationally. It matters more than any per-area result, because tier C has no
area step for an area-level answer to feed.

## Deliverable

Commit the per-area table, the Nominatim/Google comparison and the branch
decision to `docs/superpowers/specs/` before any P2 work starts.
