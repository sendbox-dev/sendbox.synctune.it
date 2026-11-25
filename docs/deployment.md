# Preview and deployment

## No installation

The repository contains the finished website. `index.html`, `404.html`,
`contribute/`, `assets/` and the generated `sendbox/` and `fleet/` directories
are served as they are. There is no package manager, framework or runtime
service, and no `package.json`. Do not run `npm install`.

Node (the version in `.node-version`) is only needed to sync documentation,
regenerate pages and run checks. The scripts use Node's built-in modules only.

## Preview

Serve the published files with any static web server. With Node:

```sh
node scripts/package.mjs /tmp/sendbox-site
```

Then, if Python 3 is already available:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory /tmp/sendbox-site
```

Visit `http://127.0.0.1:8080`. Stop the server with Ctrl+C. Python is an
optional preview tool, not a website dependency. Serving the repository root
also works, but it exposes unpublished files such as `vendor/`.

## GitHub Pages setup

Complete this once. The workflow doesn't enable Pages, set the custom domain or
configure DNS.

1. Enable Pages with **GitHub Actions** as the source (**Settings > Pages**, or
   `gh api -X POST repos/sendbox-dev/sendbox.synctune.it/pages -f build_type=workflow`).
2. Set the custom domain to the hostname in `CNAME`, `sendbox.synctune.it`
   (**Settings > Pages > Custom domain**). The `CNAME` file records the intended
   hostname; for Actions deployments it doesn't configure the setting.
3. In the `synctune.it` DNS zone (Vercel DNS), add a `CNAME` record from
   `sendbox` to `sendbox-dev.github.io`, the organization's Pages host without
   a repository path.
4. When GitHub has issued the certificate, enable **Enforce HTTPS**.

`synctune.it` has a wildcard record. Until the new `CNAME` replaces the cached
wildcard answer (TTL 1800 seconds), GitHub's DNS check and certificate request
can still see the old answer, so HTTPS can lag behind HTTP. Wait for that TTL
before removing and re-adding the custom domain; each failed certificate attempt
counts toward Let's Encrypt's rate limits.

## Deployment workflow

`.github/workflows/pages.yml` has two jobs.

- **Check and package** runs the unit tests, copies the public files into a
  temporary directory with `scripts/package.mjs`, and runs `scripts/check.mjs`
  on exactly that directory: vendored documents against `SOURCE.json`, generated
  files against the build, every local link and anchor, page structure and
  accessibility basics, the sitemap and theme contrast. It runs on pull requests
  to `main`, including drafts, with read-only permissions.
- **Deploy GitHub Pages** runs only on `main`. It deploys the artifact uploaded
  by the checked job; only this job gets Pages write and OIDC permissions.

Only the files listed in `scripts/package.mjs` are published. `vendor/`,
`scripts/`, `tests/`, `docs/`, the README and workflow files are not.

Redeploy manually with **Actions > Website > Run workflow** on `main`. Newer
pushes to a pull request cancel its older runs; production deployments are
serialized without canceling one in progress.

The workflow uses official GitHub actions pinned to full commit SHAs. It needs
no secrets beyond the standard `GITHUB_TOKEN` and GitHub's OIDC token.

## Other static hosts

Publish the output of `node scripts/package.mjs <directory>` as static files.
Leave install and build commands empty. The site needs no environment
variables, rewrites or server functions. Directory URLs such as `/sendbox/`
must serve their `index.html`, and `404.html` should be the not-found page.
