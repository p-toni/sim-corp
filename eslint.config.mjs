import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginImport from "eslint-plugin-import";
import tseslint from "typescript-eslint";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(__dirname, "tsconfig.eslint.json");

export default tseslint.config(
  {
    ignores: ["dist", "build", "coverage", "node_modules", "eslint.config.mjs"]
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project,
        tsconfigRootDir: __dirname
      }
    },
    plugins: {
      import: eslintPluginImport
    },
    settings: {
      "import/resolver": {
        typescript: {
          project
        },
        node: {
          extensions: [".js", ".mjs", ".ts", ".tsx"]
        }
      }
    },
    rules: {
      ...eslintPluginImport.configs.recommended.rules,
      ...eslintPluginImport.configs.typescript.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          disallowTypeAnnotations: false,
          fixStyle: "inline-type-imports"
        }
      ]
    }
  },
  eslintConfigPrettier
);
