---
target: the coupons on the home page
total_score: 12
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-03T21-25-13Z
slug: app-tabs-home-tsx
---
Method: dual-agent (A: a1a759b7d9d75b8d0 · B: a810d3119c37623cb)

# Critique — "Your Coupons" on the home screen

`app/(tabs)/home.tsx` · Mode: **Operate** · React Native (iOS + Android)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 1 | `isBrandLoading` is set in the store (`store.ts:931`) and never read. Loading = 124.8px of blank white. |
| 2 | Match System / Real World | 1 | "Your Coupons" — none of these are coupons, and none are yours. Tapping one can land on "Not Eligible Yet!" (`redeem.tsx:253`). |
| 3 | User Control and Freedom | 2 | Scroll-away works; but the profile prompt is undismissible and locked taps hard-navigate to `/editProfile` with no return path. |
| 4 | Consistency and Standards | 1 | Two coupon card languages in one product (home stack vs `discounts.tsx:85`). Within one file: `TouchableOpacity` at :288 vs bare `Text onPress` at :392. |
| 5 | Error Prevention | 1 | Nothing distinguishes a brand with 3 live offers from one that dead-ends. |
| 6 | Recognition Rather Than Recall | 2 | Logos do real work. But no used/new/expired state — you must remember which brands you've exhausted. |
| 7 | Flexibility and Efficiency | 1 | No search, sort, filter, or cap. Brand #14 is ~1,600px down a non-virtualized stack. |
| 8 | Aesthetic and Minimalist | 2 | Card itself is well-proportioned; the unlock message renders **N+1 times** on one screen. |
| 9 | Error Recovery | 0 | `getBrands` failure is caught by `if (Array.isArray(result))` (`home.tsx:226`) and **silently dropped**. No message, no retry, no refetch. |
| 10 | Help and Documentation | 1 | User is never told what unlocks a coupon or what it costs. |
| **Total** | | **12/40** | **Poor** |

Read that band correctly: the *visual craft* here is above average. The score is low because the section withholds nearly all task-relevant information and handles zero failure states.

## Design Specificity Verdict

**LLM assessment: generic — 2/10.** `BrandCard` (`home.tsx:69–145`) is the Apple-Wallet stack trope wearing recycling data. Lift it into a food-delivery or banking app and it ships unchanged.

The specific failure: **this is a brand directory entry mislabeled as a coupon.** It renders category + company name + logo — *who*, never *what*. No discount value, no expiry, no offer count, no point cost. All of it exists: `discountPercentage` and `endDate` are rendered as badges on `redeem.tsx:197`/`:234` and `discounts.tsx:80–104`. And `getBrands` (`store.ts:930`) hits `/api/users/active-campaigns` — **the same endpoint** `getBrandsWithCampaigns` uses — then throws `data.activeCampaigns` away. This is an authoring omission, not a data constraint.

The layout has pre-committed to having nothing to say: `OVERLAP` hides the bottom 44.8px of every card but the last, and content is vertically centered, so the hidden band carries nothing. You *cannot* add an offer line at the card's bottom without occluding it.

**Deterministic scan:** `detect.mjs` returned **0 findings, exit 0** on `home.tsx`, `navbar.tsx`, and `redeem.tsx`. The detector is DOM-oriented and has no purchase on React Native StyleSheet code — treat clean as "not measured," not "clean." No false positives to report.

Assessment B produced hard numbers instead:

- **Stack geometry:** every non-last card shows **115.2px of its 160px** (28% occluded). `cardsContainerHeight`'s trailing `+ 80` is exactly 80px of dead space below the last card, and 124.8px of void when the list is empty.
- **Contrast (`brandSurface` working as designed):** `couponName` 8.16:1 dark / 16.32:1 white. `couponCategory` 5.63:1 dark / 6.46:1 white. **All pass AA.**
- **Contrast (locked state, three-step composite):** white lock text = **4.96:1** on a dark brand (thin pass), **2.53:1** on a light brand, **2.44:1** on a pure-white brand. Fails AA *and* the 3:1 large-text floor for exactly the brands commit `df6f66d` was written to support.
- **Accessibility props in the entire file:** one. `accessibilityRole` at `:319`, on the collections card — outside this section.
- **Touch targets:** "View all discounts" ≈17px tall, no `hitSlop`, no role. Instagram link ≈28px with hitSlop. Both under 44pt, which `PRODUCT.md:26` sets explicitly.

**Where A and B agree:** locked state fails contrast on light brands, accessibility props absent, no loading/error/empty branch. **Where they diverge:** A estimated the locked overlay at 1.35–2.5:1 across the board; B's step-by-step composite puts the dark-brand case at 4.96:1 — a pass with 0.46 of margin. B's math is the one to trust. The structural point survives either way: `opacity: 0.45` sits on the parent `couponCard` (`:112`), which *contains* `lockedOverlay` (`:135`).

