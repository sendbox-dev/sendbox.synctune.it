import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDocLink } from "../scripts/build.mjs";
import { projects } from "../scripts/catalogue.mjs";
import { renderMarkdown } from "../scripts/markdown.mjs";

const render = (markdown, options) => renderMarkdown(markdown, options).html;

test("heading anchors match GitHub, including repeats and code spans", () => {
  const { headings, title } = renderMarkdown("# Title\n\n## `sendbox run` flags\n\n## Apple 1.7.1 & Kata\n\n## Apple 1.7.1 & Kata\n");
  assert.equal(title.text, "Title");
  assert.deepEqual(headings.map((heading) => heading.id), ["sendbox-run-flags", "apple-171--kata", "apple-171--kata-1"]);
});

test("a README logo before the title is dropped and the title is returned separately", () => {
  const { title, html } = renderMarkdown('<img src="docs/assets/logo.svg" alt="Logo">\n\n# SendBox\n\nBody.\n');
  assert.equal(title.html, "SendBox");
  assert.equal(html, "<p>Body.</p>");
});

test("tight and loose lists, nested lists and fences inside items", () => {
  assert.equal(render("- one\n- two\n  - nested\n"), "<ul>\n<li>one</li>\n<li>two\n<ul>\n<li>nested</li>\n</ul></li>\n</ul>");
  assert.equal(render("1. one\n\n2. two\n"), "<ol>\n<li><p>one</p></li>\n<li><p>two</p></li>\n</ol>");
  assert.equal(render("- run:\n\n  ```bash\n  make\n  ```\n"), '<ul>\n<li><p>run:</p>\n<pre tabindex="0"><code class="language-bash">make</code></pre></li>\n</ul>');
  assert.equal(render("3. three\n4. four\n"), '<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>');
});

test("lazy continuation lines stay in the list item", () => {
  assert.equal(render("- first line\nsecond line\n\nAfter.\n"), "<ul>\n<li>first line\nsecond line</li>\n</ul>\n<p>After.</p>");
});

test("tables keep escaped pipes and alignment", () => {
  const html = render("## Flags\n\n| Flag | Values |\n|:--|--:|\n| `a\\|b` | x |\n");
  assert.match(html, /<th scope="col" class="align-left">Flag<\/th><th scope="col" class="align-right">Values<\/th>/);
  assert.match(html, /<td class="align-left"><code>a\|b<\/code><\/td>/);
  assert.match(html, /role="group" aria-label="Flags table" tabindex="0"/);
});

test("emphasis ignores snake_case and code, and raw HTML is escaped", () => {
  assert.equal(render("**bold** and *em* in snake_case_name `*not*`"), "<p><strong>bold</strong> and <em>em</em> in snake_case_name <code>*not*</code></p>");
  assert.equal(render("Use <version> and <script>alert(1)</script>"), "<p>Use &lt;version&gt; and &lt;script&gt;alert(1)&lt;/script&gt;</p>");
  assert.equal(render('<a id="how"></a>\n\n## How\n'), '<span id="how"></span>\n<h2 id="how-1">How</h2>');
});

test("links resolve through the resolver, and mermaid blocks link to GitHub", () => {
  const html = render("[docs](docs/x.md#y) and <https://example.com>\n\n```mermaid\ngraph LR\n```\n", { resolveLink: (href) => `resolved:${href}`, sourceUrl: "https://github.com/o/r/blob/c/f.md" });
  assert.match(html, /<a href="resolved:docs\/x\.md#y">docs<\/a>/);
  assert.match(html, /<a href="resolved:https:\/\/example\.com">https:\/\/example\.com<\/a>/);
  assert.match(html, /<figure class="diagram">[\s\S]*<a href="https:\/\/github\.com\/o\/r\/blob\/c\/f\.md">View it rendered on GitHub<\/a>/);
});

test("document links map to published pages, or to GitHub at the synced commit", () => {
  const [sendbox, fleet] = projects;
  const context = { project: sendbox, upstream: "docs/installation.md", commit: "c0ffee", directory: "sendbox/installation/" };
  assert.equal(resolveDocLink("configuration.md#network-grants", context), "../configuration/#network-grants");
  assert.equal(resolveDocLink("../README.md", context), "../overview/");
  assert.equal(resolveDocLink("architecture/runtime-core.md", context), "../architecture/runtime-core/");
  assert.equal(resolveDocLink("../config/example-sandbox.yaml", context), "https://github.com/sendbox-dev/sendbox/blob/c0ffee/config/example-sandbox.yaml");
  assert.equal(resolveDocLink("#local", context), "#local");
  assert.equal(resolveDocLink("https://github.com/mbianchidev/sendbox/issues/87", context), "https://github.com/sendbox-dev/sendbox/issues/87");
  assert.equal(resolveDocLink("https://github.com/mbianchidev/homebrew-tap", context), "https://github.com/mbianchidev/homebrew-tap");
  const fleetContext = { project: fleet, upstream: "docs/architecture.md", commit: "c0ffee", directory: "fleet/architecture/" };
  assert.equal(resolveDocLink("https://github.com/mbianchidev/sendbox/blob/main/docs/architecture/governed-sessions.md#shared-governance-service", fleetContext), "../../sendbox/architecture/governed-sessions/#shared-governance-service");
  assert.throws(() => resolveDocLink("../../outside.md", context), /links outside the repository/);
});
