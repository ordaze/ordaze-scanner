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
  // GitHub Action (CJS, fully bundled — matches how production Actions ship).
  // `action.yml` points at `dist/action/index.cjs`. CJS avoids ESM+`@actions/core`
  // interop issues (dynamic require of 'os' fails in an ESM bundle).
  {
    entry: { "action/index": "action/index.ts" },
    format: ["cjs"],
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