**Visual overlays:** skipped — React Native target, no viewable DOM. No user-visible overlay exists.

## Overall Impression

Handsome, competently engineered, and about a different product. `brandSurface` is genuinely good defensive work; the stagger animation is tuned right; the card proportions are clean. And the section spends 160px of full-bleed saturated color, `elevation: 10`, and a spring animation to deliver a logo and a name — content a 56px list row handles for a third of the cost.

**Single biggest opportunity:** swap `getBrands()` → `getBrandsWithCampaigns()`. Same endpoint, same request, strictly more data, zero added cost.

## What's Working

1. **`brandSurface` is real engineering** (`utils/brandTheme.ts`). Proper WCAG relative-luminance math, a documented rationale for defaulting to white and flipping below 3:1, a normalized background so a malformed `#00000` can't render transparent, and a `hairline` so near-white brands keep an edge. It moves an unbounded, untrusted third-party input into a bounded token set. B's numbers confirm it: every non-locked text/surface pair passes AA.
2. **The `StatValue` baseline treatment** (`home.tsx:152–170`). Number and unit share a baseline, the number takes `flexShrink` + `adjustsFontSizeToFit` + `minimumFontScale={0.6}`. Solves a real 320pt-device failure structurally, with a comment that explains the constraint. Exactly the care `companyName` at `:122` did not get.
3. **The staggered spring entry** (`:74–86`). 70ms per index, `withSpring(damping:14, stiffness:100)`, press feedback correctly suppressed on locked cards. Makes the stack read as a deck being dealt.

## Priority Issues

### [P0] The coupon card contains no offer
`home.tsx:115–133` (content) · `:225` + `store.ts:930` (data choice)

**Why it matters:** The product's core value surface communicates only brand identity. Users can't rank, prioritize, or judge urgency; every evaluation costs a navigation; the section promises a reward `redeem.tsx:253` may refuse. Root cause of the working-memory and minimal-choices failures.

**Fix:** Switch to `getBrandsWithCampaigns()` (`store.ts:972`). Restructure to three lines: eyebrow `category` → headline `companyName` → **offer line `Up to 30% off · 2 offers` / `Ends in 4 days`**, derived as `redeem.tsx:174` and `discounts.tsx:80` already do. Hide brands with an empty `campaigns` array, or label them "No live offers."
**Suggested command:** `/impeccable shape`

### [P0] Locked overlay is unreadable on light-themed brands
`home.tsx:112` + `:135–140` · `styles:587–604`

**Why it matters:** 2.44–2.53:1 on the only text explaining why the section is unusable — for precisely the white/light brands the last commit was written to support. Emotionally backwards: dims the *reward* instead of gating the *action*.

**Fix:** Never put opacity on a parent containing the overlay. Dim `couponTextBlock` and `couponLogoWrapper` only, keep `couponCard` at full opacity, raise the scrim to `rgba(0,0,0,0.55)`, derive the lock color from `brandSurface`. Better: don't dim at all — full-saturation card with a small corner lock chip, and show the unlock message **once** (`:397`) instead of N+1 times.
**Suggested command:** `/impeccable harden`

### [P1] No loading, error, or empty state — failures are silent and unrecoverable
`home.tsx:223–228`, `:249`, `:411–436` · `store.ts:945–969`

**Why it matters:** Loading, request-failed, and genuinely-empty all render as the same 124.8px of white. No `.catch()`. Effect deps are stable Zustand refs, so it fires once per mount and never again: no retry, no focus refetch. Bonus bug: `store.ts:954/964` writes the brand error to `campaignError`.

**Fix:** Consume `isBrandLoading` / `brandError`. Loading → two skeleton cards in the stack geometry. Error → inline card with a **Retry**. Empty → borrow `discounts.tsx:185–191`. Fix the error-key mismatch. Refetch on focus.
**Suggested command:** `/impeccable harden`

### [P1] Brand names truncate to ~7–11 characters
`home.tsx:122` (`numberOfLines={1}` at 26px/700) · `styles:567`, `:585`

**Why it matters:** Text column ≈181px on an iPhone 15, **≈126px on an iPhone SE** — about 7 glyphs. The card's only identifying text, truncated for most real company names. Compounded by `:128`: no `defaultSource`, no `onError`, no placeholder, while `logo` is typed optional.

**Fix:** `numberOfLines={2}` + `adjustsFontSizeToFit` + `minimumFontScale={0.75}` — the pattern already proven at `:161–165`. Drop `couponLogoWrapper` 110 → 76px. Add the initial-letter fallback from `discounts.tsx:90–95`.
**Suggested command:** `/impeccable adapt`

