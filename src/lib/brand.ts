/**
 * Coder brand colors for runtime use (SVG `fill`/`stroke`, inline styles,
 * color lookup maps).
 *
 * For anything expressible as a class name, use the Tailwind utilities instead
 * — `bg-coder-purple`, `text-coder-cyan`, `border-coder-purple/30`. Those come
 * from the `@theme inline` block in `globals.css` and are the preferred form.
 *
 * These stay literal six-digit hex rather than `var(--coder-*)` because callers
 * append a two-digit alpha channel to them (`${accent}28`), which only works on
 * a hex literal. Keep the values in sync with the `:root` block in
 * `globals.css`.
 */
export const BRAND = {
  bg: "#090B0B",
  sunken: "#0A0C0D",
  surface: "#0C0E0F",
  control: "#0D1011",
  panel: "#101314",
  panelAlt: "#141718",

  purple: "#BC7CFF",
  green: "#66FFAB",
  cyan: "#01F2FF",
  coral: "#FF8067",
  pink: "#F08DFF",
  amber: "#FFC46B",
  red: "#FF6B6B",
} as const;

/** Accent used to tint a readiness card / progress track. */
export type BrandAccent = typeof BRAND.purple | typeof BRAND.cyan;
