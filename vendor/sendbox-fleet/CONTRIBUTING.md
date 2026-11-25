# Contributing

1. Read [docs/architecture.md](docs/architecture.md) and the
   [threat model](docs/threat-model.md); changes must keep the trust boundaries
   (no provider credentials in this service, bearer-only authentication,
   workload-supplied identity never authoritative).
2. Contract types come from `sendbox-governance`. Change them in the sendbox
   repository first, then update the pin ([docs/contract.md](docs/contract.md)).
   A pull request may track a sendbox branch during review, but CI blocks the
   merge until it tracks sendbox `main` again.
3. Schema changes need matching PostgreSQL and SQLite migrations and a test.
4. Before opening a pull request, run the checks in
   [docs/development.md](docs/development.md#checks). CI runs the same
   commands plus PostgreSQL and `cargo audit` jobs.
5. Use synthetic data in tests and examples; never commit real credentials,
   tokens, or personal data.
