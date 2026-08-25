/**
 * Sampling plan for P0.1a.
 *
 * Density is per stratum, not uniform: the sweep sets `geocodeReliable` per
 * town, and the promotion rule needs >=20 points in a town before it can
 * promote one. Anything below that floor can only ever demote, never promote,
 * which is deliberate — an unmeasured town stays false.
 */

/** Cities whose towns get sampled individually. */
const TOWN_LEVEL_STRATA = {
  // Operations run here. Full grid, enough per town to clear the promotion floor.
  Karachi: { stratum: "full", pointsPerTown: 24 },
  // Served early / deep registry. Moderate grid.
  Lahore: { stratum: "moderate", pointsPerTown: 20 },
  Islamabad: { stratum: "moderate", pointsPerTown: 20 },
  // Have town data, operational status unknown. Small grid: enough to see
  // whether resolution works at all, not enough to promote.
  Rawalpindi: { stratum: "small", pointsPerTown: 8 },
  Faisalabad: { stratum: "small", pointsPerTown: 8 },
  Multan: { stratum: "small", pointsPerTown: 8 },
  Peshawar: { stratum: "small", pointsPerTown: 8 },
  Quetta: { stratum: "small", pointsPerTown: 8 },
  Hyderabad: { stratum: "small", pointsPerTown: 8 },
  Gujranwala: { stratum: "small", pointsPerTown: 8 },
};

/**
 * Cities with no town data at all (48 of 58). These are sampled at CITY level
 * and answer exactly one question: does the geocoder return the right city?
 *
 * That single number decides whether the tier-C flow (city + pin + house no.)
 * is viable nationally. It matters more than any per-town figure, because
 * tier C has no area step for a town-level result to feed.
 */
const CITY_LEVEL_POINTS = 10;

/** Minimum samples before the P0.1c rule may promote a town. */
const PROMOTION_MIN_SAMPLES = 20;

/** P0.1c promotion thresholds. All three must hold. */
const PROMOTION = {
  canonicalResolution: 0.7, // P0.1a
  labelledCorrect: 0.7,     // P0.1b
  boundaryCorrect: 0.5,     // P0.1b, boundary-sampled subset
};

/** Live demotion signal (P2.7), applied monthly once the flow is running. */
const DEMOTION_OVERRIDE_RATE = 0.3;

module.exports = {
  TOWN_LEVEL_STRATA,
  CITY_LEVEL_POINTS,
  PROMOTION_MIN_SAMPLES,
  PROMOTION,
  DEMOTION_OVERRIDE_RATE,
};
