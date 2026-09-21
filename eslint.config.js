import js from "@eslint/js"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cdk.out/**",
      "public/**",
      "fixtures/consumers/**",
      "playground/src/components/ui/**",
      "playground/src/lib/**",
      "playground/src/components/theme-provider.tsx",
      "bench/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // The item contract. Registry source ships into other people's projects through
    // `shadcn add`, so it may only reach shadcn through the consumer's own components.
    files: ["registry/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["radix-ui", "@radix-ui/*", "@base-ui/*", "@base-ui-components/*"],
              message: "Base-agnostic: compose the consumer's @/components/ui/* instead of a primitive library.",
            },
            {
              group: ["cmdk", "react-resizable-panels"],
              message: "Compose the command / resizable built-ins instead of their underlying packages.",
            },
            {
              group: ["@/lib/utils", "@/registry/*/lib/utils"],
              message: 'import { cn } from "cn" (the shadcn convention since September 2026).',
            },
            {
              group: ["./*", "../*"],
              message: "Relative imports do not survive `shadcn add`. Use @/registry/tradecn/* or @/components/ui/*.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='asChild']",
          message: "asChild is Radix-only. Style the trigger with className or pass children.",
        },
        {
          selector: "JSXAttribute[name.name='render']",
          message: "render is Base UI-only. Style the trigger with className or pass children.",
        },
        {
          selector: "JSXAttribute[name.name='nativeButton']",
          message: "nativeButton is Base UI-only.",
        },
      ],
    },
  },
)
