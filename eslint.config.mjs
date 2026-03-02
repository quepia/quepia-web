import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig } from "eslint/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "**/.next/**",
      "out/**",
      "**/out/**",
      "build/**",
      "**/build/**",
      "next-env.d.ts",
      "node_modules/**",
      "**/node_modules/**",
      "node_modules 2/**",
      "**/node_modules 2/**",
      " sistema de gestion de proyectos/**",
      "nextjs-app/**",
    ],
  },
]);
