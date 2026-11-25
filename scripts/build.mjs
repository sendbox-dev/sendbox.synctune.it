// Generates the documentation pages, logos, sitemap and the shared header and footer of the
// hand-written pages from vendor/ and the catalogue. Node built-ins only.
// Usage: node scripts/build.mjs           write the generated files
//        node scripts/build.mjs --check   fail if any generated file is missing or out of date
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { formerOwners, pagesOf, projects } from "./catalogue.mjs";
import { docPage, footer, header, pagePath, projectIndex, relative, sitemap } from "./layout.mjs";
import { renderMarkdown } from "./markdown.mjs";
import { readVendor } from "./vendor.mjs";

// Hand-written pages whose <!-- build:header --> and <!-- build:footer --> regions the build refreshes.
export const handwritten = [
  { file: "index.html", directory: "" },
  { file: "contribute/index.html", directory: "contribute/" },
];

// Directories and files the build owns completely. Anything else in them is removed.
const generatedDirectories = ["sendbox", "fleet", "assets/logos"];

const findPage = (project, upstream) => pagesOf(project).find((page) => page.upstream === upstream);

// Maps a link in an upstream document to its published page, or to GitHub at the synced commit.
export function resolveDocLink(href, { project, upstream, commit, directory }) {
  if (href.startsWith("#")) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
    const github = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)(.*)$/.exec(href);
    const target = github && [...formerOwners, "sendbox-dev"].includes(github[1])
      ? projects.find((candidate) => candidate.repo.split("/")[1] === github[2].replace(/\.git$/, ""))
      : null;
    if (!target) return href;
    const blob = /^\/(?:blob|tree)\/main\/([^#?]*)(#.*)?$/.exec(github[3]);
    const page = blob && findPage(target, blob[1]);
    if (page) return relative(directory, pagePath(target, page)) + (blob[2] ?? "");
    return `https://github.com/${target.repo}${github[3]}`;
  }
  const [, path, suffix = ""] = /^([^#?]*)([#?].*)?$/.exec(href);
  if (!path) return suffix;
  const resolved = posix.normalize(posix.join(posix.dirname(upstream), decodeURI(path)));
  if (resolved.startsWith("../")) throw new Error(`${project.repo}/${upstream} links outside the repository: ${href}`);
  const page = findPage(project, resolved.replace(/\/$/, ""));
  if (page) return relative(directory, pagePath(project, page)) + suffix;
  if (resolved === project.logo.upstream) return relative(directory, project.logo.file);
  const kind = path.endsWith("/") ? "tree" : "blob";
  return `https://github.com/${project.repo}/${kind}/${commit}/${resolved.replace(/\/$/, "")}${suffix}`;
}

function resolveImage(src, context) {
  const resolved = resolveDocLink(src, context);
  if (/^[a-z][a-z0-9+.-]*:/i.test(resolved)) {
    throw new Error(`${context.project.repo}/${context.upstream} shows an image that isn't bundled: ${src}. Add it to the catalogue so the site loads no third-party resources.`);
  }
  return resolved;
}

function refreshRegions(html, directory, file) {
  let output = html;
  for (const [name, content] of [["header", header(directory)], ["footer", footer(directory)]]) {
    const pattern = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
    if (!pattern.test(output)) throw new Error(`${file} is missing its <!-- build:${name} --> region.`);
    output = output.replace(pattern, `$1\n${content}\n$2`);
  }
  return output;
}

// Returns every generated file as a Map of repository path to contents.
export async function buildSite(root) {
  const files = new Map();
  const paths = [""];
  for (const project of projects) {
    const record = await readVendor(root, project);
    const pages = pagesOf(project);
    paths.push(`${project.route}/`);
    pages.forEach((page, position) => {
      const directory = pagePath(project, page);
      const context = { project, upstream: page.upstream, commit: record.commit, directory };
      const rendered = renderMarkdown(record.contents.get(page.upstream).toString("utf8"), {
        resolveLink: (href) => resolveDocLink(href, context),
        resolveImage: (src) => resolveImage(src, context),
        sourceUrl: `https://github.com/${project.repo}/blob/${record.commit}/${page.upstream}`,
      });
      files.set(`${directory}index.html`, docPage({ project, page, record, rendered, previous: pages[position - 1], next: pages[position + 1] }));
      paths.push(directory);
    });
    files.set(`${project.route}/index.html`, projectIndex({ project, record }));
    files.set(project.logo.file, record.contents.get(project.logo.upstream));
  }
  files.set("assets/favicon.svg", files.get(projects[0].logo.file));
  for (const { file, directory } of handwritten) {
    files.set(file, refreshRegions(await readFile(join(root, file), "utf8"), directory, file));
  }
  paths.push("contribute/");
  files.set("sitemap.xml", sitemap(paths));
  return files;
}

async function listFiles(root, directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true, recursive: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile()).map((entry) => posix.join(posix.relative(root, entry.parentPath).split("\\").join("/"), entry.name));
}

// Compares the generated files with the working tree. Returns the out-of-date paths.
export async function compareBuild(root, files) {
  const differences = [];
  for (const [path, content] of files) {
    const existing = await readFile(join(root, path)).catch(() => null);
    if (!existing || !existing.equals(Buffer.from(content))) differences.push(path);
  }
  for (const directory of generatedDirectories) {
    for (const path of await listFiles(root, directory)) {
      if (!files.has(path)) differences.push(`${path} (not generated, remove it)`);
    }
  }
  return differences;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  try {
    const files = await buildSite(root);
    const differences = await compareBuild(root, files);
    if (process.argv.includes("--check")) {
      if (differences.length) {
        console.error(`Generated files are out of date. Run node scripts/build.mjs and commit the result:\n  ${differences.join("\n  ")}`);
        process.exitCode = 1;
      } else {
        console.log(`All ${files.size} generated files are up to date.`);
      }
    } else {
      for (const directory of generatedDirectories) {
        for (const path of await listFiles(root, directory)) if (!files.has(path)) await rm(join(root, path));
      }
      for (const [path, content] of files) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), content);
      }
      console.log(`Built ${files.size} files (${differences.length} changed).`);
    }
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
