# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into the Mint Rewards Expo app. The SDK was installed, a singleton config file was created at `utils/posthog.ts` using `expo-constants` to read keys from `app.config.js` extras, and `PostHogProvider` was wired into the root layout with manual screen tracking for Expo Router. Users are identified on every login method (email, Google, Apple), and `posthog.reset()` is called on sign-out to clear the anonymous session. Fifteen events cover every major business flow: auth, coupon redemption, referrals, profile updates, and account deletion.

## Events instrumented

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User creates an account with email and password | `app/register.tsx` |
| `user_signed_up_google` | User creates or accesses an account via Google Sign-In | `app/register.tsx` |
| `user_signed_up_apple` | User creates or accesses an account via Apple Sign-In (iOS only) | `app/register.tsx` |
| `user_logged_in` | User signs in with email and password | `app/login.tsx` |
| `user_logged_in_google` | User signs in via Google Sign-In | `app/login.tsx` |
| `user_logged_in_apple` | User signs in via Apple Sign-In (iOS only) | `app/login.tsx` |
| `brand_tapped` | User taps a brand card on the home screen | `app/(tabs)/home.tsx` |
| `campaign_viewed` | User opens the detail modal for a specific campaign | `app/redeem.tsx` |
| `coupon_downloaded` | User successfully redeems a coupon and downloads the PDF | `hooks/useCouponDownload.ts` |
| `coupon_download_failed` | PDF generation failed after coupon was marked used on backend | `hooks/useCouponDownload.ts` |
| `discount_viewed` | User opens a discount coupon detail modal | `app/discounts.tsx` |
| `profile_updated` | User saves changes to their profile | `store/store.ts` |
| `referral_sent` | User sends referral invitations to friends | `app/(tabs)/share.tsx` |
| `forgot_password_requested` | User submits a password reset request | `store/store.ts` |
| `account_deleted` | User permanently deletes their account | `app/(tabs)/profile.tsx` |

## New files created

| File | Purpose |
|---|---|
| `utils/posthog.ts` | PostHog singleton — reads token/host from `expo-constants`, guards init behind config presence, enables dev error logging |

## Modified files

| File | Changes |
|---|---|
| `app.config.js` | Added `posthogProjectToken` and `posthogHost` to `extra` |
| `app/_layout.tsx` | Added `PostHogProvider` wrap, manual screen tracking with `posthog.screen()` |
| `app/login.tsx` | `identify` + `capture` on email/Google/Apple login, `captureException` on email error |
| `app/register.tsx` | `identify` + `capture` on email/Google/Apple signup |
| `store/store.ts` | `identify` on `signIn`, `reset` on `signOut`, `capture` on `profile_updated`, `referral_sent`, `forgot_password_requested` |
| `app/(tabs)/home.tsx` | `capture` on `brand_tapped` |
| `app/redeem.tsx` | `capture` on `campaign_viewed` |
| `app/discounts.tsx` | `capture` on `discount_viewed` |
| `hooks/useCouponDownload.ts` | `capture` on `coupon_downloaded` and `coupon_download_failed`, `captureException` on PDF failure |
| `app/(tabs)/profile.tsx` | `capture` on `account_deleted` |
| `app/(tabs)/share.tsx` | `capture` on `referral_sent` (UI layer, complements store-layer capture) |
| `.env` | Added `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` |

## Next steps

We've built a dashboard and five insights to track the key flows we instrumented:

- **Dashboard:** [Analytics basics (wizard)](https://us.posthog.com/project/532279/dashboard/1918555)
- **User registrations over time:** [https://us.posthog.com/project/532279/insights/5Sxymcj9](https://us.posthog.com/project/532279/insights/5Sxymcj9)
- **Login methods breakdown:** [https://us.posthog.com/project/532279/insights/X526i6As](https://us.posthog.com/project/532279/insights/X526i6As)
- **Coupon redemption funnel:** [https://us.posthog.com/project/532279/insights/40OGHJkI](https://us.posthog.com/project/532279/insights/40OGHJkI)
- **Coupon download failures:** [https://us.posthog.com/project/532279/insights/r929dBwX](https://us.posthog.com/project/532279/insights/r929dBwX)
- **Referrals sent:** [https://us.posthog.com/project/532279/insights/ptMWOHpY](https://us.posthog.com/project/532279/insights/ptMWOHpY)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` to `.env.example` and any EAS build profile environment variable docs so collaborators and CI pipelines know what to set.
- [ ] Confirm the returning-visitor path also calls `identify` — the `checkAuth` flow in `app/_layout.tsx` restores the session on app launch; after `getProfile()` resolves, call `posthog.identify(user._id, { ... })` so returning users are identified from the first screen view, not just after an interactive login.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
