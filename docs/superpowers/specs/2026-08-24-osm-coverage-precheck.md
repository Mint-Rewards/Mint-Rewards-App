# OSM Coverage Pre-check (P0.1a lower bound)

Date: 2026-08-24
OSM snapshot: 2026-08-24T15:37Z (Overpass, 28,740 named places in Pakistan)
Method: every `place=city|town|suburb|neighbourhood|quarter|city_block|village`
with a name inside PK, matched against `utils/pakistan_areas.ts` using the app's
own `foldName`.

## What this is, and what it is not

This asks **"does OSM contain a place with this name at all?"** It is a cheap
**upper bound** on what reverse geocoding can achieve, obtained without an API
key, without extents, and without a Nominatim import.

It is **not** a geocoding accuracy figure, and must not be quoted as one:

- A name being present does not mean Nominatim returns it for a given
  coordinate. Ranking and fallback sit on top of the data.
- A name being present says nothing about whether it is returned for the
  *right* coordinate.

So it can lower the ceiling but cannot raise it. It does not replace the sweep,
and it cannot set `geocodeReliable`.

## Result

### Cities — 55/58 (95%)

Missing: Hunza, Ghanche, Ghizer (all Gilgit-Baltistan districts, likely mapped
under different names).

**This is the number that matters most for tier C.** The tier-C flow is
city + pin + house number, and the city step is a dropdown regardless — so 95%
presence means nothing in the national flow is blocked by OSM data. Whether the
geocoder *resolves* to the right city is still open, but the data is there.

### Areas — 45% exact, 64% with a small alias table

| City | exact | + alias | + prefix (upper bound) | areas |
|---|---|---|---|---|
| Hyderabad | 89% | 89% | 89% | 9 |
| Karachi | 79% | 79% | **93%** | 29 |
| Gujranwala | 71% | 71% | 71% | 7 |
| Rawalpindi | 67% | 67% | 80% | 15 |
| Faisalabad | 60% | 60% | 60% | 15 |
| Peshawar | 58% | 58% | 58% | 12 |
| Lahore | 56% | 63% | 67% | 27 |
| Multan | 54% | 54% | 54% | 13 |
| Quetta | 30% | 30% | 30% | 10 |
| Islamabad | **3%** | **63%** | 63% | 59 |
| **TOTAL** | **45%** | **64%** | **68%** | **196** |

- **exact** — the registry string, folded, matched as-is.
- **+ alias** — a handful of rewrite rules (drop a leading `Sector `, drop
  parentheticals, `DHA Lahore` → `DHA`).
- **+ prefix** — an OSM name begins with the registry name. Over-counts
  ("Garden" matches "Garden East"), so it is a ceiling, not an estimate.

### Sub-areas — 20% of distinct names, and that is an over-count

152 of 757 distinct block/phase/sector strings appear. Most are generic
("Block A", "Phase 2") and would match some unrelated place, so the real
figure is lower.

This corroborates a decision the plan already made on other grounds:
**sub-area is a user selection, with the geocoder as a hint only.** Nothing here
suggests block-level auto-fill is achievable.

## The finding that changes work

**Islamabad's 3% is a naming artifact, not a coverage gap.** The registry says
`"Sector E-7"`; OSM says `"E-7"`. Dropping one prefix moves Islamabad from
3% to 63% — the largest single lever discovered so far, affecting 59 areas.

The same pattern appears elsewhere:

| Registry | OSM |
|---|---|
| `Sector E-7`, `Sector G-9` | `E-7`, `G-9` |
| `DHA`, `DHA Lahore` | `Defence Housing Authority`, `DHA Phase I` |
| `Askari` | `Askari 1`, `Askari 4`, `Askari 5` |

This is exactly what `AREA_META.aliases` is for (P0.2a), and it says the alias
table is high-leverage work rather than housekeeping. **Note the direction of
the fix: aliases are added, registry strings are never edited** — renaming a
town invalidates every stored profile using it.

## Reading against the plan's branch gate

The plan's decision bands are: ≥70% auto-fill-primary; 40–70% auto-fill with
prominent always-visible overrides; <40% manual-primary.

At **64% nationally** the ceiling sits in the middle band — and it is a ceiling,
so the sweep can only come in at or below it. Per city, the picture is a split
rather than one answer, which is why `geocodeReliable` is per-area:

- **Karachi (tier A) is the strongest**, 79–93%. The city that matters most
  looks viable.
- **Quetta at 30%** is below the manual-primary floor even as a ceiling.
- **Islamabad is entirely gated on the alias work.**

## What this does not settle

Everything that decides the actual flow. Name presence is not resolution: the
sweep still has to establish, per area, whether a coordinate comes back with a
locality that resolves — and P0.1b whether it resolves to the *correct* area.

## Reproducing

```bash
# one Overpass query, ~5.7 MB
bash scripts/geocode-spike/osm-precheck/fetch.sh out/pk-places.json
node scripts/geocode-spike/osm-precheck/coverage.js out/pk-places.json
```
