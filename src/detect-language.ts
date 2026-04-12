import { readdirSync, statSync, existsSync } from "fs";
import { join, extname } from "path";
import { DetectedLanguage, Language, EXT_TO_LANGUAGE, SKIP_DIRS } from "./types";

/** Marker files that strongly indicate a language/platform */
const MARKER_FILES: Record<string, { language: Language; weight: number }> = {
  "tsconfig.json": { language: "typescript", weight: 40 },
  "tsconfig.base.json": { language: "typescript", weight: 30 },
  "package.json": { language: "typescript", weight: 10 }, // could be JS too
  "Podfile": { language: "swift", weight: 50 },
  "Package.swift": { language: "swift", weight: 50 },
  "build.gradle": { language: "kotlin", weight: 40 },
  "build.gradle.kts": { language: "kotlin", weight: 50 },
  "settings.gradle.kts": { language: "kotlin", weight: 40 },
  "pom.xml": { language: "java", weight: 40 },
  "go.mod": { language: "go", weight: 50 },
  "go.sum": { language: "go", weight: 30 },
  // Cargo.toml (Rust) -- not yet supported, intentionally omitted
  "requirements.txt": { language: "python", weight: 40 },
  "setup.py": { language: "python", weight: 40 },
  "pyproject.toml": { language: "python", weight: 40 },
  "Pipfile": { language: "python", weight: 40 },
  "composer.json": { language: "php", weight: 50 },
  "Gemfile": { language: "ruby", weight: 50 },
  "pubspec.yaml": { language: "dart", weight: 50 },
};

const MAX_DEPTH = 6;
const MAX_FILES = 5000; // stop counting after this many

/**
 * Auto-detect the primary language of a codebase by scanning
 * file extensions and marker files.
 */
export function detectLanguage(dir: string): DetectedLanguage[] {
  const counts = new Map<Language, number>();
  const markers = new Map<Language, string[]>();
  let totalFiles = 0;

  // Check marker files in root
  for (const [file, { language, weight }] of Object.entries(MARKER_FILES)) {
    if (weight > 0 && existsSync(join(dir, file))) {
      counts.set(language, (counts.get(language) || 0) + weight);
      const list = markers.get(language) || [];
      list.push(file);
      markers.set(language, list);
    }
  }

  // Walk and count extensions
  function walk(currentDir: string, depth: number) {
    if (depth > MAX_DEPTH || totalFiles > MAX_FILES) return;

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
      } else if (stat.isFile()) {
        totalFiles++;
        const ext = extname(entry).toLowerCase();
        const lang = EXT_TO_LANGUAGE[ext];
        if (lang) {
          counts.set(lang, (counts.get(lang) || 0) + 1);
        }
      }
    }
  }

  walk(dir, 0);

  if (counts.size === 0) return [];

  // Calculate confidence using absolute thresholds (not relative).
  // Marker files contribute weighted scores, so subtract those to get raw file count.
  const results: DetectedLanguage[] = [];

  for (const [language, count] of counts.entries()) {
    // Estimate raw source file count by subtracting marker file weights
    const markerWeight = (markers.get(language) || []).reduce((sum, file) => {
      const entry = MARKER_FILES[file];
      return sum + (entry ? entry.weight : 0);
    }, 0);
    const rawFileCount = Math.max(0, count - markerWeight);
    const hasMarker = markerWeight > 0;

    // Absolute confidence scale based on source file count
    let confidence: number;
    if (rawFileCount === 0 && !hasMarker) {
      confidence = 5;
    } else if (rawFileCount <= 2) {
      confidence = hasMarker ? 30 : 15;
    } else if (rawFileCount <= 10) {
      confidence = hasMarker ? 55 : 40;
    } else if (rawFileCount <= 50) {
      confidence = hasMarker ? 75 : 65;
    } else {
      confidence = hasMarker ? 92 : 85;
    }
    confidence = Math.min(99, confidence);

    results.push({
      language,
      confidence,
      fileCount: count,
      markerFiles: markers.get(language) || [],
    });
  }

  // Sort by confidence descending, then by file count descending (tie-breaker)
  results.sort((a, b) => b.confidence - a.confidence || b.fileCount - a.fileCount);

  return results;
}
