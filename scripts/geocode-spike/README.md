# P0.1a — Geocoder coverage sweep

Throwaway harness. Answers one question, per area:

> Given a coordinate, does the geocoder return a locality that resolves to a
> canonical key in `utils/pakistan_areas.ts`?

That is **"is there a usable answer at all"**, not "is the answer correct".
Correctness is P0.1b and needs labelled points. This stage needs none, which is
why it runs first and may settle the branch on its own: if canonical resolution
is low everywhere, correctness is academic — the auto-fill path does not exist
regardless of how accurate the geocoder is.

## Prerequisites

A **local Nominatim**, via `nominatim/docker-compose.yml` in this directory:

```bash
docker compose -f scripts/geocode-spike/nominatim/docker-compose.yml up -d
docker compose -f scripts/geocode-spike/nominatim/docker-compose.yml logs -f
```

Then sweep against `http://localhost:8080`.

The sweep is a **batch job, not a service** — it runs once, produces a report,
and is thrown away. That is why this runs locally rather than on a persistent
host. P1.1's live reverse-geocode proxy is a separate hosting decision and
should not inherit anything from this container.

The import pulls the 148 MB Geofabrik Pakistan extract and takes roughly
20-60 minutes. It runs `NOMINATIM_REVERSE_ONLY=true` (the sweep only ever calls
`/reverse`, so the forward-search index is dead weight) with
`IMPORT_STYLE=address`, which keeps places, admin boundaries and address
objects while dropping POIs.

**The port opens before the data is ready.** A query answering with nothing
early in the import means the import is still running, not that coverage is
bad. Wait for the container to report the database as ready before drawing any
conclusion from a low hit rate.

The image tag is pinned to a dated build on purpose. Coverage numbers from two
different Nominatim versions are not the same measurement, so a re-import months
from now should use the same tag to stay comparable.

Tear down with `docker compose ... down -v` — `-v` also drops the database
volume, which is several GB.

Do **not** point the sweep at `nominatim.openstreetmap.org`: the public instance
caps at 1 req/sec and its usage policy prohibits bulk work. A full sweep is
thousands of requests.

## Running it

```bash
# 1. Draw extents on satellite imagery. Saves straight to extents.json.
node scripts/geocode-spike/draw-extents.js     # -> http://localhost:8081
#    (or hand-write extents.json from extents.example.json)

# 2. Generate sample points.
node scripts/geocode-spike/generate-points.js

# 3. Sweep. Resumable — safe to interrupt and rerun.
node scripts/geocode-spike/sweep.js --nominatim=http://HOST:8080

#    Optional capped Google baseline (the only metered spend in the plan):
#    GOOGLE_GEOCODING_API_KEY=... node scripts/geocode-spike/sweep.js \
#      --nominatim=http://HOST:8080 --google --google-cap=200

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
