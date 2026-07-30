# Mint Rewards — Stakeholder Demo Feasibility Report

**Scope:** Read-only trace of how the consumer app sources CO2 saved, waste collected,
pickup history, and deals/discounts. Repos inspected: `Mint-Rewards-App` (Expo/React
Native) and `Mint-Rewards-Backend` (Next.js API + Mongoose).

**Note on the supplied background:** two of the assumed facts do not match the current
code and are corrected below (Q4) — flagged there with evidence, not asserted here.

---

## Q1 — CO2 Saved

**Display:** `app/(tabs)/home.tsx:161-162` — stat card labeled "CO₂ Saved", `{co2 || 0}%`.
The label appends `%`, but the underlying value is a kg-CO2 figure, not a percentage —
a pre-existing unit-label mismatch in the UI, independent of data availability.

**Classification: (b) COMPUTED CLIENT-SIDE.**

- `app/(tabs)/home.tsx:118,128,131`: `wasteToCo2()` is called on mount, result stored in
  local state `co2`.
- `store/store.ts:730-737`:
  ```ts
  wasteToCo2: async () => {
    const user = get().user;
    if (user?.totalWasteCollected) {
      const wasteKg = parseFloat(user.totalWasteCollected);
      return Math.round((wasteKg * 0.21 + Number.EPSILON) * 100) / 100;
    }
    return 0;
  },
  ```
  Input: `user.totalWasteCollected` (string). Formula: `parseFloat(value) * 0.21`, rounded
  to 2 decimals.

**Runtime behavior given production data:** `users.totalWasteCollected` is an empty
string `""` on all 5,980 users. `""` is falsy in JS, so `user?.totalWasteCollected`
short-circuits and the function returns `0` unconditionally. The screen renders `0%`
for every user today, with no crash and no blank state — it silently coerces to zero.

No API endpoint or hardcoded constant is involved anywhere in this path. No other
CO2/carbon/emissions element exists anywhere else in the app (`grep` across
`app/`, `components/`, `hooks/`, `utils/`, `constants/` returns only the one hit above).

---

## Q2 — Waste Collected

**Display:** `app/(tabs)/home.tsx:157-158` — stat card labeled "Recycled waste
collected", `{user?.totalWasteCollected || 0}kg`.

**Classification: (c) FETCHED** — read directly off the `user` object in the store
(populated at login/profile-fetch time from the backend), not computed or hardcoded.

**Does any code path WRITE to `users.totalWasteCollected`?** No. Full trace across both
repos:

| File | Line | What it does |
|---|---|---|
| `Mint-Rewards-App/app/login.tsx` | 88, 174 | Reads `userData.totalWasteCollected \|\| ''` into local state — a read, not a write |
| `Mint-Rewards-App/app/register.tsx` | 85, 172 | Same — read with empty-string fallback |
| `Mint-Rewards-App/store/store.ts` | 92, 369, 732-733 | Type declaration + read-only usage |
| `Mint-Rewards-Backend/lib/types.ts` | 233 | Type declaration only |
| `Mint-Rewards-Backend/lib/models.ts` | 341 | Schema field: `totalWasteCollected: stringDefaultEmpty` → `{ type: String, default: "" }` |

No route handler, script, or mutation anywhere sets this field to a non-empty value.
It is schema-default-only.

**Empty-string behavior:** `user?.totalWasteCollected || 0` — `""` is falsy, so the
expression evaluates to `0`, rendering `0kg`. It does not break, does not show blank,
does not crash — it coerces to zero, same mechanism as Q1.

**Is the string type deliberate or a schema mistake?** It reads as a schema mistake.
The field is defined as a bare `String` with no formatting/validation logic anywhere,
it is never assigned a value in any code path, and the app does purely numeric handling
of it (`parseFloat`, comparisons against 0) — there's no evidence anywhere of an
intended display format like `"12.4 kg"` that would justify storing it as a string. It
looks like a field that should have been `Number` and was never wired up to a writer.

---

## Q3 — Pickup History

