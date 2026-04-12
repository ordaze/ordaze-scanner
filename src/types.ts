/** Supported language identifiers */
export type Language =
  | "typescript"
  | "javascript"
  | "swift"
  | "kotlin"
  | "java"
  | "python"
  | "go"
  | "php"
  | "ruby"
  | "dart";

/** Result of language auto-detection */
export interface DetectedLanguage {
  language: Language;
  confidence: number; // 0-100
  fileCount: number;
  markerFiles: string[]; // e.g. ["package.json", "tsconfig.json"]
}

/** A tracking function pattern to search for */
export interface TrackingPattern {
  /** The function/method call to match, e.g. "trackEvent" */
  functionName: string;
  /** Regex that matches the full call expression and captures the event name */
  regex: RegExp;
  /** How the pattern was found */
  source: "builtin" | "import-follow" | "manual";
  /** Which SDK this pattern belongs to, if known */
  sdk?: string;
}

/** A single place where a tracking call was found */
export interface Occurrence {
  filePath: string;
  lineNumber: number;
  columnNumber?: number;
  lineContent: string;
  functionName?: string;
  matchType: "exact" | "fuzzy" | "import";
}

/** A discovered event with all its occurrences */
export interface DiscoveredEvent {
  name: string;
  occurrences: Occurrence[];
}

/** Full result of a scan */
export interface ScanResult {
  /** Auto-detected or specified language */
  language: DetectedLanguage | null;
  /** Tracking patterns that were discovered/used */
  patterns: TrackingPattern[];
  /** Events found in the codebase */
  events: DiscoveredEvent[];
  /** Total number of tracking calls found */
  totalOccurrences: number;
  /** Scan duration in milliseconds */
  duration: number;
  /** Git metadata */
  git: {
    commitSha?: string;
    branch?: string;
    repo?: string;
  };
}

/** Directories to always skip */
export const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "vendor",
  ".cache",
  "__pycache__",
  ".gradle",
  "Pods",
  "DerivedData",
  ".dart_tool",
  ".pub-cache",
  "__tests__",
  "__test__",
  "test",
  "tests",
  "spec",
]);

/** File extension -> language mapping */
export const EXT_TO_LANGUAGE: Record<string, Language> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".java": "java",
  ".py": "python",
  ".go": "go",
  ".php": "php",
  ".rb": "ruby",
  ".dart": "dart",
};
