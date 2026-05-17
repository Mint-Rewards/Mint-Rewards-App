import { useState } from "react";
import { Alert } from "react-native";
import { useAppStore, DiscountItem } from "@/store/store";
import { API_BASE_URL } from "@/utils/constants";

// expo-print and expo-sharing are loaded lazily inside downloadCoupon so that
// importing this hook never crashes the screen in environments where the native
// modules aren't compiled in (e.g. Expo Go). The actual download will show a
// clear error if the dev build hasn't been made yet.

type RedeemResponse = {
  couponCode: string;
  referenceCode: string;
};

function buildCouponHtml(
  item: DiscountItem,
  code: string,
  referenceCode: string,
): string {
  const brandInitial = item.brand.companyName?.charAt(0).toUpperCase() ?? "?";
  const brandName = item.brand.companyName ?? "";

  const logoHtml = item.brand.logo
    ? `<img class="brand-logo" src="${item.brand.logo}" alt="${brandName}" />`
    : `<div class="brand-logo is-placeholder">${brandInitial}</div>`;

  const expiryFormatted = item.endDate
    ? new Date(item.endDate).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const discountNum = item.discountPercentage
    ? item.discountPercentage.toString().replace("%", "").trim()
    : "";
  const discountSub = discountNum
    ? "off your next order"
    : item.name || "Exclusive Member Offer";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Mint Rewards Coupon</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, system-ui, sans-serif;
    color: #002B33;
    background: #EEEEE6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .coupon {
    width: 210mm;
    height: 297mm;
    background: #FBF9F3;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    margin: 0 auto;
  }

  /* ── Hero ── */
  .hero {
    background: linear-gradient(160deg, #003E47 0%, #007373 100%);
    color: #fff;
    padding: 40px 56px 84px;
    position: relative;
    overflow: hidden;
  }
  .hero .rings {
    position: absolute;
    left: -220px;
    bottom: -300px;
    width: 640px;
    height: 640px;
    opacity: 0.15;
    pointer-events: none;
  }
  .head-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    margin-bottom: 32px;
  }
  .mint-wordmark {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 3px;
    color: rgba(255,255,255,0.9);
    text-transform: uppercase;
  }
  .reward-no {
    font-family: ui-monospace, 'Courier New', monospace;
    font-size: 12px;
    letter-spacing: 2.5px;
    color: #A8D8C9;
  }
  .offer-eyebrow {
    font-size: 12px;
    letter-spacing: 3.5px;
    color: #3CC0BF;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .offer-headline {
    font-size: 156px;
    font-weight: 800;
    line-height: 0.85;
    letter-spacing: -7px;
    margin: 0;
    display: flex;
    align-items: flex-start;
  }
  .offer-headline .pct {
    font-size: 70px;
    margin: 20px 0 0 6px;
  }
  .offer-sub {
    font-size: 28px;
    font-weight: 600;
    color: #A8D8C9;
    margin-top: 4px;
  }
  .offer-block { position: relative; }

  /* ── Floating brand seal ── */
  .seal-anchor { position: relative; height: 0; }
  .seal {
    position: absolute;
    left: 56px;
    right: 56px;
    top: -52px;
    background: #fff;
    border: 1px solid rgba(0,43,51,0.12);
    border-radius: 16px;
    padding: 18px 22px;
    display: flex;
    align-items: center;
    gap: 18px;
    box-shadow: 0 20px 50px -16px rgba(0,43,51,0.30);
    z-index: 2;
  }
  .brand-logo {
    width: 64px;
    height: 64px;
    border-radius: 8px;
    object-fit: contain;
    flex-shrink: 0;
    background: #F6F4EE;
  }
  .brand-logo.is-placeholder {
    background: repeating-linear-gradient(135deg, rgba(0,43,51,0.06) 0 8px, rgba(0,43,51,0.10) 8px 9px);
    border: 1px dashed rgba(0,43,51,0.18);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 700;
    color: rgba(0,43,51,0.55);
  }
  .seal-body { flex: 1; min-width: 0; }
  .seal-label {
    font-size: 11px;
    letter-spacing: 2.5px;
    color: rgba(0,43,51,0.55);
    font-weight: 600;
    margin-bottom: 4px;
  }
  .seal-name {
    font-size: 24px;
    font-weight: 700;
    color: #003E47;
    line-height: 1.05;
  }
  .verified-badge {
    font-size: 11px;
    letter-spacing: 2px;
    color: #007373;
    font-weight: 600;
    padding: 7px 12px;
    background: rgba(60,192,191,0.14);
    border-radius: 5px;
    white-space: nowrap;
  }

  /* ── Body ── */
  .body {
    flex: 1;
    padding: 88px 56px 24px;
    display: flex;
    flex-direction: column;
    gap: 26px;
  }
  .intro {
    font-size: 16px;
    color: rgba(0,43,51,0.72);
    line-height: 1.5;
    max-width: 540px;
    margin: 0;
  }
  .code-label {
    font-size: 11px;
    letter-spacing: 3px;
    color: #007373;
    font-weight: 600;
    margin: 0 0 10px;
  }
  .code-box {
    background: #003E47;
    color: #fff;
    border-radius: 14px;
    padding: 24px 20px;
    text-align: center;
  }
  .code-value {
    font-size: 52px;
    font-weight: 800;
    letter-spacing: 6px;
  }
  .code-ref {
    font-family: ui-monospace, 'Courier New', monospace;
    font-size: 11px;
    letter-spacing: 2.5px;
    color: rgba(255,255,255,0.55);
    margin-top: 10px;
  }

  /* ── Meta row ── */
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-top: 14px;
    border-top: 1px solid rgba(0,43,51,0.12);
  }
  .meta-label {
    font-size: 11px;
    letter-spacing: 2.5px;
    color: rgba(0,43,51,0.55);
    margin-bottom: 4px;
  }
  .meta-value {
    font-size: 22px;
    font-weight: 700;
    color: #003E47;
  }
  .status-chip { display: flex; align-items: center; gap: 8px; }
  .status-chip .dot {
    width: 9px; height: 9px;
    border-radius: 50%;
    background: #3BB58E;
  }
  .status-chip .label {
    font-size: 12px;
    letter-spacing: 2px;
    color: #007373;
    font-weight: 600;
  }

  /* ── Terms + footer ── */
  .terms {
    font-size: 11px;
    color: rgba(0,43,51,0.55);
    line-height: 1.55;
    max-width: 580px;
    margin: 0;
  }
  .foot {
    padding: 14px 56px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: ui-monospace, 'Courier New', monospace;
    font-size: 10px;
    letter-spacing: 1.8px;
    color: rgba(0,43,51,0.45);
    border-top: 1px solid rgba(0,43,51,0.12);
  }
