import type { Config } from "jest";
import nextJest from "next/jest.js";

/**
 * next/jest wires up the SWC transform and env loading, so tests import app
 * modules exactly as the app does.
 *
 * It does not, despite the name, read tsconfig's `paths` — its moduleNameMapper
 * covers only CSS, fonts, images and `server-only`. The `@/…` alias is mapped
 * here to match tsconfig, without which nothing that imports an app module by
 * its alias — every file under src/app — can be tested at all.
 */
const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "node",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  // Skip build output and the one-off maintenance scripts.
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/scripts/"],
};

export default createJestConfig(config);
