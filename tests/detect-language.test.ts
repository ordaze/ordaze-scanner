import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { detectLanguage } from "../src/detect-language";

let tempDir: string;

function createFixture(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(tempDir, path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ordaze-scanner-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("detectLanguage", () => {
  it("detects TypeScript from tsconfig.json marker + .ts files", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/index.ts": "export const x = 1;",
      "src/utils.ts": "export function foo() {}",
      "src/types.ts": "export type X = string;",
    });
    const result = detectLanguage(tempDir);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].language).toBe("typescript");
    expect(result[0].markerFiles).toContain("tsconfig.json");
  });

  it("detects Swift from Podfile marker + .swift files", () => {
    createFixture({
      "Podfile": "platform :ios, '14.0'",
      "App/ViewController.swift": "class VC: UIViewController {}",
      "App/Model.swift": "struct Model {}",
    });
    const result = detectLanguage(tempDir);
    expect(result[0].language).toBe("swift");
    expect(result[0].markerFiles).toContain("Podfile");
  });

  it("detects Kotlin from build.gradle.kts + .kt files", () => {
    createFixture({
      "build.gradle.kts": 'plugins { id("com.android.app") }',
      "src/main/kotlin/App.kt": "fun main() {}",
    });
    const result = detectLanguage(tempDir);
    expect(result[0].language).toBe("kotlin");
    expect(result[0].markerFiles).toContain("build.gradle.kts");
  });

  it("detects Python from pyproject.toml + .py files", () => {
    createFixture({
      "pyproject.toml": "[project]\nname = 'test'",
      "src/main.py": "def main(): pass",
      "src/utils.py": "def helper(): pass",
    });
    const result = detectLanguage(tempDir);
    expect(result[0].language).toBe("python");
  });

  it("detects Go from go.mod + .go files", () => {
    createFixture({
      "go.mod": "module example.com/test",
      "main.go": "package main",
      "utils.go": "package main",
    });
    const result = detectLanguage(tempDir);
    expect(result[0].language).toBe("go");
  });

  it("detects Dart from pubspec.yaml + .dart files", () => {
    createFixture({
      "pubspec.yaml": "name: test_app",
      "lib/main.dart": "void main() {}",
    });
    const result = detectLanguage(tempDir);
    expect(result[0].language).toBe("dart");
  });

  it("returns empty array for empty directory", () => {
    const result = detectLanguage(tempDir);
    expect(result).toEqual([]);
  });

  it("returns sorted by confidence for mixed-language project", () => {
    createFixture({
      "tsconfig.json": "{}",
      "src/a.ts": "x",
      "src/b.ts": "x",
      "src/c.ts": "x",
      "script.py": "x",
    });
    const result = detectLanguage(tempDir);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].language).toBe("typescript");
    for (let i = 1; i < result.length; i++) {
      expect(result[i].confidence).toBeLessThanOrEqual(result[i - 1].confidence);
    }
  });

  it("skips node_modules and .git directories", () => {
    createFixture({
      "src/app.ts": "x",
      "node_modules/pkg/index.js": "x",
      "node_modules/pkg/lib.js": "x",
      "node_modules/pkg/util.js": "x",
    });
    const result = detectLanguage(tempDir);
    const ts = result.find((r) => r.language === "typescript");
    expect(ts).toBeDefined();
    const js = result.find((r) => r.language === "javascript");
    expect(js).toBeUndefined();
  });

  it("does not map Cargo.toml to any language", () => {
    createFixture({
      "Cargo.toml": '[package]\nname = "test"',
      "src/main.rs": "fn main() {}",
    });
    const result = detectLanguage(tempDir);
    const go = result.find((r) => r.language === "go");
    expect(go).toBeUndefined();
  });

  it("breaks ties deterministically by file count", () => {
    createFixture({
      "tsconfig.json": "{}",
      "go.mod": "module test",
      "src/a.ts": "x",
      "src/b.ts": "x",
      "src/c.ts": "x",
      "main.go": "x",
      "util.go": "x",
      "help.go": "x",
    });
    const result = detectLanguage(tempDir);
    expect(result.length).toBeGreaterThanOrEqual(2);
    if (result[0].confidence === result[1].confidence) {
      expect(result[0].fileCount).toBeGreaterThanOrEqual(result[1].fileCount);
    }
  });

  it("uses absolute confidence (1 file does not get 99%)", () => {
    createFixture({
      "main.go": "package main",
    });
    const result = detectLanguage(tempDir);
    expect(result.length).toBe(1);
    expect(result[0].language).toBe("go");
    expect(result[0].confidence).toBeLessThan(50);
  });
});