**Mongoose schema** (`Mint-Rewards-Backend/lib/models.ts:291-321`):

```ts
const qrCodeWithWeightSchema = new Schema(
  {
    qrCode: stringDefaultEmpty,        // { type: String, default: "" }
    weight: { type: Number, default: 0 },
  },
  { _id: false },
);

const pickupHistorySchema = new Schema(
  {
    collectionId: { type: Schema.Types.ObjectId, ref: "Collection", required: true },
    collectionName: stringRequired,     // required, no default
    date: { type: Date, default: Date.now },
    captain: { type: Schema.Types.ObjectId, ref: "Captain", required: true },
    qrCodesWithWeights: { type: [qrCodeWithWeightSchema], default: [] },
    status: stringRequired,
    comment: stringDefaultEmpty,
  },
  { _id: false },
);
```

Field on `User`: `Mint-Rewards-Backend/lib/models.ts:343` —
`pickupHistory: { type: [pickupHistorySchema], default: [] }`.

**Does any code path PUSH to `pickupHistory`?** No. A repo-wide search for
`pickupHistory` in `Mint-Rewards-Backend` returns exactly two files:
`lib/models.ts` (schema definition) and `lib/types.ts` (TS interface). No route,
controller, or script in `app/api/**` references `pickupHistory` at all — there is no
write path, confirmed plainly.

**Does any UI READ it?** Only as pass-through data plumbing, never rendered:

- `app/login.tsx:92,178` and `app/register.tsx:89,176` — `pickupHistory:
  userData.pickupHistory || []`, stored into the Zustand store.
- `store/store.ts:96,373` — type declaration and store assignment.

No screen in `app/` renders `pickupHistory` contents. The only two plausible target
screens are:

- **`app/collections.tsx`** ("Upcoming Collections" / history destination linked from
  the profile menu) — this screen is a **static, unconditional empty state**. It reads
  `user` from the store (line 11) but never reads `pickupHistory`, `collections`, or
  any array — it always renders "No Collections Found" regardless of data
  (`app/collections.tsx:20-63`). This is not an empty-array-driven empty state; it's
  hardcoded.
- **`app/(tabs)/profile.tsx:134-172`** — "Activity Summary" section has three menu
  rows ("Waste Collected", "Pickups Completed", "Rewards Redeemed"), all navigating to
  `/collections` (line 140, 151, 162). None of the three rows displays a value — they
  are static labels with a chevron, not bound to any data.

**Does any pickupHistory field hold weight, material type, or location?**
`qrCodesWithWeights[].weight` (Number) holds a weight per QR code scanned during a
pickup. There is no material-type field. There is no location field on the
subdocument itself (location would have to come from the referenced `Collection`
document via `collectionId`, which is never populated/joined anywhere in the searched
code).

---

## Q4 — Deals Model

**Correction to supplied background:** the background states "`discounts` is the live
deal model; `deals` collection is empty" and "`campaigns.brandId` is a STRING hex id."
Neither matches the current code:

- The consumer-facing coupon endpoint queries **`CampaignModel` joined with
  `BrandModel`** — it does not query `DiscountModel` or `DealModel` at all.
- There is no `brandId` field on the Campaign schema. The actual field is
  `brand` (`Schema.Types.ObjectId, ref: "Brand", required: true`) plus a separate
  `brandRegistration` (`String, default: ""`) — and it's `brandRegistration` that the
  consumer route actually uses for the join, not `brand`.

**Which model do consumer-facing endpoints query?**

The app's only discount-fetching call is `GET /api/users/my-discounts` (called from
`Mint-Rewards-App/store/store.ts:1019`). Route file:
`Mint-Rewards-Backend/app/api/users/my-discounts/route.ts`.

```ts
import { BrandModel, CampaignModel } from "@/lib/models";
...
const [campaigns, brands] = await Promise.all([
  CampaignModel.find({ status: { $ne: "EXPIRED" } }).lean(),
  BrandModel.find().lean(),
]);
const brandByRegistration = new Map(
  brands.map((b) => [normalize(b.registrationNumber), b]),
);
const discounts = campaigns.map((campaign) => {
  const brand = brandByRegistration.get(normalize(campaign.brandRegistration));
  if (!brand) return null;
  ...
}).filter(Boolean);
```

