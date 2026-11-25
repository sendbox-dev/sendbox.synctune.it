// Shared page chrome and the generated documentation pages.
import { posix } from "node:path";
import { escapeHtml } from "./markdown.mjs";
import { pagesOf, site } from "./catalogue.mjs";

// Site paths are relative to the root: "" for the home page, "sendbox/" for a directory page,
// "assets/styles.css" for a file. Every link is relative so the site also works under a path prefix.
export function relative(fromDirectory, to) {
  const isDirectory = to === "" || to.endsWith("/");
  const path = posix.relative(fromDirectory.replace(/\/$/, "") || ".", to.replace(/\/$/, "") || ".");
  if (!path) return "./";
  return isDirectory ? `${path}/` : path;
}

export const pagePath = (project, page) => `${project.route}/${page.slug}/`;

const navigation = [
  { path: "sendbox/", label: "SendBox docs", section: "sendbox" },
  { path: "fleet/", label: "Fleet docs", section: "fleet" },
  { path: "contribute/", label: "Contribute", section: "contribute" },
];

export function header(directory) {
  const section = directory.split("/")[0];
  const links = navigation.map((item) => {
    const current = item.path === directory ? ' aria-current="page"' : item.section === section ? ' class="is-active"' : "";
    return `<li><a href="${relative(directory, item.path)}"${current}>${item.label}</a></li>`;
  });
  links.push(`<li><a href="${site.org}">GitHub</a></li>`);
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${relative(directory, "")}"${directory === "" ? ' aria-current="page"' : ""}><img src="${relative(directory, "assets/logos/sendbox.svg")}" alt="" width="32" height="32"><span>SendBox</span></a>
    <nav class="site-nav" aria-label="Main">
      <ul>
        ${links.join("\n        ")}
      </ul>
    </nav>
  </div>
</header>`;
}

export function footer(directory) {
  return `<footer class="site-footer">
  <div class="wrap footer-inner">
    <p>SendBox and SendBox Fleet are open source under the Apache License 2.0, built in the open by <a href="https://open.synctune.it">Synctune Open</a>.</p>
    <p>This site sets no cookies and loads no scripts, analytics or third-party resources. <a href="${site.repository}">Website source</a> · <a href="${relative(directory, "contribute/")}">Contribute</a></p>
  </div>
</footer>`;
}

function head({ directory, title, description }) {
  const canonical = `${site.origin}/${directory}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#14161B">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="SendBox">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="${relative(directory, "assets/favicon.svg")}" type="image/svg+xml">
  <link rel="stylesheet" href="${relative(directory, "assets/styles.css")}">
</head>`;
}

function truncate(text, length = 158) {
  if (text.length <= length) return text;
  return `${text.slice(0, text.lastIndexOf(" ", length - 1)).replace(/[,.;:]$/, "")}…`;
}

function docsNav(project, directory) {
  const groups = project.groups.map((group) => {
    const items = group.pages.map((page) => {
      const path = pagePath(project, page);
      const current = path === directory ? ' aria-current="page"' : "";
      return `<li><a href="${relative(directory, path)}"${current}>${escapeHtml(page.label)}</a></li>`;
    });
    return `<h2 class="nav-heading">${escapeHtml(group.title)}</h2>\n<ul>\n${items.join("\n")}\n</ul>`;
  });
  const index = `${project.route}/`;
  const current = index === directory ? ' aria-current="page"' : "";
  return `<nav class="docs-nav" id="docs-nav" aria-label="${escapeHtml(project.name)} documentation">
<p class="nav-project"><a href="${relative(directory, index)}"${current}>${escapeHtml(project.name)} docs</a></p>
${groups.join("\n")}
</nav>`;
}

function sourceLinks(project, record, upstream) {
  const repo = `https://github.com/${project.repo}`;
  const short = record.commit.slice(0, 7);
  return { repo, short, blob: `${repo}/blob/${record.commit}/${upstream}`, commit: `${repo}/commit/${record.commit}`, edit: `${repo}/edit/main/${upstream}` };
}

