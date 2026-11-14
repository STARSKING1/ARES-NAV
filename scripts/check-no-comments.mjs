import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const targets = ["src", "scripts", "vite.config.ts"];
const checkedExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".glsl"]);
const quoteCharacters = new Set(["'", '"', "`"]);

const listFiles = (target) => {
  if (statSync(target).isFile()) return [target];
  return readdirSync(target).flatMap((entry) => listFiles(join(target, entry)));
};

const containsComment = (source) => {
  let activeQuote = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (activeQuote !== null) {
      if (character === "\\") index += 1;
      else if (character === activeQuote) activeQuote = null;
      continue;
    }
    if (quoteCharacters.has(character)) {
      activeQuote = character;
      continue;
    }
    const next = source[index + 1];
    if (character === "/" && (next === "/" || next === "*")) return true;
  }
  return false;
};

const offenders = targets
  .flatMap(listFiles)
  .filter((file) => checkedExtensions.has(extname(file)))
  .filter((file) => containsComment(readFileSync(file, "utf8")));

if (offenders.length > 0) {
  process.stderr.write(`Comments found in:\n${offenders.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("No comments found.\n");
