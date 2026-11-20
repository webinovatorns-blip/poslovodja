import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // UI code must never touch the RLS-bypassing admin client or server secrets.
    // (`server-only` also turns any client-bundle import into a build error.)
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message:
                "The admin client bypasses RLS. Use it only in dedicated server modules under src/lib or src/server.",
            },
            {
              name: "@/lib/env.server",
              message: "Server secrets must not be read from UI code.",
            },
          ],
        },
      ],
    },
  },
  // Must come last: turns off stylistic rules that conflict with Prettier.
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "supabase/.temp/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