export function docPage({ project, page, record, rendered, previous, next }) {
  const directory = pagePath(project, page);
  const links = sourceLinks(project, record, page.upstream);
  const title = rendered.title ?? { html: escapeHtml(page.label), text: page.label, id: "top" };
  const toc = rendered.headings.filter((heading) => heading.level === 2);
  const tocHtml = toc.length >= 2
    ? `<nav class="toc" aria-label="On this page">
<p class="toc-title">On this page</p>
<ol>
${toc.map((heading) => `<li><a href="#${escapeHtml(heading.id)}">${heading.html.replace(/<a\b[^>]*>|<\/a>|<span id="[^"]*"><\/span>/g, "")}</a></li>`).join("\n")}
</ol>
</nav>`
    : "";
  const pager = [
    previous ? `<a class="pager-previous" href="${relative(directory, pagePath(project, previous))}"><span class="pager-label">Previous</span> ${escapeHtml(previous.label)}</a>` : "",
    next ? `<a class="pager-next" href="${relative(directory, pagePath(project, next))}"><span class="pager-label">Next</span> ${escapeHtml(next.label)}</a>` : "",
  ].filter(Boolean);
  const description = truncate(page.summary ?? rendered.summary ?? `${page.label} for ${project.name}.`);
  return `${head({ directory, title: `${page.label} | ${project.name} docs`, description })}
<body>
${header(directory)}
<div class="wrap docs-layout">
<main id="main" class="docs-main">
<nav class="breadcrumb" aria-label="Breadcrumb">
<ol>
<li><a href="${relative(directory, "")}">Home</a></li>
<li><a href="${relative(directory, `${project.route}/`)}">${escapeHtml(project.name)} docs</a></li>
<li><span aria-current="page">${escapeHtml(page.label)}</span></li>
</ol>
</nav>
<a class="docs-menu-link" href="#docs-nav">All ${escapeHtml(project.name)} docs</a>
<article class="prose">
<header class="doc-header">
<p class="eyebrow">${escapeHtml(project.name)} · ${escapeHtml(page.group)}</p>
<h1 id="${escapeHtml(title.id)}">${title.html}</h1>
</header>
${tocHtml}
${rendered.html}
</article>
<aside class="source-note" aria-label="Page source">
<p>Published from <a href="${links.blob}"><code>${escapeHtml(page.upstream)}</code></a> in <a href="${links.repo}">${project.repo}</a> at commit <a href="${links.commit}"><code>${links.short}</code></a>. To change this page, <a href="${links.edit}">edit it in ${project.repo}</a>; the site picks it up on the next sync.</p>
</aside>
${pager.length ? `<nav class="pager" aria-label="Previous and next page">\n${pager.join("\n")}\n</nav>` : ""}
</main>
${docsNav(project, directory)}
</div>
${footer(directory)}
</body>
</html>
`;
}

export function projectIndex({ project, record }) {
  const directory = `${project.route}/`;
  const links = sourceLinks(project, record, "");
  const groups = project.groups.map((group, position) => {
    const id = `group-${position + 1}`;
    const items = group.pages.map((page) => {
      const summary = page.summary ? `<span class="doc-summary">${escapeHtml(page.summary)}</span>` : "";
      return `<li><a href="${relative(directory, pagePath(project, page))}"><span class="doc-title">${escapeHtml(page.label)}</span>${summary}</a></li>`;
    });
    const compact = group.pages.every((page) => !page.summary) ? " compact" : "";
    return `<section class="doc-group" aria-labelledby="${id}">
<h2 id="${id}">${escapeHtml(group.title)}${group.contributor ? ' <span class="badge">For contributors</span>' : ""}</h2>
<ul class="doc-list${compact}">
${items.join("\n")}
</ul>
</section>`;
  });
  const overview = pagesOf(project)[0];
  return `${head({ directory, title: `${project.name} documentation`, description: truncate(`${project.tagline} ${project.intro}`) })}
<body>
${header(directory)}
<main id="main">
<section class="project-hero">
<div class="wrap project-hero-inner">
<img src="${relative(directory, project.logo.file)}" alt="" width="96" height="96">
<div>
<p class="eyebrow">Documentation</p>
<h1>${escapeHtml(project.name)}</h1>
<p class="lede">${escapeHtml(project.tagline)}</p>
<p>${escapeHtml(project.intro)}</p>
<p class="actions"><a class="button" href="${relative(directory, pagePath(project, overview))}">${escapeHtml(overview.label)}</a> <a class="button secondary" href="${links.repo}">Source on GitHub</a></p>
</div>
</div>
</section>
<div class="wrap docs-index">
${groups.join("\n")}
<p class="source-note">These pages are published unchanged from <a href="${links.repo}">${project.repo}</a> at commit <a href="${links.commit}"><code>${links.short}</code></a> (${record.committed.slice(0, 10)}). Links to files that aren't published here open on GitHub at that commit.</p>
</div>
</main>
${footer(directory)}
</body>
</html>
`;
}

export function sitemap(paths) {
  const urls = paths.map((path) => `  <url><loc>${site.origin}/${path}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

