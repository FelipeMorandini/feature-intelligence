import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Test doubles (e.g. FakeTriageModel) must never leak into application
    // code: the running app may not silently substitute fake AI output.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.ts", "src/testing/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/testing", "@/testing/*", "**/testing", "**/testing/*"],
              message: "Test doubles are for tests and explicit fixtures only.",
            },
          ],
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
