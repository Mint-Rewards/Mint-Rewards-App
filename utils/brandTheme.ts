/**
 * Brand theme colours come from the backend and can be anything — including
 * pure white, which made white-on-brand text and icons invisible. Everything
 * that paints a surface with `brand.themeColor` should derive its foreground
 * from here rather than assuming white reads.
 */

const DEFAULT_BRAND_COLOR = "#00528A";

/** Ink used on light brand surfaces. Same family as the app's grey scale. */
const INK = "#1A202C";
const ON_LIGHT = INK;
const ON_DARK = "#FFFFFF";

type Rgb = { r: number; g: number; b: number };

const parseHex = (hex?: string): Rgb | null => {
  if (!hex) return null;
  let clean = hex.trim().replace("#", "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (clean.length !== 6 || !/^[0-9a-f]{6}$/i.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
};

/** WCAG relative luminance. */
const luminance = ({ r, g, b }: Rgb) => {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * True when a surface in this colour must carry dark ink.
 *
 * White stays the default foreground — it is what the brand cards and hero were
 * designed around — and we only switch when white drops below the WCAG 3:1
 * large-text floor. Picking whichever of the two simply scores higher would
 * flip mid-tones like the app's own teal to dark text for no legibility gain.
 */
export function isLightColor(hex?: string): boolean {
  const rgb = parseHex(hex) ?? parseHex(DEFAULT_BRAND_COLOR)!;
  return contrast(rgb, parseHex(ON_DARK)!) < 3;
}

export type BrandSurface = {
  /** The brand colour itself, normalised — safe to use as a background. */
  background: string;
  isLight: boolean;
  /** Primary text and icons on the brand surface. */
  onSurface: string;
  /** Secondary text on the brand surface — tinted from the foreground, never grey. */
  onSurfaceMuted: string;
  /** Fill + border for chips/badges sitting on the brand surface. */
  chipBackground: string;
  chipBorder: string;
  /** Fill for the circular back button so the arrow always has a base. */
  scrim: string;
  /**
   * Hairline that gives a near-white brand surface an edge against the page.
   * `null` on dark surfaces, which separate on their own.
   */
  hairline: string | null;
  statusBarStyle: "light" | "dark";
};

/**
 * Everything a screen needs to paint a surface in a brand's colour and stay
 * legible on both ends of the range.
 */
export function brandSurface(hex?: string): BrandSurface {
  const background = parseHex(hex) ? hex!.trim() : DEFAULT_BRAND_COLOR;
  const light = isLightColor(background);

  return {
    background,
    isLight: light,
    onSurface: light ? ON_LIGHT : ON_DARK,
    onSurfaceMuted: light ? "rgba(26,32,44,0.72)" : "rgba(255,255,255,0.78)",
    chipBackground: light ? "rgba(26,32,44,0.06)" : "rgba(255,255,255,0.2)",
    chipBorder: light ? "rgba(26,32,44,0.1)" : "rgba(255,255,255,0.28)",
    scrim: light ? "rgba(26,32,44,0.07)" : "rgba(0,0,0,0.25)",
    hairline: light ? "rgba(26,32,44,0.12)" : null,
    statusBarStyle: light ? "dark" : "light",
  };
}
