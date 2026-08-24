/**
 * Shape maths shared by the drawing tool and the point generator.
 *
 * An area is a list of SHAPES, each either a box or a freehand polygon. Boxes
 * are kept because the regular grids (Islamabad sectors, planned blocks) really
 * are rectangles and a box states that more honestly than a traced outline.
 * Polygons exist because most places are not rectangles: a box around Korangi
 * or Orangi swallows a slice of the neighbouring area, and every point that
 * lands in the spill is one the geocoder answers CORRECTLY while the scorer
 * counts it as a miss.
 *
 * Distances use a local equirectangular projection. Over a few km at Pakistan's
 * latitudes the error is far below the precision this exercise needs, and it
 * avoids pulling in a geodesy dependency for a throwaway script.
 */
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

/** Project to local metres about `lat0`. */
function toXY(lat, lng, lat0) {
  return [rad(lng) * R * Math.cos(rad(lat0)), rad(lat) * R];
}

/** Accepts a bare box, an array, or a polygon; always returns a shape list. */
function normalizeShapes(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter(
    (s) =>
      s &&
      ((typeof s.minLat === "number" && typeof s.maxLat === "number") ||
        (Array.isArray(s.polygon) && s.polygon.length >= 3)),
  );
}

const isPolygon = (s) => Array.isArray(s.polygon);

/** [[lat,lng], ...] for a shape of either kind. */
function ringOf(shape) {
  if (isPolygon(shape)) return shape.polygon;
  const { minLat, maxLat, minLng, maxLng } = shape;
  return [
    [minLat, minLng],
    [minLat, maxLng],
    [maxLat, maxLng],
    [maxLat, minLng],
  ];
}

function bboxOf(shape) {
  if (!isPolygon(shape)) return shape;
  const lats = shape.polygon.map((p) => p[0]);
  const lngs = shape.polygon.map((p) => p[1]);
  return {
    minLat: Math.min(...lats), maxLat: Math.max(...lats),
    minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
  };
}

/** Ray casting. Boxes go through the same path so behaviour cannot diverge. */
function contains(shape, lat, lng) {
  const ring = ringOf(shape);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    const straddles = yi > lat !== yj > lat;
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shoelace area in m². Sign-independent, so winding order does not matter. */
function areaM2(shape) {
  const ring = ringOf(shape);
  const lat0 = ring.reduce((a, p) => a + p[0], 0) / ring.length;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = toXY(ring[i][0], ring[i][1], lat0);
    const [xj, yj] = toXY(ring[j][0], ring[j][1], lat0);
    sum += xj * yi - xi * yj;
  }
  return Math.abs(sum) / 2;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Metres from a point to the nearest edge of `shape`. */
function distanceToEdgeM(shape, lat, lng) {
  const ring = ringOf(shape);
  const lat0 = lat;
  const [px, py] = toXY(lat, lng, lat0);
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = toXY(ring[i][0], ring[i][1], lat0);
    const [bx, by] = toXY(ring[j][0], ring[j][1], lat0);
    best = Math.min(best, segDist(px, py, ax, ay, bx, by));
  }
  return best;
}

/**
 * Radius of a circle with the same area. Used to scale the boundary band, so a
 * small area gets a proportionally small band instead of one absolute distance
 * that would swallow a compact area whole and barely touch a large one.
 */
const effectiveRadiusM = (shape) => Math.sqrt(areaM2(shape) / Math.PI);

module.exports = {
  normalizeShapes, isPolygon, ringOf, bboxOf,
  contains, areaM2, distanceToEdgeM, effectiveRadiusM,
};
