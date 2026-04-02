import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  minify: false,
  // Bundling everything into a single file is disabled because it causes issues with Ink and Yoga
  // noExternal: [/.*/], 
  banner: {
    js: "#!/usr/bin/env node",
  },
});
