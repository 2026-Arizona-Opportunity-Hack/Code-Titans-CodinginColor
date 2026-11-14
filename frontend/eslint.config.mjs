import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next already includes eslint-plugin-jsx-a11y, which catches
// common accessibility mistakes (missing alt text, bad ARIA, unlabeled controls).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/mockServiceWorker.js"]),
]);

export default eslintConfig;
