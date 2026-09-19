/// <reference types="vite/client" />

export const modules = import.meta.glob([
  "./**/*.{js,mjs,cjs,ts,tsx,mts,cts,jsx}",
  "!./**/*.*.*",
]);
