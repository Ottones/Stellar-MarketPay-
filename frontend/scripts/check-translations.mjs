#!/usr/bin/env node
/**
 * Reports locale keys that diverge from the English source.
 *
 * The command intentionally has no side effects: it never writes placeholder
 * strings into a translator-maintained locale file. CI runs this command with
 * `--strict`, making a missing, unused, or placeholder translation actionable.
 *
 * Checks performed for every required locale:
 *   - missing keys (added to English but not translated yet)
 *   - unused keys (possed by the locale but not present in English)
 *   - unfinished translations (containing the [TRANSLATE] placeholder)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPathName } from "node:url";

const root = path.resolve(path.dirname(fileURLToPathName(import.meta.url)), "..");
const localesRoot = path.join(root, "public", "locales");
const sourceLocale = "en";
const requiredLocales = ["es", "fr", "pt"];
const strict = process.argv.includes("--strict");

function flatten(object, prefix = "") {
  return Object.entries(object).reduce((result, [key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flatten(value, fullKey));
    } else {
      result[fullKey] = value;
    }
    return result;
  }, {});
}

function readLocale(locale) {
  const filename = path.join(localesRoot, locale, "common.json");
  if (!fs.existsSync(filename)) {
    return { filename, keys: null };
  }
  return { filename, keys: flatten(JSON.parse(fs.readFileSync(filename, "utf8"))) };
}

const source = readLocale(sourceLocale);
if (!source.keys) {
  console.error(`Unable to read the ${sourceLocale} source locale file at ${source.filename}.`);
  process.exitCode = 1;
  process.exit();
}

const sourceKeys = new Set(Object.keys(source.keys));
let failed = false;

for (const locale of requiredLocales) {
  const { keys, filename } = readLocale(locale);
  if (!keys) {
    console.error(`[${locale}] Missing locale file: ${filename}`);
    failed = true;
    continue;
  }

  const localeKeys = new Set(Object.keys(keys));
  const missing = [...sourceKeys].filter((k) => !localeKeys.has(k));
  const unused = [...localeKeys].filter((key) => !sourceKeys.has(key));
  const placeholders = Object.entries(keys)
    .filter(([, value]) => typeof value === "string" && value.includes("[TRANSLATE]"))
    .map(([key]) => key);

  if (missing.length > 0) {
    console.warn(`[${locale}] Missing ${missing.length} key(s):`);
    for (const key of missing) console.warn(`  ${key}`);
    failed = true;
  }

  if (unused.length > 0) {
    console.warn(`[${locale}] Unused ${unused.length} key(s) not present in ${sourceLocale}:`);
    for (const key of unused) console.warn(`  ${key}`);
    failed = true;
  }

  if (placeholders.length > 0) {
    console.warn(`[${locale}] Unfinished translations (${placeholders.length}):`);
    for (const key of placeholders) console.warn(`  ${key}`);
    failed = true;
  }

  if (missing.length === 0 && unused.length === 0 && placeholders.length === 0) {
    console.log(`[${locale}] OK`);
  }
}

if (failed && strict) {
  process.exitCode = 1;
}