It imports and queries **`CampaignModel` and `BrandModel`. Neither `DiscountModel`
nor `DealModel` is imported or referenced anywhere in this file, or in
`app/api/users/active-campaigns/route.ts`** (the app's other campaign-reading
endpoint, also Campaign+Brand only — `Mint-Rewards-Backend/app/api/users/active-campaigns/route.ts`).

**Is `DiscountModel` used anywhere?** It is defined
(`Mint-Rewards-Backend/lib/models.ts:446-449`, schema at line 218 with a real
`campaignId: { type: ObjectId, ref: "Campaign" }` field matching the background's
description) but `grep -rl "DiscountModel" app/` across the entire Next.js `app/`
directory returns **zero route files**. It is dead code as far as any HTTP-reachable
path is concerned.

**Is `DealModel` defined? Referenced?** Yes to both, but only on the brand-facing
side: `Mint-Rewards-Backend/app/api/brands/deals/route.ts`,
`app/api/brands/[id]/deals/route.ts`, `app/api/brands/[id]/deals/[dealId]/route.ts`,
and the `brandhub` equivalents. These are admin/BrandHub CRUD routes for brands
managing their own deal inventory — not consumer app endpoints. The consumer app never
calls a `/deals` route.

**How does the app associate a discount with a campaign, given
`discounts.campaignId` resolves for only ~3% of records?** This question doesn't apply
to the live code path — the consumer app doesn't read the `discounts` collection or
its `campaignId` field at all. It builds cards directly from `Campaign` documents,
never from `Discount` documents, so a `discounts.campaignId` join is never attempted
in this flow. What actually gates card visibility is the
`campaign.brandRegistration` ↔ `brand.registrationNumber` string match; a campaign
whose `brandRegistration` doesn't match any brand's `registrationNumber` is silently
dropped (`if (!brand) return null;`) before the response is ever sent. The mobile
screen (`app/discounts.tsx`) therefore never receives a card with a missing brand —
there is no error state to test because the server pre-filters it. If demo campaigns
need to appear, `brandRegistration` (not `brandId`/`brand`) is the field that must be
seeded to match an existing brand's `registrationNumber`.

---

## Q5 — Dashboard Assembly

The only screen a stakeholder demo would show live figures on is
**`app/(tabs)/home.tsx`** (home/dashboard). The linked "Activity Summary" destination
(`app/collections.tsx`, reached from `app/(tabs)/profile.tsx`) is a dead end — see Q3.
No chart/graph library is installed anywhere in the app (`package.json` has no
charting dependency; no `Chart`/`Victory`/`recharts` symbol appears in `app/` or
`components/`), so there is no chart to evaluate for date-bucketing or string-date
parsing — **no chart exists in this app at all.**

### Home screen (`app/(tabs)/home.tsx:151-164`) — three stat cards

| Displayed value | Source | Seedable by writing only `users.points` + `users.pickupHistory`? |
|---|---|---|
| "Mint Rewards" → `user?.points` (line 154) | `users.points` field, direct read | **Yes** — already populated, mean ~92, nothing to do |
| "Recycled waste collected" → `user?.totalWasteCollected \|\| 0` (line 158) | `users.totalWasteCollected` field, direct read | **No** — seeding `points`/`pickupHistory` doesn't touch this field; it stays `""` → renders `0kg` regardless |
| "CO₂ Saved" → `co2 \|\| 0` (line 162) | Client-computed from `users.totalWasteCollected * 0.21` | **No** — depends entirely on `totalWasteCollected`, same gap as above; seeding `pickupHistory` has zero effect since `wasteToCo2()` never reads it |

### Profile screen "Activity Summary" (`app/(tabs)/profile.tsx:134-172`)

