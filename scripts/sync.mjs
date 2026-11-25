// Copies the catalogued documents of SendBox and SendBox Fleet into vendor/, unchanged,
// from one exact upstream commit, and records it in vendor/<project>/SOURCE.json.
// Usage: node scripts/sync.mjs [sendbox|sendbox-fleet|all] [--ref <branch, tag or commit>]
// Needs network access to GitHub. Set GITHUB_TOKEN to raise the API rate limit.
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projects, upstreamFiles } from "./catalogue.mjs";
import { sha256 } from "./vendor.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const usage = "Usage: node scripts/sync.mjs [sendbox|sendbox-fleet|all] [--ref <branch, tag or commit>]";
const headers = {
  "User-Agent": "sendbox-website-sync",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

function options(argv) {
  let target = "all";
  let ref = "main";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--ref" && argv[index + 1]) ref = argv[++index];
    else if (["all", ...projects.map((project) => project.id)].includes(argv[index])) target = argv[index];
    else throw new Error(usage);
  }
  return { targets: projects.filter((project) => target === "all" || project.id === target), ref };
}

async function request(url, accept) {
  const response = await fetch(url, { headers: { ...headers, Accept: accept }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status} ${response.statusText}`);
  return response;
}

async function sync(project, ref, staged) {
  const api = `https://api.github.com/repos/${project.repo}`;
  const commit = await (await request(`${api}/commits/${encodeURIComponent(ref)}`, "application/vnd.github+json")).json();
  const files = {};
  const directory = await mkdtemp(join(root, ".vendor-sync-"));
  staged.push(directory);
  for (const file of [...new Set(upstreamFiles(project))]) {
    const response = await request(`https://raw.githubusercontent.com/${project.repo}/${commit.sha}/${file}`, "*/*");
    const bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await writeFile(join(directory, file), bytes);
    files[file] = sha256(bytes);
  }
  const record = { repository: project.repo, ref, commit: commit.sha, committed: commit.commit.committer.date, files };
  await writeFile(join(directory, "SOURCE.json"), `${JSON.stringify(record, null, 2)}\n`);

  // Report Markdown documents upstream that the catalogue doesn't publish, so new docs aren't missed.
  const tree = await (await request(`${api}/git/trees/${commit.sha}?recursive=1`, "application/vnd.github+json")).json();
  const known = new Set(upstreamFiles(project));
  const unpublished = tree.tree
    .filter((entry) => entry.type === "blob" && /\.md$/.test(entry.path) && /^(?:[^/]+|docs\/.+)$/.test(entry.path) && !known.has(entry.path))
    .map((entry) => entry.path);
  return { directory, record, unpublished };
}

const staged = [];
try {
  const { targets, ref } = options(process.argv.slice(2));
  for (const project of targets) {
    const { directory, record, unpublished } = await sync(project, ref, staged);
    const target = join(root, "vendor", project.id);
    await mkdir(dirname(target), { recursive: true });
    await rm(target, { recursive: true, force: true });
    await rename(directory, target);
    staged.splice(staged.indexOf(directory), 1);
    console.log(`Synced ${Object.keys(record.files).length} files from ${project.repo}@${record.commit} (${ref}).`);
    if (unpublished.length) console.log(`  Not published (add to scripts/catalogue.mjs if they belong on the site): ${unpublished.join(", ")}`);
  }
  console.log("Next: node scripts/build.mjs, then review and commit the changes.");
} catch (error) {
  console.error(`Sync failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await Promise.all(staged.map((directory) => rm(directory, { recursive: true, force: true })));
}
