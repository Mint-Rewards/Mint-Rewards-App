/**
 * CO₂ saved for a given weight of recycled waste, rounded to 2dp.
 *
 * One copy of 0.21, deliberately. Every screen that shows a CO₂ figure
 * derives it through here, so two of them cannot drift apart or disagree
 * about the same weight.
 *
 * A leaf module with no imports, so the arithmetic can be used — and tested —
 * without pulling in the store, which reads the app configuration at import
 * time and throws outside a configured build.
 */
export function co2FromWasteKg(wasteKg: number): number {
  return Math.round((wasteKg * 0.21 + Number.EPSILON) * 100) / 100;
}
