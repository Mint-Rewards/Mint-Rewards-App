# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

## Orchestration workflow  
You (Fable) are the orchestrator. Plan, decompose, synthesize.  
Reasoning-heavy phases → deep-reasoner  
Mechanical work → fast-worker  
Codex (/codex:rescue --background) is a cracked engineer on par with deep-reasoner, from a different perspective. Treat as a peer, not a reviewer.  
High-stakes decisions: task Opus + Codex on the same problem in parallel, synthesize the best of both, without showing either the other's answer. Keep your own context lean.   
## Domain vocabulary

Canonical reference: `Mint-Rewards-Backend/docs/VOCABULARY.md`.

A **Campaign** is a recycling *programme* ("what programme is this"), a **Deal**
is the consumer *incentive* ("what do I get"), a **Discount** is one *type* of
Deal (a price reduction), and a **coupon/promo code** is only the redemption
*mechanism* — the code and the PDF voucher.

This app is **deals-only**. Its entire incentive surface is:

- `GET /api/users/deals`
- `POST /api/users/deals/:dealId/redeem`

`my-discounts`, `active-campaigns` and `/api/coupons/:id/redeem` are no longer
called from here — all three serve *campaign* documents. Brand lists on home and
`redeem.tsx` are derived from the deals payload via `groupDealsByBrand`
(`utils/deals.ts`), not fetched separately.

"Coupon" remains correct in `hooks/useCouponDownload.ts` and in the ticket
modal: there it names the code and the voucher, which is what a coupon is.
