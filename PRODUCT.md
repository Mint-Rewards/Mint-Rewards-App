# Product

## Register

product

## Users
Consumers who recycle waste and collect reward points through the Mint Rewards program, redeeming points for brand discounts/coupons. Mobile-first (Expo/React Native, iOS + Android), used in short sessions — checking points, scanning/redeeming discounts, signing in on the go.

## Product Purpose
Mint Rewards App is the consumer-facing client for a recycling rewards platform: users sign up, verify their account, collect points for recycling activity/collections, browse brand campaigns, and redeem points for discount coupons (PDF vouchers). Success is a fast, trustworthy auth/onboarding path and a frictionless redemption flow.

## Brand Personality
Clean, trustworthy, approachable — a teal (#449EB2) accent on white, rounded pill buttons, generous whitespace. Not playful/gamified, not corporate-cold; reads as a straightforward utility app people trust with an email and a password.

## Anti-references
Not a gamified rewards app (no confetti/badges/loud color). Not a dense fintech/dashboard aesthetic. Avoid generic SaaS-cream palettes, gradient text, glassmorphism, or card-grid clutter — the existing screens are intentionally spare (single-column forms, one accent color).

## Design Principles
- Match the existing screen grammar exactly: teal header with rounded bottom corners + white content sheet below.
- One primary action per screen, always with a clear loading/disabled state.
- Never leak security-sensitive distinctions (invalid email vs wrong code vs expired code) through copy, timing, or layout.
- Errors surface via native alerts today (no toast system) — new states should degrade gracefully within that constraint.

## Accessibility & Inclusion
Standard mobile accessibility: labeled form inputs, adequate touch targets (≥44pt), screen-reader announcements on error/success transitions. No stated WCAG level; treat AA as the working bar.
