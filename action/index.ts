import * as core from "@actions/core";
import { resolve } from "path";
import { scan } from "../src/scan";
import { buildReportPayload, reportUsage } from "../src/report";
import type { Language } from "../src/types";

const VERSION = process.env.PACKAGE_VERSION || "1.0.0";

async function run(): Promise<void> {
  try {
    const token = core.getInput("token", { required: true });
    const url = core.getInput("url", { required: true }).replace(/\/$/, "");
    const dir = resolve(core.getInput("dir") || ".");
    const platform = core.getInput("platform") || core.getInput("source") || undefined;
    const strict = core.getInput("strict") === "true";
    const minCoverageStr = core.getInput("min-coverage");
    const minCoverage = minCoverageStr ? parseInt(minCoverageStr, 10) : undefined;

    core.info(`Scanning ${dir}...`);

    const result = scan({
      dir,
      language: platform as Language | undefined,
    });

    if (result.language) {
      core.info(`Detected: ${result.language.language} (${result.language.confidence}% confidence)`);
    }

    core.info(`Found ${result.events.length} unique events (${result.totalOccurrences} occurrences)`);
    core.setOutput("events", result.events.length.toString());

    if (result.events.length === 0) {
      core.info("No tracking events found.");
      core.setOutput("matched", "0");
      core.setOutput("missing", "0");
      core.setOutput("unmatched", "0");
      core.setOutput("coverage", "0");
      return;
    }

    const source = platform || result.language?.language || "unknown";
    const payload = buildReportPayload(result, {
      source,
      scannerVersion: VERSION,
    });

    const data = await reportUsage(url, token, payload);

    core.info(`Reported: matched=${data.matched}, missing=${data.missing?.length || 0}, unmatched=${data.unmatched?.length || 0}`);

    core.setOutput("matched", data.matched.toString());
    core.setOutput("missing", (data.missing?.length || 0).toString());
    core.setOutput("unmatched", (data.unmatched?.length || 0).toString());

    const total = data.matched + (data.missing?.length || 0);
    const coverage = total > 0 ? Math.round((data.matched / total) * 100) : 0;
    core.setOutput("coverage", coverage.toString());

    // Job summary
    core.summary
      .addHeading("Ordaze Scanner Results")
      .addTable([
        [{ data: "Metric", header: true }, { data: "Value", header: true }],
        ["Language", result.language?.language || "unknown"],
        ["Events found", result.events.length.toString()],
        ["Matched", data.matched.toString()],
        ["Missing", (data.missing?.length || 0).toString()],
        ["Unmatched", (data.unmatched?.length || 0).toString()],
        ["Coverage", `${coverage}%`],
      ]);
    await core.summary.write();

    // Strict mode
    if (strict || minCoverage !== undefined) {
      const threshold = minCoverage ?? 0;
      if (coverage < threshold) {
        core.setFailed(`Coverage ${coverage}% is below minimum ${threshold}%`);
      }
    }
  } catch (error) {
    core.setFailed((error as Error).message);
  }
}

run();
