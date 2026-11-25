// Checks the website with Node built-ins only:
// - vendored documents match SOURCE.json and the generated pages are up to date;
// - every local link, image and anchor resolves, and the sitemap matches the pages;
// - each page has the expected structure and accessibility basics (language, title, one h1,
//   heading order, alt text, link names, unique ids, labelled landmarks, skip link);
// - no scripts or third-party resources load, and the theme colors meet WCAG contrast.
// Usage: node scripts/check.mjs [--site <packaged directory>] [--external]
//   --site      check an already packaged site (default: package into a temporary directory)
//   --external  also request every external URL (needs network access)
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { site } from "./catalogue.mjs";
import { buildSite, compareBuild } from "./build.mjs";
import { decodeEntities, plainText } from "./markdown.mjs";
import { packageSite } from "./package.mjs";

const local = "https://local.invalid/";

function parseAttributes(source = "") {
  const values = {};
  for (const match of source.matchAll(/([a-zA-Z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    values[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return values;
}

function tags(html, name) {
  const pattern = new RegExp(`<${name}\\b([^<>]*)>`, "gi");
  return [...html.matchAll(pattern)].map((match) => parseAttributes(match[1]));
}

// Checks one page's structure and accessibility basics. Returns its ids, references and problems.
export function inspectPage(html, path) {
  const problems = [];
  const report = (message) => problems.push(`${path}: ${message}`);
  const ids = new Set();
  for (const { id } of tags(html, "[a-z][a-z0-9]*").filter((attributes) => "id" in attributes)) {
    if (ids.has(id)) report(`duplicate id "${id}"`);
    ids.add(id);
  }
  if (!tags(html, "html")[0]?.lang) report("<html> has no lang attribute");
  if (!/<title>[^<]*\S[^<]*<\/title>/.test(html)) report("missing or empty <title>");
  const viewport = tags(html, "meta").find((meta) => meta.name === "viewport");
  if (!viewport) report("missing viewport meta tag");
  else if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?(?!\d)/.test(viewport.content)) report("viewport blocks zooming");
  if (/<script\b/i.test(html)) report("loads a script; the site promises no JavaScript");
  if ((html.match(/<main\b/g) ?? []).length !== 1) report("needs exactly one <main>");
  if ((html.match(/<h1\b/g) ?? []).length !== 1) report("needs exactly one <h1>");
  let previous = 0;
  for (const match of html.matchAll(/<h([1-6])\b/g)) {
    const level = Number(match[1]);
    if (level > previous + 1) report(`heading jumps from h${previous || "(none)"} to h${level}`);
    previous = level;
  }
  for (const image of tags(html, "img")) if (!("alt" in image)) report(`image ${image.src} has no alt attribute`);
  for (const match of html.matchAll(/<a\b([^<>]*)>([\s\S]*?)<\/a>/g)) {
    const attributes = parseAttributes(match[1]);
    if (!("href" in attributes)) continue;
    const name = attributes["aria-label"] ?? plainText(match[2].replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/g, " $1 "));
    if (!name.trim()) report(`link to ${attributes.href} has no accessible name`);
  }
  for (const element of tags(html, "[a-z][a-z0-9]*")) {
    if (Number(element.tabindex) > 0) report(`positive tabindex ${element.tabindex}`);
  }
  for (const landmark of ["nav", "aside"]) {
    const labels = tags(html, landmark).map((attributes) => attributes["aria-label"] ?? attributes["aria-labelledby"]);
    if (labels.length > 1 || landmark === "aside") {
      for (const label of labels) if (!label) report(`<${landmark}> needs an aria-label`);
      const unique = new Set(labels);
      if (unique.size !== labels.length) report(`<${landmark}> labels must be unique`);
    }
  }
  if (/<nav\b/.test(html)) {
    const first = /<body\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<a\b([^<>]*)>/.exec(html);
    if (!first || parseAttributes(first[1]).href !== "#main") report("the first link must skip to #main");
    if (!/<main\b[^>]*\bid="main"/.test(html)) report('<main> needs id="main" for the skip link');
  }
  for (const table of html.matchAll(/<table\b[\s\S]*?<\/table>/g)) {
    if (!/<th\b/.test(table[0])) report("a table has no header cells");
  }
  const references = [];
  for (const [name, attribute] of [["a", "href"], ["link", "href"], ["img", "src"], ["source", "srcset"]]) {
    for (const attributes of tags(html, name)) {
      if (attribute in attributes) references.push({ tag: name, rel: attributes.rel ?? "", url: attributes[attribute] });
    }
  }
  return { ids, references, problems };
}

async function publishedFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => posix.join(posix.relative(directory, entry.parentPath).split("\\").join("/"), entry.name));
}

const pageUrl = (file) => file.replace(/(^|\/)index\.html$/, "$1");

// Checks every published page, link and anchor in a packaged site directory.
export async function checkSite(directory) {
  const problems = [];
  const files = new Set(await publishedFiles(directory));
  const pages = new Map();
  for (const file of [...files].filter((path) => path.endsWith(".html")).sort()) {
    const html = await readFile(join(directory, file), "utf8");
    const inspected = inspectPage(html, file);
    problems.push(...inspected.problems);
    pages.set(file, { html, ...inspected });
  }
  const titles = new Map();
  for (const [file, { html }] of pages) {
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
    if (title && titles.has(title)) problems.push(`${file}: title "${title}" is also used by ${titles.get(title)}`);
    titles.set(title, file);
    if (file === "404.html") continue;
    const canonical = tags(html, "link").find((link) => link.rel === "canonical")?.href;
    if (canonical !== `${site.origin}/${pageUrl(file)}`) problems.push(`${file}: canonical URL should be ${site.origin}/${pageUrl(file)}`);
  }

  const externals = new Map();
  for (const [file, { references }] of pages) {
    for (const { tag, rel, url: raw } of references) {
      if (rel === "canonical" || /^(?:mailto|tel):/i.test(raw)) continue;
      const url = raw.startsWith(`${site.origin}/`) ? `/${raw.slice(site.origin.length + 1)}` : raw;
      if (/^https?:/i.test(url)) {
        if (tag !== "a") problems.push(`${file}: loads a third-party resource ${url}`);
        if (!externals.has(url)) externals.set(url, []);
        externals.get(url).push(file);
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) {
        problems.push(`${file}: unsupported link ${url}`);
        continue;
      }
      const resolved = new URL(url, url.startsWith("/") ? local : `${local}${file}`);
      let target = decodeURIComponent(resolved.pathname.slice(1));
      if (target === "" || target.endsWith("/")) target += "index.html";
      if (!files.has(target)) {
        const hint = files.has(`${target}/index.html`) ? " (add a trailing slash)" : /\.md$/.test(target) ? " (a Markdown source link)" : "";
        problems.push(`${file}: broken link ${raw}${hint}`);
        continue;
      }
      if (resolved.hash) {
        const id = decodeURIComponent(resolved.hash.slice(1));
        if (!pages.get(target)?.ids.has(id)) problems.push(`${file}: missing anchor ${raw}`);
      }
    }
  }

  const sitemap = await readFile(join(directory, "sitemap.xml"), "utf8").catch(() => "");
  const listed = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
  for (const file of pages.keys()) {
    if (file !== "404.html" && !listed.has(`${site.origin}/${pageUrl(file)}`)) problems.push(`sitemap.xml: missing ${pageUrl(file) || "/"}`);
  }
  for (const loc of listed) {
    const path = loc.slice(site.origin.length + 1);
    if (!loc.startsWith(`${site.origin}/`) || !pages.has(`${path}index.html`)) problems.push(`sitemap.xml: ${loc} is not a page`);
  }
  const robots = await readFile(join(directory, "robots.txt"), "utf8").catch(() => "");
  if (!robots.includes(`Sitemap: ${site.origin}/sitemap.xml`)) problems.push("robots.txt: missing the sitemap URL");
  const cname = (await readFile(join(directory, "CNAME"), "utf8").catch(() => "")).trim();
  if (cname !== new URL(site.origin).hostname) problems.push(`CNAME: expected ${new URL(site.origin).hostname}, found "${cname}"`);
  if (!files.has(".nojekyll")) problems.push(".nojekyll is missing");
  return { problems, externals, pages: pages.size };
}

function luminance(hex) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((digit) => digit + digit).join("") : value;
  const [red, green, blue] = [0, 2, 4].map((offset) => {
    const channel = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

// Foreground and background custom properties used together in the stylesheet.
const textPairs = [
  ["--text", "--bg"], ["--text", "--surface"], ["--text", "--code-bg"],
  ["--muted", "--bg"], ["--muted", "--surface"],
  ["--link", "--bg"], ["--link", "--surface"],
  ["--code-text", "--code-bg"],
  ["--hero-text", "--hero-bg"], ["--hero-muted", "--hero-bg"], ["--hero-accent", "--hero-bg"],
  ["--button-text", "--button-bg"],
  ["--terminal-text", "--terminal-bg"], ["--terminal-muted", "--terminal-bg"], ["--hero-accent", "--terminal-bg"],
];
const focusPairs = [["--focus", "--bg"], ["--focus", "--surface"], ["--hero-accent", "--hero-bg"]];

function variables(block) {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((match) => [match[1], match[2]]));
}

export function checkContrast(css) {
  const light = variables(/:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "");
  const darkBlock = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1];
  const themes = { light, dark: { ...light, ...variables(darkBlock ?? "") } };
  const problems = [];
  for (const [theme, colors] of Object.entries(themes)) {
    for (const [pairs, minimum] of [[textPairs, 4.5], [focusPairs, 3]]) {
      for (const [foreground, background] of pairs) {
        if (!colors[foreground] || !colors[background]) {
          problems.push(`styles.css (${theme}): ${foreground} or ${background} is not a hex color variable`);
          continue;
        }
        const ratio = contrast(colors[foreground], colors[background]);
        if (ratio < minimum) problems.push(`styles.css (${theme}): ${foreground} on ${background} is ${ratio.toFixed(2)}:1, below ${minimum}:1`);
      }
    }
  }
  return problems;
}

async function status(url) {
  for (const method of ["HEAD", "GET"]) {
    const response = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "sendbox-website-link-check" } });
    await response.body?.cancel();
    if (method === "HEAD" && [403, 404, 405, 501].includes(response.status)) continue;
    return response.status;
  }
}