</style>
</head>
<body>
<div class="coupon">

  <!-- HERO -->
  <header class="hero">
    <svg class="rings" viewBox="0 0 640 640" aria-hidden="true">
      <circle cx="320" cy="320" r="300" fill="none" stroke="#fff" stroke-width="2"/>
      <circle cx="320" cy="320" r="220" fill="none" stroke="#fff" stroke-width="2"/>
      <circle cx="320" cy="320" r="140" fill="none" stroke="#fff" stroke-width="2"/>
      <circle cx="320" cy="320" r="70"  fill="none" stroke="#fff" stroke-width="2"/>
    </svg>

    <div class="head-row">
      <span class="mint-wordmark">Mint Rewards</span>
      ${referenceCode ? `<span class="reward-no">REWARD NO. ${referenceCode}</span>` : ""}
    </div>

    <div class="offer-block">
      <div class="offer-eyebrow">EXCLUSIVE MEMBER OFFER</div>
      ${discountNum
        ? `<h1 class="offer-headline">${discountNum}<span class="pct">%</span></h1>
           <div class="offer-sub">${discountSub}</div>`
        : `<h1 class="offer-headline" style="font-size:72px;letter-spacing:-2px;">${discountSub}</h1>`
      }
    </div>
  </header>

  <!-- FLOATING BRAND SEAL -->
  <div class="seal-anchor">
    <div class="seal">
      ${logoHtml}
      <div class="seal-body">
        <div class="seal-label">OFFER FROM</div>
        <div class="seal-name">${brandName}</div>
      </div>
      <div class="verified-badge">VERIFIED</div>
    </div>
  </div>

  <!-- BODY -->
  <section class="body">
    <p class="intro">Use this code online or in-store. Valid one time only.</p>

    <div>
      <div class="code-label">COUPON CODE</div>
      <div class="code-box">
        <div class="code-value">${code}</div>
        ${referenceCode ? `<div class="code-ref">REF · ${referenceCode}</div>` : ""}
      </div>
    </div>

    ${expiryFormatted || true ? `
    <div class="meta-row">
      ${expiryFormatted
        ? `<div>
             <div class="meta-label">EXPIRES</div>
             <div class="meta-value">${expiryFormatted}</div>
           </div>`
        : `<div></div>`
      }
      <div class="status-chip">
        <span class="dot"></span>
        <span class="label">SINGLE USE</span>
      </div>
    </div>` : ""}

    <p class="terms">
      One use per Mint Rewards member, per order. Excludes gift cards and sale items.
      Cannot be combined with other promotions or partner offers. Mint Rewards reserves
      the right to revoke this offer at any time.
    </p>
  </section>

  <!-- FOOTER -->
  <footer class="foot">
    <span>MINT-REWARDS · MEMBER COUPON</span>
    ${referenceCode ? `<span>REF · ${referenceCode}</span>` : ""}
  </footer>

