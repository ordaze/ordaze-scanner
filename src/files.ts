import { readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { Language, EXT_TO_LANGUAGE, SKIP_DIRS } from "./types";

const MAX_FILE_SIZE = 512 * 1024; // 512KB -- skip generated bundles

export interface CollectOptions {
  maxDepth?: number;
  maxFiles?: number;
}

/**
 * Collect all source files for the given language within a directory.
 * Shared between discovery and scanning phases to avoid walking the tree twice.
 *
 * Skips: hidden dirs, SKIP_DIRS (node_modules, .git, etc.), files > 512KB.
 * For TypeScript projects, also includes .js/.jsx/.mjs (mixed codebases).
 */
export function collectSourceFiles(
  dir: string,
  language: Language,
  opts: CollectOptions = {},
): string[] {
  const maxDepth = opts.maxDepth ?? 8;
  const maxFiles = opts.maxFiles ?? 5000;

  const validExts = new Set<string>();
  for (const [ext, lang] of Object.entries(EXT_TO_LANGUAGE)) {
    if (lang === language) validExts.add(ext);
  }
  // Include JS files for TypeScript projects (mixed codebases)
  if (language === "typescript") {
    validExts.add(".js");
    validExts.add(".jsx");
    validExts.add(".mjs");
  }

  const files: string[] = [];

  function walk(currentDir: string, depth: number) {
    if (depth > maxDepth || files.length >= maxFiles) return;
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || SKIP_DIRS.has(entry)) continue;
      const fullPath = join(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (
        stat.isFile() &&
        stat.size <= MAX_FILE_SIZE &&
        validExts.has(extname(entry).toLowerCase())
      ) {
        files.push(fullPath);
      }
    }
  }

  walk(dir, 0);
  return files;
}
