// prettier.config.js, .prettierrc.js, prettier.config.mjs, or .prettierrc.mjs

/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
const config = {
  trailingComma: "all",
  importOrder: [
    "^(react|react-dom(?:/.*)?|react-router-dom)$",
    "^(assert|buffer|child_process|cluster|console|constants|crypto|dgram|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|timers|tls|trace_events|tty|url|util|v8|vm|zlib)(/.*)?$",
    "^(?!@/)(?!\\.).+",
    "^@/",
    "^\\.\\./",
    "^\\./(?!index(?:\\.|$))",
    "^\\./index(?:\\.|$)?",
  ],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  plugins: ["@trivago/prettier-plugin-sort-imports"],
};

export default config;
