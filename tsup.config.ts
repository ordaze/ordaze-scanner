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
]);
