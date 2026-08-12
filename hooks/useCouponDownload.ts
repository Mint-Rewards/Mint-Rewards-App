import { useState } from "react";
import { Alert } from "react-native";
import { useAppStore, Deal } from "@/store/store";
import { buildCouponHtml } from "@/utils/couponHtml";
import { captureError } from "@/utils/sentry";

// expo-print and expo-sharing are loaded lazily inside downloadCoupon so that
// importing this hook never crashes the screen in environments where the native
// modules aren't compiled in (e.g. Expo Go). The actual download will show a
// clear error if the dev build hasn't been made yet.

export function useCouponDownload() {
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadCoupon = async (item: Deal): Promise<boolean> => {
    setIsDownloading(true);

    const dealId = item._id;

    // Step 1: claim a code, THEN build the PDF. This ordering is load-bearing
    // — a PDF must never exist for a code the backend never issued. It also
    // goes through the store action so the claim is reflected in `deals`
    // immediately, and through authenticatedFetch so a 401 hits the global
    // sign-out boundary (this call used to use a bare fetch and bypass it).
    const result = await useAppStore.getState().redeemDeal(dealId);

    if ("error" in result) {
      Alert.alert("Cannot Download", result.error);
      setIsDownloading(false);
      return false;
    }

    const couponCode = result.code;
    // The deals endpoint issues a code but no separate reference number; the
    // deal id is the only stable handle to quote in support.
    const referenceCode = dealId.slice(-6).toUpperCase();

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
        "dealId:", dealId,
        err,
      );
      // The worst failure in the app: the backend has burned the user's deal
      // and they have no voucher. Unrecoverable for them and, without this,
      // invisible to us — the Alert below is the only other signal, and it
      // reaches nobody who can act on it. dealId is what support needs to
      // reissue, and the code is deliberately absent (it is the redeemable
      // secret; `referenceCode` is derived from dealId anyway).
      captureError("coupon PDF generation failed after redeem", err, {
        dealId,
        referenceCode,
        brand: item.brand?.companyName,
        // Distinguishes "expo-print isn't linked in this build" — the common
        // cause per the debugging playbook — from a genuine render failure.
        nativeModuleMissing: /Cannot find native module/i.test(
          err instanceof Error ? err.message : String(err),
        ),
      });
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