async function checkExternal(externals) {
  const problems = [];
  const warnings = [];
  const urls = [...externals.keys()];
  for (let index = 0; index < urls.length; index += 8) {
    await Promise.all(urls.slice(index, index + 8).map(async (url) => {
      const from = externals.get(url).slice(0, 3).join(", ");
      try {
        const code = await status(url);
        if (code === 429) warnings.push(`${url} was rate limited (linked from ${from})`);
        else if (code < 200 || code >= 400) problems.push(`${url} returned ${code} (linked from ${from})`);
      } catch (error) {
        problems.push(`${url} failed: ${error.cause?.code ?? error.name} (linked from ${from})`);
      }
    }));
  }
  for (const warning of warnings) console.warn(`Warning: ${warning}`);
  console.log(`Requested ${urls.length} external URLs.`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const args = process.argv.slice(2);
  const siteIndex = args.indexOf("--site");
  let directory = siteIndex >= 0 ? resolve(args[siteIndex + 1] ?? "") : null;
  let temporary = null;
  const problems = [];
  try {
    try {
      const differences = await compareBuild(root, await buildSite(root));
      if (differences.length) problems.push(`Generated files are out of date. Run node scripts/build.mjs and commit the result:\n  ${differences.join("\n  ")}`);
    } catch (error) {
      problems.push(error.message);
    }
    if (!directory) {
      temporary = await mkdtemp(join(tmpdir(), "sendbox-site-"));
      await packageSite(root, temporary);
      directory = temporary;
    }
    const result = await checkSite(directory);
    problems.push(...result.problems);
    problems.push(...checkContrast(await readFile(join(directory, "assets/styles.css"), "utf8")));
    if (args.includes("--external")) problems.push(...await checkExternal(result.externals));
    console.log(`Checked ${result.pages} pages and ${result.externals.size} distinct external links.`);
  } catch (error) {
    problems.push(`Check failed: ${error.message}`);
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
  if (problems.length) {
    console.error(`${problems.length} problem(s):\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("All checks passed.");
  }
}
