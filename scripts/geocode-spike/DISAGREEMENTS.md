# Karachi geocoder disagreements — adjudication sheet

> **Read this first: adjudicating these rows cannot change any prefill outcome.**
>
> The gate is per-area at n>=20. Per-area sample sizes were computed after the
> industrial-suppression rule, and **only one area clears it**:
>
> | area | prefill-eligible n | correct | wrong | precision |
> | --- | ---: | ---: | ---: | ---: |
> | **Korangi** | **55** | 54 | 1 | **98%** |
> | Landhi | 16 | 11 | 5 | 69% |
> | PECHS | 15 | 13 | 2 | 87% |
> | Shah Faisal Colony | 10 | 4 | 6 | 40% |
> | Gulshan-e-Iqbal | 8 | 0 | 8 | 0% |
> | Gulistan-e-Jauhar | 6 | 3 | 3 | 50% |
> | DHA | 3 | 3 | 0 | 100% |
> | Clifton | 1 | 0 | 1 | 0% |
>
> Korangi already clears 85% at 98%, and holds exactly **one** of the 27 open
> points — so its verdict cannot move it. Every other area is under-sampled and
> cannot be promoted however its points adjudicate.
>
> **The blocker is sample size, not labelling.** Promoting a second area needs a
> denser sweep in that area, not desk work on these rows. Adjudicate them to
> improve the gazetteer's training labels and to sanity-check the 77% figure —
> not to unlock prefill.

| | points |
|---|---:|
| OSM name resolved to the SAME town as the truth label | **88** |
| resolved to a DIFFERENT town | **54** |
| — of those, **disposed by rule**, no judgement needed | **27** |
| — of those, **still needing a ruling** | **27** |
| named nothing, or nothing the registry resolves | 324 |

## Half of it is already answered

**Never prefill a consumer user into a `residential: false` area.** Every
consumer user is a household by construction — B2B sites reach us through
BrandHub and MintTrace, not this app — so an industrial prefill is wrong for
whoever sees it regardless of how precisely the geocoder placed the coordinate.
The pin can sit on a factory while the person filling the form lives across the
road.

That is a structural fact, not a measurement, so it needs no adjudication and it
generalises: it covers Korangi Industrial Area, SITE, West Wharf, Port of
Karachi and everything else in that class, now and in future.

It removes **27 of the 54 points**, including the largest row.
Implemented as `shouldPrefillArea`, which ANDs the precision gate with
`residential`, so opening the precision gate on an industrial area still cannot
produce a prefill. Those areas stay selectable and stay resolvable — only the
pre-selection is suppressed.

### Disposed by the rule — no action

| pts | truth (Google) | resolved (OSM) |
| ---: | --- | --- |
| 20 | Korangi | Korangi Industrial Area |
| 6 | Landhi | Korangi Industrial Area |
| 1 | PECHS | Korangi Industrial Area |

## Still needing a ruling — 27 points, 11 pairs

`truth` is Google's label at that coordinate, never validated. A disagreement
means *two sources disagree*, not *the geocoder is wrong*.

- **inside** — the OSM answer sits within the Google answer. Finer, not wrong.
- **wrong** — the point really is in the truth town; OSM misnamed it.
- **truth-wrong** — the point is in the OSM town; Google's label was wrong.

`inside` and `truth-wrong` both count as the geocoder being correct.

Where an owner ruling on containment already exists it is shown. It narrows the
choice to `wrong` vs `truth-wrong` but does not settle it: two disjoint places
cannot both describe one coordinate, so exactly one source is wrong and only the
coordinate says which.

| pts | truth (Google) | resolved (OSM) | containment | verdict | sample coordinates |
| ---: | --- | --- | --- | --- | --- |
| 7 | Gulshan-e-Iqbal | Essa Nagri | &nbsp; | &nbsp; | `24.90965,67.069315` `24.915214,67.079008` `24.897589,67.070445` |
| 5 | Landhi | Korangi | **Not inside.** Separate towns of Korangi District. | &nbsp; | `24.840675,67.164065` `24.837567,67.161951` `24.828871,67.16431` |
| 3 | Shah Faisal Colony | Landhi | **Not inside.** Separate towns of Korangi District. | &nbsp; | `24.864455,67.171698` `24.865217,67.170802` `24.861562,67.17166` |
| 3 | Shah Faisal Colony | Drigh Colony | &nbsp; | &nbsp; | `24.882788,67.127923` `24.882896,67.126491` `24.885014,67.12553` |
| 2 | PECHS | Karsaz | **Not inside.** Karsaz is a town in its own right, under Faisal Cantonment. | &nbsp; | `24.868768,67.099096` `24.869784,67.09873` |
| 2 | Gulistan-e-Jauhar | Askari 4 | &nbsp; | &nbsp; | `24.901835,67.119837` `24.903006,67.117638` |
| 1 | Clifton | Bath Island | &nbsp; | &nbsp; | `24.833961,67.031928` |
| 1 | Gulshan-e-Iqbal | Dawood Cooperative Housing Society | &nbsp; | &nbsp; | `24.901095,67.082368` |
| 1 | Korangi | P&T Society | &nbsp; | &nbsp; | `24.827575,67.117606` |
| 1 | Gulistan-e-Jauhar | Pioneer Park City | &nbsp; | &nbsp; | `24.927427,67.15635` |
| 1 | North Nazimabad | Orangi Town | **Not inside.** Orangi Town is a town of Orangi District. | &nbsp; | `24.947779,66.990046` |

### Why it matters

Apparent precision is **62%** (88 of 142) counting
every disagreement, and **77%** once the industrial rows are
set aside — they can no longer produce a wrong prefill, so counting them against
prefill precision measures a failure that cannot occur.

The gate is 85% with n≥20, judged **per town**. That second figure is within
reach of it, which is why the remaining 27 points are worth an hour.

