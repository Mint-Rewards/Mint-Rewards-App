# Karachi geocoder disagreements — adjudication sheet

Regenerated 2026-08-25 against the **current** registry, after the
owner-adjudication rounds. The earlier figure of 97 disagreements is stale:
re-parenting Shanti Nagar and retiring Sikandarabad removed most of them.

| | points |
|---|---:|
| LocationIQ named a place AND it resolved to the same town as the truth label | **88** |
| resolved to a DIFFERENT town — **the rows below** | **66** |
| named nothing, or named something the registry cannot resolve | 312 |
| *(of those silent, resolvable via sub-area — see the last section)* | *33* |

**66 points, but only 20 decisions.** Every row is one
truth→resolved pair; judging the pair judges all its points.

## How to read a row

`truth` is what **Google** returned at that coordinate, treated as ground truth
by the original sweep. It was never validated — that is what calibration is for
— so a disagreement means *two sources disagree*, not *the geocoder is wrong*.

`resolved` is what **OSM/LocationIQ** returned, mapped onto a registry town.

Three verdicts:

- **inside** — resolved sits within truth. The geocoder was finer, not wrong.
  Counts as correct.
- **wrong** — resolved is somewhere else entirely. Counts as an error.
- **truth-wrong** — Google was wrong and OSM was right. Also counts as correct,
  and is worth knowing separately: it means the truth basis itself is unreliable
  in that area.

Coordinates are `lat,lng` — paste straight into any map.

## The rows

| pts | truth (Google) | resolved (OSM) | verdict | sample coordinates |
| ---: | --- | --- | --- | --- |
| 20 | Korangi | Korangi Industrial Area | &nbsp; | `24.853099,67.10847` `24.846486,67.122712` `24.829973,67.090222` |
| 7 | Gulshan-e-Iqbal | Essa Nagri | &nbsp; | `24.90965,67.069315` `24.915214,67.079008` `24.897589,67.070445` |
| 6 | DHA | Darussalam Society | &nbsp; | `24.799897,67.085986` `24.791858,67.094035` `24.800238,67.089361` |
| 6 | Landhi | Korangi Industrial Area | &nbsp; | `24.848686,67.174913` `24.846589,67.143107` `24.849292,67.176586` |
| 5 | Landhi | Korangi | &nbsp; | `24.840675,67.164065` `24.837567,67.161951` `24.828871,67.16431` |
| 3 | Shah Faisal Colony | Landhi | &nbsp; | `24.864455,67.171698` `24.865217,67.170802` `24.861562,67.17166` |
| 3 | Shah Faisal Colony | Drigh Colony | &nbsp; | `24.882788,67.127923` `24.882896,67.126491` `24.885014,67.12553` |
| 2 | Gulshan-e-Iqbal | Memon Nagar | &nbsp; | `24.947858,67.095396` `24.927553,67.108063` |
| 2 | PECHS | Karsaz | &nbsp; | `24.868768,67.099096` `24.869784,67.09873` |
| 2 | Gulistan-e-Jauhar | Askari 4 | &nbsp; | `24.901835,67.119837` `24.903006,67.117638` |
| 1 | Gulshan-e-Iqbal | Gulshan-e-Shamim | &nbsp; | `24.915715,67.062433` |
| 1 | Clifton | Bath Island | &nbsp; | `24.833961,67.031928` |
| 1 | PECHS | Korangi Industrial Area | &nbsp; | `24.851199,67.169049` |
| 1 | Gulshan-e-Iqbal | Dawood Cooperative Housing Society | &nbsp; | `24.901095,67.082368` |
| 1 | Liaquatabad | Golimar | &nbsp; | `24.898174,67.040011` |
| 1 | Korangi | P&T Society | &nbsp; | `24.827575,67.117606` |
| 1 | Shah Faisal Colony | Tariq Bin Ziyad Colony | &nbsp; | `24.89351,67.17649` |
| 1 | Orangi Town | Baloch Colony | &nbsp; | `24.945899,67.015636` |
| 1 | Gulistan-e-Jauhar | Pioneer Park City | &nbsp; | `24.927427,67.15635` |
| 1 | North Nazimabad | Orangi Town | &nbsp; | `24.947779,66.990046` |

### Running total

Currently **88 correct / 66 disagreeing** of 154 resolved points
— about 57% apparent precision. Every row marked
**inside** or **truth-wrong** moves a point from the second column to the first.

The prefill gate is precision ≥85% with n≥20, judged per town. If enough of
these are containment rather than error, individual towns clear it and
`geocodePrefill` can be turned on there — which is the whole reason this sheet
exists. Nothing is enabled until it is filled in.

---

## Separate finding: 33 silent points are resolvable today

`resolveGeocodedName` only matches **towns**. OSM frequently answers at
sub-area scale, and when it does the answer is discarded even though the
registry contains that exact string one level down.

| pts | truth | OSM said | is a sub-area of |
| ---: | --- | --- | --- |
| 15 | DHA | Zamzama | Clifton |
| 14 | Gulshan-e-Iqbal | Shanti Nagar | Gulshan-e-Iqbal |
| 2 | North Nazimabad | Block I | North Nazimabad |
| 1 | Landhi | Awami Colony | Landhi |
| 1 | Saddar | Bohri Bazaar | Saddar |

**18 of these 33 would become agreements** — Shanti Nagar (14), Block I (2),
Awami Colony (1), Bohri Bazaar (1) each resolve to exactly the town the truth
label names. That lifts recall from 88 to 106 of 466, roughly 19% → 23%, with no
new registry entries.

The other 15 are Zamzama, a Clifton sub-area at a coordinate Google labelled
DHA. Those become disagreements needing the same adjudication as the rows above
— Zamzama straddles the Clifton/DHA boundary, so it is a genuine edge case
rather than an error either way.

**Proposed, not implemented:** extend the resolver to fall back to sub-area
matching when a town match fails, resolving to the sub-area's parent town, and
only when the sub-area name is unique across the city. Worth doing only after
the rows above are adjudicated — if the pairs turn out mostly **wrong**, more
resolution is not the improvement it looks like.
