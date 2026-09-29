/** @type {import("prettier").Config} */
const config = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
  plugins: ["prettier-plugin-tailwindcss"],
  overrides: [
    {
      files: ["*.md"],
      options: { proseWrap: "preserve" },
    },
  ],
};

export default config;
