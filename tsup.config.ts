import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node20",
  clean: true,
  minify: false,
  noExternal: [/.*/], // bundle ALL dependencies into dist/index.js
  banner: {
    js: "#!/usr/bin/env node",
  },
});