| Displayed value | Source | Seedable? |
|---|---|---|
| "Waste Collected" row | Static label, no bound value, links to `/collections` | N/A — no figure rendered |
| "Pickups Completed" row | Static label, no bound value, links to `/collections` | N/A — no figure rendered |
| "Rewards Redeemed" row | Static label, no bound value, links to `/collections` | N/A — no figure rendered |
| Destination screen content | `app/collections.tsx` — hardcoded "No Collections Found" empty state, ignores `pickupHistory` entirely | **No** — seeding `pickupHistory` would have no visible effect; the screen doesn't read the field |

### Discounts screen (`app/discounts.tsx`, via "My Discounts")

| Displayed value | Source | Seedable? |
|---|---|---|
| Discount cards (brand name, %, expiry) | `GET /api/users/my-discounts` → `CampaignModel` + `BrandModel` join on `brandRegistration` ↔ `registrationNumber` (see Q4) | **Needs-code-adjacent seeding** — not a code change, but requires seeding `Campaign` + `Brand` docs with matching `brandRegistration`/`registrationNumber`, `status: "APPROVED"`, and valid dates; seeding `points`/`pickupHistory` has no effect here |

---

## Summary Table

| Displayed value | Source | Seedable? |
|---|---|---|
| Points (home) | `users.points` (direct field) | Yes |
| Waste collected (home) | `users.totalWasteCollected` (direct field, no writer exists) | Yes — write the field directly (string, e.g. `"42.5"`); no code change needed, just needs to be part of the seed script |
| CO2 Saved (home) | Client formula `parseFloat(totalWasteCollected) * 0.21` | Yes, indirectly — falls out automatically once `totalWasteCollected` is seeded non-empty; **do not seed `pickupHistory` expecting this to move, it won't** |
| Activity Summary rows (profile) | Static labels, unbound | N/A — no value to seed; screen is a placeholder regardless of data |
| Collections/pickup history screen | Hardcoded empty state, ignores `pickupHistory` | Needs-code — seeding `pickupHistory` alone changes nothing visible; the screen has no data-driven rendering to seed into |
| Discount/deal cards | `Campaign` + `Brand` join on `brandRegistration` | Needs-seeding (not points/pickupHistory) — seed `Campaign`+`Brand` docs with matching registration fields |
| Any chart/graph | N/A | N/A — none exists in the app |

---

## Verdict: **PARTIAL**

All demo values *can* be produced without writing new application code, but **not**
by seeding only `users.points` and `users.pickupHistory` as the question's premise
assumes:

- `users.points` — already real, no action needed.
- `users.totalWasteCollected` — must be seeded directly (it is currently `""` for
  everyone and nothing derives it from `pickupHistory`). This is a **field-value
  seeding task**, not a code change — the display and formula already work correctly
  once the field is non-empty.
- CO2 Saved — follows automatically once `totalWasteCollected` is seeded; **no code
  change needed**, but note the pre-existing `%` label bug (cosmetic, pre-existing,
  not caused by seeding).
- Pickup history / "Activity Summary" screen — **seeding `pickupHistory` will not
  produce any visible change.** The only screen reachable from that section
  (`app/collections.tsx`) is a hardcoded empty state that doesn't read the array at
  all. Showing real pickup history data would require **UI work**: building an actual
  list view bound to `user.pickupHistory` (the field itself is already schema-correct
  and ready to read once such a screen exists).
- Discounts — seedable, but requires seeding `Campaign` + `Brand` documents with
  matching `brandRegistration`/`registrationNumber` (not `users.points`/`pickupHistory`,
  and not the `Discount`/`Deal` models the background assumed were live).

### Per-value code-change estimate (if going beyond field seeding)

| Value | Work required |
|---|---|
| Waste collected / CO2 | None — field seeding only |
| Pickup history list | New UI screen/component bound to `user.pickupHistory`, replacing the hardcoded empty state in `app/collections.tsx` (or a new screen) — small-to-medium UI task, no backend change needed since the field and schema already exist |
| Discounts | None — `Campaign`/`Brand` seeding only, using `brandRegistration` as the join key |
