import type { Config } from "jest";
import nextJest from "next/jest.js";

/**
 * next/jest wires up the SWC transform, tsconfig path aliases (@/…) and env
 * loading, so tests import app modules exactly as the app does.
 */
const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "node",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  // Skip build output and the one-off maintenance scripts.
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/scripts/"],
};

export default createJestConfig(config);
