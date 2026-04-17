import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig([
  // Library (ESM + CJS + types)
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    target: "node18",
    clean: true,
    splitting: false,
  },
  // CLI (ESM only, with shebang)
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    target: "node18",
    clean: false,
    banner: { js: "#!/usr/bin/env node" },
    define: {
      "process.env.PACKAGE_VERSION": JSON.stringify(pkg.version),
    },
  },
  // GitHub Action (ESM, fully bundled, no external deps — runs on node20).
  // `action.yml` points at `dist/action/index.js`; ESM output with
  // `"type": "module"` in package.json lands at that exact filename.
  {
    entry: { "action/index": "action/index.ts" },
    format: ["esm"],
    target: "node20",
    clean: false,
    dts: false,
    noExternal: [/.*/],
    splitting: false,
    define: {
      "process.env.PACKAGE_VERSION": JSON.stringify(pkg.version),
    },
  },
]);
