import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Tailwind arbitrary color values — `bg-[#BC7CFF]`, `border-[#0A66C2]/30`.
 *
 * Every color in the UI comes from a token in globals.css, so a literal hex in
 * a class name is either a color that needs a token or a token someone did not
 * know about. Matches string literals and template chunks alike, which covers
 * className attributes, the extracted `inputCls`-style constants, and anything
 * assembled in a template literal.
 */
const ARBITRARY_HEX = String.raw`-\[#[0-9a-fA-F]{3,8}\]`;

const NO_ARBITRARY_HEX =
  "Use a brand token instead of a literal hex in a class name — " +
  "`bg-coder-panel`, `text-coder-purple`, `border-coder-purple/30`. " +
  "The palette is the `@theme inline` block in src/app/globals.css; add a " +
  "token there if the color you need is missing. For a color consumed at " +
  "runtime (SVG fill, inline style) use BRAND in src/lib/brand.ts.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${ARBITRARY_HEX}/]`,
          message: NO_ARBITRARY_HEX,
        },
        {
          selector: `TemplateElement[value.raw=/${ARBITRARY_HEX}/]`,
          message: NO_ARBITRARY_HEX,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
