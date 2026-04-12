import { resolve } from "path";
import { scan } from "./scan";
import { buildReportPayload, reportUsage, fetchCatalog } from "./report";
import type { Language, ScanResult } from "./types";

const VERSION = process.env.PACKAGE_VERSION || "1.0.0";

// Colors
const isColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  reset: isColor ? "\x1b[0m" : "",
  bold: isColor ? "\x1b[1m" : "",
  dim: isColor ? "\x1b[90m" : "",
  red: isColor ? "\x1b[31m" : "",
  green: isColor ? "\x1b[32m" : "",
  yellow: isColor ? "\x1b[33m" : "",
  cyan: isColor ? "\x1b[36m" : "",
};

// Parse args
interface Args {
  dir: string;
  platform?: Language;
  token?: string;
  url?: string;
  source?: string;
  repo?: string;
  dryRun: boolean;
  quiet: boolean;
  json: boolean;
  strict: boolean;
  minCoverage?: number;
}

function parseArgs(): Args {
  const args: Args = { dir: ".", dryRun: false, quiet: false, json: false, strict: false };

  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") { printHelp(); process.exit(0); }
    if (arg === "--version" || arg === "-v") { console.log(VERSION); process.exit(0); }
    if (arg === "--dry-run") { args.dryRun = true; continue; }
    if (arg === "--quiet") { args.quiet = true; continue; }
    if (arg === "--json") { args.json = true; continue; }
    if (arg === "--strict") { args.strict = true; continue; }

    const [key, ...valueParts] = arg.split("=");
    const value = valueParts.join("=");

    switch (key) {
      case "--dir": args.dir = value; break;
      case "--platform": args.platform = value as Language; break;
      case "--token": args.token = value; break;
      case "--url": args.url = value; break;
      case "--source": args.source = value; break;
      case "--repo": args.repo = value; break;
      case "--min-coverage": args.minCoverage = parseInt(value, 10); break;
      default:
        console.error(`${c.red}Unknown option: ${arg}${c.reset}`);
        process.exit(2);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
${c.bold}Ordaze Scanner${c.reset} ${c.dim}v${VERSION}${c.reset}

${c.bold}Usage:${c.reset}
  ordaze-scan [options]
  npx @ordaze/scanner [options]

${c.bold}Options:${c.reset}
  --dir=PATH            Directory to scan (default: .)
  --platform=LANG       Language override: typescript, swift, kotlin, python, go, php, ruby, dart
  --token=TOKEN         API token for reporting (or ORDAZE_TOKEN env var)
  --url=URL             Ordaze base URL for reporting (or ORDAZE_URL env var)
  --source=SRC          Source slug for reporting (e.g., "ios", "backend")
  --repo=NAME           Repository name override
  --dry-run             Scan and print results without reporting
  --quiet               Minimal output
  --json                Output results as JSON
  --strict              Exit with code 1 if coverage below threshold
  --min-coverage=N      Minimum coverage percentage (used with --strict)
  --version, -v         Show version
  --help, -h            Show this help

${c.bold}Examples:${c.reset}
  ${c.dim}# Auto-detect language and scan${c.reset}
  ordaze-scan --dir=.

  ${c.dim}# Scan and report to Ordaze${c.reset}
  ordaze-scan --dir=. --token=atk_xxx --url=https://app.ordaze.com --source=web

  ${c.dim}# CI mode: fail if coverage < 80%${c.reset}
  ordaze-scan --dir=. --token=atk_xxx --url=https://app.ordaze.com --strict --min-coverage=80
`);
}

// Print results
function printResults(result: ScanResult, args: Args) {
  if (args.json) {
    console.log(JSON.stringify({
      version: VERSION,
      language: result.language?.language,
      confidence: result.language?.confidence,
      patterns: result.patterns.length,
      events: result.events.map((e) => ({
        name: e.name,
        occurrences: e.occurrences.length,
        firstLocation: e.occurrences[0] ? `${e.occurrences[0].filePath}:${e.occurrences[0].lineNumber}` : null,
      })),
      totalOccurrences: result.totalOccurrences,
      duration: result.duration,
      git: result.git,
    }, null, 2));
    return;
  }

  if (args.quiet) {
    console.log(JSON.stringify({
      language: result.language?.language,
      patterns: result.patterns.length,
      events: result.events.length,
      occurrences: result.totalOccurrences,
      duration: result.duration,
    }));
    return;
  }

  console.log();
  console.log(`${c.bold}Ordaze Scanner${c.reset} ${c.dim}v${VERSION}${c.reset}`);
  console.log(`${c.dim}${"─".repeat(50)}${c.reset}`);

  if (result.language) {
    console.log(`Language:    ${c.bold}${result.language.language}${c.reset} ${c.dim}(confidence: ${result.language.confidence}%, ${result.language.fileCount} files)${c.reset}`);
    if (result.language.markerFiles.length > 0) {
      console.log(`Markers:     ${c.dim}${result.language.markerFiles.join(", ")}${c.reset}`);
    }
  } else {
    console.log(`Language:    ${c.red}not detected${c.reset}`);
  }

  if (result.patterns.length > 0) {
    const patternInfo = result.patterns.map((p) => {
      const sdk = p.sdk ? ` (${p.sdk})` : "";
      const src = p.source === "import-follow" ? " [wrapper]" : "";
      return `${p.functionName}${sdk}${src}`;
    });
    console.log(`Patterns:    ${c.cyan}${patternInfo.join(", ")}${c.reset}`);
  }

  if (result.git.branch) console.log(`Branch:      ${c.dim}${result.git.branch}${c.reset}`);
  if (result.git.commitSha) console.log(`Commit:      ${c.dim}${result.git.commitSha.slice(0, 8)}${c.reset}`);
  if (result.git.repo) console.log(`Repo:        ${c.dim}${result.git.repo}${c.reset}`);
  console.log(`Duration:    ${c.dim}${result.duration}ms${c.reset}`);
  console.log();

  if (result.events.length === 0) {
    console.log(`${c.yellow}No tracking events found.${c.reset}`);
    console.log();
    return;
  }

  console.log(`${c.bold}Events found: ${result.events.length}${c.reset} ${c.dim}(${result.totalOccurrences} total occurrences)${c.reset}`);
  console.log();

  for (const event of result.events) {
    const firstOcc = event.occurrences[0];
    const extra = event.occurrences.length > 1
      ? ` ${c.dim}(+${event.occurrences.length - 1} more)${c.reset}`
      : "";
    console.log(`  ${c.green}✓${c.reset} ${event.name.padEnd(35)} ${c.dim}→ ${firstOcc.filePath}:${firstOcc.lineNumber}${c.reset}${extra}`);
  }

  console.log();
  console.log(`${c.dim}${"─".repeat(50)}${c.reset}`);
  console.log(`${c.bold}${c.green}${result.events.length} unique events${c.reset}, ${c.dim}${result.totalOccurrences} occurrences across the codebase${c.reset}`);
  console.log();
}

// Main
async function main() {
  const args = parseArgs();
  const dir = resolve(args.dir);

  const result = scan({
    dir,
    language: args.platform,
  });

  printResults(result, args);

  if (args.dryRun || result.events.length === 0) return;

  const token = args.token || process.env.ORDAZE_TOKEN;
  const url = (args.url || process.env.ORDAZE_URL)?.replace(/\/$/, "");

  if (!token || !url) {
    if (!args.quiet && !args.json) {
      console.log(`${c.dim}No --token/--url provided. Use --dry-run to scan without reporting.${c.reset}`);
    }
    return;
  }

  const source = args.source || args.platform || result.language?.language || "unknown";
  const payload = buildReportPayload(result, {
    source,
    repo: args.repo,
    scannerVersion: VERSION,
  });

  try {
    const data = await reportUsage(url, token, payload);
    if (!args.quiet && !args.json) {
      console.log(`${c.green}Reported to Ordaze ✓${c.reset}`);
      console.log(`  Matched: ${data.matched}, Missing: ${data.missing?.length || 0}, Unmatched: ${data.unmatched?.length || 0}`);
    }

    // Strict mode: check coverage threshold
    if (args.strict || args.minCoverage !== undefined) {
      const threshold = args.minCoverage ?? 0;
      const total = data.matched + (data.missing?.length || 0);
      const coverage = total > 0 ? Math.round((data.matched / total) * 100) : 0;

      if (!args.quiet && !args.json) {
        console.log(`  Coverage: ${coverage}%${threshold > 0 ? ` (threshold: ${threshold}%)` : ""}`);
      }

      if (coverage < threshold) {
        console.error(`${c.red}Coverage ${coverage}% is below minimum ${threshold}%${c.reset}`);
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(`${c.red}${(err as Error).message}${c.reset}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${c.red}Error:${c.reset}`, err.message);
  process.exit(1);
});
