# sendbox.synctune.it

The website for [SendBox](https://github.com/sendbox-dev/sendbox) and
[SendBox Fleet](https://github.com/sendbox-dev/sendbox-fleet), published at
[sendbox.synctune.it](https://sendbox.synctune.it): a landing page, user and
contributor documentation for both projects, and a contributor guide.

Plain HTML and CSS. No JavaScript, dependencies, install command, cookies or
third-party resources. The documentation pages are generated from the projects'
own Markdown, synced unchanged at a recorded commit, by small Node scripts that
use only Node's built-in modules.

```sh
node scripts/sync.mjs        # update vendor/ from the projects' main branches
node scripts/build.mjs       # regenerate the documentation pages and sitemap
node --test tests/*.test.mjs # unit tests
node scripts/check.mjs       # vendored docs, generated files, links, accessibility
```

- [Preview and Pages deployment](docs/deployment.md)
- [Content, synced documentation and checks](docs/maintenance.md)
- [Synced project documents](vendor/) (don't edit, see the maintenance guide)

## License

[MIT](LICENSE.md) for the website. The synced SendBox and SendBox Fleet documents
and logos in `vendor/`, `sendbox/`, `fleet/` and `assets/logos/` stay under the
projects' [Apache License 2.0](vendor/sendbox/LICENSE).
