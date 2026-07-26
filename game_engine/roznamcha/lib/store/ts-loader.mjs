/**
 * Tiny Node module-resolution hook so selftest.mjs can `import` the project's
 * TypeScript sources directly, the same way Next's bundler does (extensionless
 * relative imports resolving to a sibling .ts file), without needing ts-node
 * or a build step.
 *
 * Node 22's native TypeScript support strips *type* syntax but does not
 * change ESM's extension-resolution rules, so `import "../types"` from a
 * .ts file fails under plain `node` even though it works fine once bundled
 * by Next (webpack/SWC resolve extensionless specifiers). This hook plugs
 * that one gap for local testing only; it is never imported by app code.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const CANDIDATE_EXT = [".ts", ".mts", ".tsx", "/index.ts"];
// Mirrors tsconfig.json's `"paths": { "@/*": ["./*"] }` at the repo root,
// which Next's bundler understands natively but plain `node` does not.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function resolveWithExt(base) {
  for (const ext of CANDIDATE_EXT) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(REPO_ROOT, specifier.slice(2));
    const hit = existsSync(base) ? base : resolveWithExt(base);
    if (hit) return nextResolve(pathToFileURL(hit).href, context);
  }

  if (specifier.startsWith(".") && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    const hit = resolveWithExt(base);
    if (hit) return nextResolve(pathToFileURL(hit).href, context);
  }

  return nextResolve(specifier, context);
}
