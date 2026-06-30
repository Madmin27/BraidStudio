import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadLibrary(rootDir = process.cwd()) {
  const dataDir = join(rootDir, "data");
  const [machines, recipes, patternCatalog, recipeScenarios] = await Promise.all([
    loadJsonDirectory(join(dataDir, "machines")),
    loadJsonDirectory(join(dataDir, "recipes")),
    loadJsonFile(join(dataDir, "patterns", "signature_catalog.json"), {}),
    loadJsonFile(join(dataDir, "patterns", "recipe_scenarios.json"), {})
  ]);

  return {
    machines,
    recipes,
    patternSignatures: patternCatalog.patternSignatures || {},
    patternScenarios: recipeScenarios.patternLibrary || []
  };
}

async function loadJsonDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(files.map((file) => loadJsonFile(join(dir, file))));
}

async function loadJsonFile(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (fallback !== null) return fallback;
    throw Object.assign(new Error(`invalid_json:${path}`), { cause: error });
  }
}
