# Karachi geocoder disagreements — adjudication sheet

Regenerated against the current registry, after the owner-adjudication rounds
and the mis-levelled re-parenting.

| | points |
|---|---:|
| OSM name resolved to the SAME town as the truth label | **88** |
| resolved to a DIFFERENT town — the rows below | **57** |
| named nothing, or nothing the registry resolves | 321 |

**57 points across 17 pairs.** Ten pairs already carry an owner
ruling on containment; seven still need one.

## What is left to decide

Owner facts settled the **containment** question — whether the OSM answer sits
inside the Google answer. On ten pairs the answer is no.

That does not finish them. Two disjoint places cannot both describe one
coordinate, so exactly one source is wrong, and which one depends on where the
point actually is. That is the remaining call, and the coordinates are there for
it:

- **wrong** — the point really is in the truth town; OSM misnamed it.
- **truth-wrong** — the point is in the OSM town; Google's label was wrong.
- **inside** — containment after all; the geocoder was finer, not wrong.

`inside` and `truth-wrong` both count as the geocoder being correct. Only
`wrong` counts against it.

## Pairs with an owner ruling

| pts | truth (Google) | resolved (OSM) | owner ruling | verdict | sample coordinates |
| ---: | --- | --- | --- | --- | --- |
| 20 | Korangi | Korangi Industrial Area | **Not inside.** Both sit in Korangi *District*; Korangi itself is a specific neighbourhood. Siblings. | &nbsp; | `24.853099,67.10847` `24.846486,67.122712` `24.829973,67.090222` |
| 6 | Landhi | Korangi Industrial Area | **Not inside.** Siblings within Korangi District. | &nbsp; | `24.848686,67.174913` `24.846589,67.143107` `24.849292,67.176586` |
| 5 | Landhi | Korangi | **Not inside.** Both are separate towns of Korangi District. | &nbsp; | `24.840675,67.164065` `24.837567,67.161951` `24.828871,67.16431` |
| 3 | Shah Faisal Colony | Landhi | **Not inside.** Both are separate towns of Korangi District. | &nbsp; | `24.864455,67.171698` `24.865217,67.170802` `24.861562,67.17166` |
| 2 | PECHS | Karsaz | **Not inside.** Karsaz is a town in its own right, under Faisal Cantonment. | &nbsp; | `24.868768,67.099096` `24.869784,67.09873` |
| 1 | PECHS | Korangi Industrial Area | **Not inside.** Different district entirely. | &nbsp; | `24.851199,67.169049` |
| 1 | Liaquatabad | Golimar | **Not inside.** Golimar (aka Gulbahar) is in S.I.T.E. Town. | &nbsp; | `24.898174,67.040011` |
| 1 | Shah Faisal Colony | Tariq Bin Ziyad Colony | **Not inside.** Tariq Bin Ziyad Colony is in Model Colony. | &nbsp; | `24.89351,67.17649` |
| 1 | Orangi Town | Baloch Colony | **Not inside.** Baloch Colony is a Jamshed Town neighbourhood — the other side of the city. | &nbsp; | `24.945899,67.015636` |
| 1 | North Nazimabad | Orangi Town | **Not inside.** Orangi Town is a town of Orangi District. | &nbsp; | `24.947779,66.990046` |

## Pairs still needing a ruling

| pts | truth (Google) | resolved (OSM) | is it inside? | verdict | sample coordinates |
| ---: | --- | --- | --- | --- | --- |
| 7 | Gulshan-e-Iqbal | Essa Nagri | &nbsp; | &nbsp; | `24.90965,67.069315` `24.915214,67.079008` `24.897589,67.070445` |
| 3 | Shah Faisal Colony | Drigh Colony | &nbsp; | &nbsp; | `24.882788,67.127923` `24.882896,67.126491` `24.885014,67.12553` |
| 2 | Gulistan-e-Jauhar | Askari 4 | &nbsp; | &nbsp; | `24.901835,67.119837` `24.903006,67.117638` |
| 1 | Clifton | Bath Island | &nbsp; | &nbsp; | `24.833961,67.031928` |
| 1 | Gulshan-e-Iqbal | Dawood Cooperative Housing Society | &nbsp; | &nbsp; | `24.901095,67.082368` |
| 1 | Korangi | P&T Society | &nbsp; | &nbsp; | `24.827575,67.117606` |
| 1 | Gulistan-e-Jauhar | Pioneer Park City | &nbsp; | &nbsp; | `24.927427,67.15635` |

41 points ruled on containment, 16 still open.

### Why this matters

Apparent precision is **61%** (88 of 145).
The prefill gate is 85% with n≥20, judged **per town**. Korangi alone carries 20
of these 57 points, so how that one row lands decides whether Korangi can
ever prefill — and Korangi was the best-performing area in the original sweep at
53%.

Nothing is enabled from this sheet directly. It feeds the per-town precision
figures that `geocodePrefill` reads, and every one stays `false` until a town
clears the gate on adjudicated numbers.

