import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The repository root (the folder holding package.json), found by walking up from this file. It works both when running
 * TypeScript directly (src/infrastructure/…) and from the compiled build (dist/src/infrastructure/…), so `public/` and
 * `db/` are always found next to package.json rather than relative to wherever the code was compiled.
 */
function findProjectRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(directory, "package.json"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) throw new Error("Could not find the project root (no package.json above this file)");
    directory = parent;
  }
}

export const projectRoot = findProjectRoot();
export const projectPath = (...segments: string[]): string => join(projectRoot, ...segments);