### [P2] Accessibility: unlabeled cards, `Text` as button
`home.tsx:95–103`, `:128`, `:392–394`

**Why it matters:** The primary interactive element has no role, label, hint, or state. VoiceOver reads two orphan strings and an unlabeled image, then silently teleports to `/editProfile`. "View all discounts" is a 17px non-button while its own sibling 100 lines earlier is correct.

**Fix:** `accessibilityRole="button"`, `accessibilityLabel`, `accessibilityHint`, `accessibilityState={{disabled: locked}}`, `accessible={false}` on the logo. Convert "View all discounts" to a `TouchableOpacity` with role + `hitSlop`. Add `maxFontSizeMultiplier`.
**Suggested command:** `/impeccable audit`

### [P2] Unbounded, un-virtualized stack
`home.tsx:411`, `:412`, `:249`

**Why it matters:** At N=15, a 1,853px absolute-positioned container with 15 shadow layers and 15 reanimated shared values; the last card's entry begins 980ms after mount, off-screen. `React.memo` at `:69` defeated by the inline closure at `:418`. Android z-ordering relies on an undeclared tie.

**Fix:** Cap at 4 (`brands.slice(0, 4)`), let "View all discounts" be the overflow. Compute height from the capped length; move `+ 80` into section padding. Hoist `onPress` into `useCallback`. Cap the stagger at `Math.min(index, 4) * 70`.
**Suggested command:** `/impeccable distill`

## Cognitive Load: 5 of 8 failures — high (critical)

Failed: single focus, visual hierarchy (inverted — loudest elements carry least information), one-thing-at-a-time (same ask N+1 times), minimal choices (unbounded N, no default, backend ordering), working memory (every decision attribute one navigation away). Passed: chunking, grouping, progressive disclosure (weakly — stage one discloses nothing).

## Emotional Journey

Intended peak: the ticket modal at `redeem.tsx:292–297`. Actual new-user arc: "Your Coupons" (anticipation) → dimmed locked cards (rejection) → `/editProfile` (chore) → tap → brand hero (anticipation) → "Not Eligible Yet!". Two peaks punctured; the session *ends* on the refusal. Remembered as "the app that showed me rewards I can't have."

Reassurance absent. "Complete your profile to unlock coupons" states a cost with no benefit. "Add your city to unlock 6 coupons near you" costs one string.

## Persona Red Flags

**Jordan (first-timer)** — N dimmed rectangles read as broken, not locked. Complies without knowing if there are 2 coupons or 40. Told twice the thing labeled *his* isn't. A failed cold-launch fetch reads as "no partners." Highest-probability churn point.

**Sam (accessibility-dependent)** — Cannot read the locked message at 2.44:1 on a white brand. No role/label/state on `:95`; silent teleport to `/editProfile`. "View all discounts" at 17px is undiscoverable and unhittable. Larger Text clips 26px/700 in a fixed 160px card with `overflow: hidden`.

**Riley (stress tester)** — Airplane-mode cold launch → white gap, no retry; 15 brands → 1,850px of non-virtualized animation; long name on an SE → "Pakistan…"; null logo → 110×110 void; `#FFFFFF` theme → locked overlay disappears. Bonus: tapping at mount hits `redeem.tsx:47`'s early return → blank blue hero, no brand name.

## Minor Observations

- `BrandCardProps.status?: string` (`:63`) and the cast at `:415` are dead.
- Stack shadow cancels itself: `shadowOffset: {0, 6}` points down while `zIndex: index` paints lower cards later. For a downward deck the offset must be negative. Only the last card's shadow renders.
- `shadowOpacity: 0.18 / radius 14 / elevation 10` is ~3× heavier than every other card (0.05–0.08, elevation 1–4) — and mostly invisible.
- The 22px card radius matches nothing else (collections 12, discounts 12, modal sheet 28). No radius scale exists.
- Five hardcoded `#449EB2` literals (`:377`, `:403`, `:407`, `:556`, `:619`) duplicate `Constants.appThemeColor`, referenced correctly at `:358`, `:483`, `:525`.
- `useEffect` at `:74–78` has `[]` deps while reading `index` — brittle if the list reorders.
- `pressScale` springs back on `onPressOut` even when locked (`:100–102`).
- `isProfileComplete` inlined identically at `home.tsx:185` and `discounts.tsx:30`.
- `INSTAGRAM_HANDLE` (`:40`) still says `// replace with actual handle` while `:360` hardcodes it separately.
- `console.log` at `discounts.tsx:42`; `redeem.tsx:255` renders trailing `"from ."` when brand is null.

## Questions to Consider

1. If the card can't tell me what the offer is, why is it a 160px card and not a 56px row?
2. Name one thing in "Your Coupons" that is actually yours.
3. The overlap hides 44.8px of every card but the last. What would you put there if it weren't hidden?
