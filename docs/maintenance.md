# Content, synced documentation and checks

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The landing page, written by hand |
| `contribute/index.html` | The contributor guide for both projects, written by hand |
| `404.html` | A standalone not-found page with inline styles and absolute links |
| `assets/styles.css` | The only stylesheet, with light and dark themes. System fonts only |
| `sendbox/`, `fleet/` | Generated documentation pages. Don't edit |
| `assets/logos/`, `assets/favicon.svg`, `sitemap.xml` | Generated from `vendor/` and the catalogue. Don't edit |
| `vendor/<project>/` | The projects' documents, logo and license, synced unchanged |
| `vendor/<project>/SOURCE.json` | Source repository, branch, commit, commit date and SHA-256 of each synced file |
| `scripts/catalogue.mjs` | The single list of published documents, their routes, labels and groups |
| `scripts/markdown.mjs` | The Markdown renderer (the GitHub-flavored subset the documents use) |
| `scripts/layout.mjs` | Shared header and footer, documentation page and index templates |

`index.html` and `contribute/index.html` contain `<!-- build:header -->` and
`<!-- build:footer -->` regions. The build fills them with the shared header and
footer, so navigation stays identical on every page. Edit everything outside
those regions by hand.

## Update the documentation

The documentation is never edited here. Fix or extend a document in its
project repository, then sync:

```sh
node scripts/sync.mjs                    # both projects, from main
node scripts/sync.mjs sendbox --ref <tag or commit>
node scripts/build.mjs
node scripts/check.mjs
```

`sync.mjs` resolves the ref to one commit, downloads every catalogued file at
that commit and rewrites `vendor/<project>/` with a new `SOURCE.json`. It needs
network access to GitHub; set `GITHUB_TOKEN` to raise the API rate limit. It
also lists Markdown files upstream that the catalogue doesn't publish, such as
historical spikes. Review the rendered pages, then commit `vendor/` and the
generated files together in a pull request.

To publish another document, add it to `scripts/catalogue.mjs` with a slug,
upstream path, label and, for the main groups, a one-line summary. Then sync and
build. Removing an entry removes its page on the next build.

## How documents are rendered

- The first level-1 heading becomes the page title. A README logo before it is
  replaced by the page header.
- Heading anchors match GitHub's, so links such as
  `installation.md#dependency-security-status` keep working.
- Relative links to published documents point to their pages. Links to anything
  else (source files, unpublished docs) open on GitHub at the synced commit.
- Links to the projects' former `mbianchidev/...` repository URLs are rewritten
  to `sendbox-dev`; GitHub links to published documents on `main` point to their
  pages instead.
- Raw HTML is escaped, except `<a id>` anchors, images and `kbd`, `sub` and `sup`.
  Images must be bundled; the build fails on an image that would load from
  another site.
- Mermaid diagrams are shown as source with a link to GitHub's rendering, since
  the site runs no JavaScript.

Every documentation page names its source file and commit, and links to the
upstream edit page.

## Checks

```sh
node --test tests/*.test.mjs
node scripts/check.mjs
node scripts/check.mjs --external
```

`check.mjs` fails when a vendored file no longer matches `SOURCE.json`, when the
generated files are out of date, or when a published page has a broken local
link or anchor, a missing or duplicate title, more than one `h1`, skipped
heading levels, an image without `alt`, a link without text, duplicate ids,
unlabelled navigation landmarks, a missing skip link, a positive `tabindex`,
a script, a third-party resource or a wrong canonical URL. It also compares the
sitemap with the pages and checks theme colors against WCAG contrast (4.5:1 for
text, 3:1 for focus outlines) in both color schemes.

`--external` also requests every external link. It needs network access, so CI
doesn't run it; run it before releases or when a sync adds links.

Static checks don't replace a browser review. After layout changes, check
narrow (320px) and wide screens, keyboard focus, both color schemes and
reduced motion.

## Content rules

Describe what the tools do today; take facts from the synced documents and keep
status notes (such as pending releases) accurate. Don't invent release dates,
testimonials or screenshots.

The site loads no scripts, analytics, cookies, web fonts or third-party
resources. Update the footer's privacy note if that ever changes.

## Brand and rights

The SendBox and SendBox Fleet logos come unchanged from each repository's
`docs/assets/logo.svg`, synced with the documents. Theme colors follow the
logos: ink `#14161B`, paper `#F5F7F8` and green `#34D399`. Use the bright green
on dark backgrounds only; links on light backgrounds use `#0A6B4B`.

The website's own code and copy are MIT licensed. Synced documents and logos
remain under the projects' Apache License 2.0, a copy of which is synced into
each `vendor/<project>/LICENSE`.
