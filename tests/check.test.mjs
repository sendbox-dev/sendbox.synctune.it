import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkContrast, checkSite, contrast, inspectPage } from "../scripts/check.mjs";

const page = (body, { title = "Page", canonical = "https://sendbox.synctune.it/" } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><link rel="canonical" href="${canonical}"></head>
<body><a class="skip-link" href="#main">Skip</a><nav aria-label="Main"><a href="./">Home</a></nav>
<main id="main"><h1 id="top">Title</h1>${body}</main></body></html>`;

test("a well-formed page has no structural problems", () => {
  assert.deepEqual(inspectPage(page('<h2 id="a">A</h2><img src="x.svg" alt=""><a href="#a">Jump</a>'), "index.html").problems, []);
});

test("structure and accessibility problems are reported", () => {
  const html = page('<h3>Skipped</h3><img src="x.svg"><a href="#top"><img src="y.svg" alt=""></a><span id="top"></span><div tabindex="2"></div><nav><a href="./">Again</a></nav>');
  const problems = inspectPage(html, "index.html").problems.join("\n");
  assert.match(problems, /heading jumps from h1 to h3/);
  assert.match(problems, /image x\.svg has no alt attribute/);
  assert.match(problems, /link to #top has no accessible name/);
  assert.match(problems, /duplicate id "top"/);
  assert.match(problems, /positive tabindex 2/);
  assert.match(problems, /<nav> needs an aria-label/);
});

test("broken links, missing anchors, missing sitemap entries and third-party resources fail the site check", async () => {
  const directory = await mkdtemp(join(tmpdir(), "site-check-test-"));
  try {
    await mkdir(join(directory, "docs"), { recursive: true });
    await writeFile(join(directory, "index.html"), page('<a href="docs/">Docs</a> <a href="docs/#missing">Anchor</a> <a href="gone/">Gone</a> <a href="docs">Slash</a> <img src="https://cdn.example/x.png" alt="">'));
    await writeFile(join(directory, "docs/index.html"), page('<h2 id="here">Here</h2>', { title: "Docs", canonical: "https://sendbox.synctune.it/docs/" }));
    await writeFile(join(directory, "sitemap.xml"), "<urlset><url><loc>https://sendbox.synctune.it/</loc></url></urlset>");
    await writeFile(join(directory, "robots.txt"), "Sitemap: https://sendbox.synctune.it/sitemap.xml\n");
    await writeFile(join(directory, "CNAME"), "sendbox.synctune.it\n");
    await writeFile(join(directory, ".nojekyll"), "");
    const { problems } = await checkSite(directory);
    assert.deepEqual(problems.sort(), [
      "index.html: broken link docs (add a trailing slash)",
      "index.html: broken link gone/",
      "index.html: loads a third-party resource https://cdn.example/x.png",
      "index.html: missing anchor docs/#missing",
      "sitemap.xml: missing docs/",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("theme colors below WCAG contrast are reported", () => {
  assert.equal(Math.round(contrast("#000000", "#FFFFFF")), 21);
  const css = ":root { --text: #777777; --bg: #888888; }";
  assert.match(checkContrast(css).join("\n"), /--text on --bg is 1\.\d\d:1, below 4\.5:1/);
});
