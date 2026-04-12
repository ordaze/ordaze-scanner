import { readFileSync } from "fs";
import { relative } from "path";
import { execSync } from "child_process";
import {
  Language,
  TrackingPattern,
  DiscoveredEvent,
  Occurrence,
  ScanResult,
} from "./types";
import { detectLanguage } from "./detect-language";
import { discoverPatterns } from "./discover";
import { collectSourceFiles } from "./files";
import { extractEventName } from "./patterns";

export interface ScanOptions {
  dir: string;
  /** Explicit language override (skip auto-detection) */
  language?: Language;
  /** Extra patterns to search for */
  extraPatterns?: TrackingPattern[];
}

/**
 * Run the full scan pipeline:
 * 1. Detect language (or use override)
 * 2. Discover tracking patterns
 * 3. Scan all files for event calls
 * 4. Collect git metadata
 */
export function scan(options: ScanOptions): ScanResult {
  const startTime = Date.now();
  const { dir } = options;

  // Step 1: Detect language
  const detected = detectLanguage(dir);
  let language: Language;

  if (options.language) {
    language = options.language;
  } else if (detected.length > 0) {
    language = detected[0].language;
  } else {
    return {
      language: null,
      patterns: [],
      events: [],
      totalOccurrences: 0,
      duration: Date.now() - startTime,
      git: getGitMeta(dir),
    };
  }

  // Collect files once and share between discovery and scanning phases
  const files = collectSourceFiles(dir, language);

  // Step 2: Discover tracking patterns (cap at 500 files for discovery performance)
  const discoveryFiles = files.length > 500 ? files.slice(0, 500) : files;
  const patterns = [
    ...discoverPatterns(dir, language, discoveryFiles),
    ...(options.extraPatterns || []),
  ];

  if (patterns.length === 0) {
    return {
      language: detected[0] || null,
      patterns: [],
      events: [],
      totalOccurrences: 0,
      duration: Date.now() - startTime,
      git: getGitMeta(dir),
    };
  }
  const eventMap = new Map<string, DiscoveredEvent>();
  let totalOccurrences = 0;

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    // Pre-build line offset index for O(log n) line number lookups
    const lineOffsets = buildLineIndex(content);

    for (const pattern of patterns) {
      // Reset regex lastIndex for each file
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const eventName = extractEventName(match);
        if (!eventName) continue;

        // O(log n) line number lookup via binary search
        const lineNumber = getLineNumber(lineOffsets, match.index);
        const lineContent = lines[lineNumber - 1]?.trim().slice(0, 500) || "";
        const relPath = relative(dir, file);

        // Find enclosing function
        const functionName = findEnclosingFunction(lines, lineNumber - 1, language);

        const occurrence: Occurrence = {
          filePath: relPath,
          lineNumber,
          lineContent,
          functionName: functionName || undefined,
          matchType: "exact",
        };

        totalOccurrences++;

        if (eventMap.has(eventName)) {
          eventMap.get(eventName)!.occurrences.push(occurrence);
        } else {
          eventMap.set(eventName, {
            name: eventName,
            occurrences: [occurrence],
          });
        }
      }
    }
  }

  // Sort events alphabetically
  const events = Array.from(eventMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return {
    language: detected[0] || null,
    patterns,
    events,
    totalOccurrences,
    duration: Date.now() - startTime,
    git: getGitMeta(dir),
  };
}

/** Build an index of character offsets for each line start. O(n) one-time cost per file. */
function buildLineIndex(content: string): number[] {
  const offsets = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

/** Binary search the line offset index to find which line a character index falls on. O(log n). */
function getLineNumber(offsets: number[], charIndex: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (offsets[mid] <= charIndex) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo + 1; // 1-based line number
}

/** Find the enclosing function name by scanning upward from a line */
function findEnclosingFunction(
  lines: string[],
  lineIndex: number,
  language: Language,
): string | null {
  const searchStart = Math.max(0, lineIndex - 50);

  for (let i = lineIndex; i >= searchStart; i--) {
    const line = lines[i];

    if (language === "typescript" || language === "javascript") {
      // function name(
      let m = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (m) return m[1];
      // const name = (...) =>  or  const name = async (...) =>
      m = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|[a-zA-Z])/);
      if (m) return m[1];
      // method name in class/object
      m = line.match(/^\s+(?:async\s+)?(\w+)\s*\(/);
      if (m && !["if", "for", "while", "switch", "catch", "return"].includes(m[1])) return m[1];
    } else if (language === "swift") {
      const m = line.match(/(?:func|class func|static func)\s+(\w+)/);
      if (m) return m[1];
    } else if (language === "kotlin" || language === "java") {
      const m = line.match(/(?:fun|void|suspend fun|override fun)\s+(\w+)/);
      if (m) return m[1];
    } else if (language === "python") {
      const m = line.match(/def\s+(\w+)\s*\(/);
      if (m) return m[1];
    } else if (language === "go") {
      const m = line.match(/func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(/);
      if (m) return m[1];
    } else if (language === "php") {
      const m = line.match(/function\s+(\w+)\s*\(/);
      if (m) return m[1];
    } else if (language === "ruby") {
      const m = line.match(/def\s+(?:self\.)?(\w+)/);
      if (m) return m[1];
    }
  }

  return null;
}

/** Get git metadata for the scanned directory */
function getGitMeta(dir: string): ScanResult["git"] {
  const meta: ScanResult["git"] = {};
  try {
    meta.commitSha = execSync("git rev-parse HEAD", { cwd: dir, stdio: ["pipe", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch {}
  try {
    meta.branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: dir, stdio: ["pipe", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch {}
  try {
    const remote = execSync("git remote get-url origin", { cwd: dir, stdio: ["pipe", "pipe", "pipe"] })
      .toString()
      .trim();
    meta.repo = remote.replace(/.*\//, "").replace(/\.git$/, "");
  } catch {}
  return meta;
}
