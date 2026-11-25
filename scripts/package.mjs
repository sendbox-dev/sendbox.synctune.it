// Copies exactly the published files into a directory for GitHub Pages.
// Usage: node scripts/package.mjs <output directory>
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Everything else (vendor/, scripts/, tests/, docs/, README.md, workflow files) stays unpublished.
export const published = ["index.html", "404.html", "robots.txt", "sitemap.xml", "CNAME", ".nojekyll", "assets", "sendbox", "fleet", "contribute"];

export async function packageSite(root, output) {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const entry of published) await cp(join(root, entry), join(output, entry), { recursive: true });
  const stray = (await readdir(output, { recursive: true })).filter((path) => /(^|\/)\.DS_Store$/.test(path));
  await Promise.all(stray.map((path) => rm(join(output, path))));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output) {
    console.error("Usage: node scripts/package.mjs <output directory>");
    process.exitCode = 1;
  } else {
    try {
      await packageSite(fileURLToPath(new URL("../", import.meta.url)), resolve(output));
      console.log(`Packaged the site into ${resolve(output)}.`);
    } catch (error) {
      console.error(`Packaging failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