</div>
</body>
</html>`;
}

export function useCouponDownload() {
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadCoupon = async (item: DiscountItem): Promise<boolean> => {
    setIsDownloading(true);

    // TODO: pull couponId from navigation params or context if this hook is
    // used outside of the discounts screen (item._id is the campaign/coupon ID)
    const couponId = item._id;

    const token =
      useAppStore.getState().token || useAppStore.getState().user?.token;

    // Step 1: Mark the coupon as used on the backend and retrieve the code.
    let couponCode = "";
    let referenceCode = "";
    try {
      const res = await fetch(`${API_BASE_URL}/api/coupons/${couponId}/redeem`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
      });

      const data: RedeemResponse & { error?: string } = await res.json();

      if (!res.ok) {
        Alert.alert(
          "Cannot Download",
          data.error || "This coupon could not be redeemed. Please try again.",
        );
        setIsDownloading(false);
        return false;
      }

      couponCode = data.couponCode ?? "";
      referenceCode = data.referenceCode ?? "";
    } catch {
      Alert.alert(
        "Network Error",
        "Could not reach the server. Check your connection and try again.",
      );
      setIsDownloading(false);
      return false;
    }

    // Step 2: Generate the PDF.
    // The coupon is now marked used — log PDF errors clearly but don't mislead the user.
    try {
      const html = buildCouponHtml(item, couponCode, referenceCode);

      // Dynamic imports: keeps this hook safe to import in Expo Go.
      // Both modules require a development build — run `npx expo run:ios` or
      // `npx expo run:android` if you see "Cannot find native module" here.
      const [Print, Sharing] = await Promise.all([
        import("expo-print"),
        import("expo-sharing"),
      ]);

      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "Coupon Saved",
          "PDF saved to your device but sharing is unavailable on this platform.",
        );
        setIsDownloading(false);
        return true;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Save your Mint Rewards coupon",
        UTI: "com.adobe.pdf",
      });

      setIsDownloading(false);
      return true;
    } catch (err) {
      // Coupon is already marked used at this point — do not retry the redeem call.
      console.error(
        "[useCouponDownload] PDF generation failed after successful redeem.",
        "couponId:", couponId,
        err,
      );
      Alert.alert(
        "PDF Generation Failed",
        "Your coupon was marked as used but the PDF could not be created. " +
          "Screenshot your code as a backup.",
      );
      setIsDownloading(false);
      return false;
    }
  };

  return { downloadCoupon, isDownloading };
}
