# Development

## Prerequisites

- [rustup](https://rustup.rs). The pinned toolchain (Rust 1.100.0 with
  clippy and rustfmt) installs automatically from `rust-toolchain.toml`.
- A Docker-compatible engine with Compose, only for the PostgreSQL stack.

## Configuration

The server reads its configuration from the environment at startup and exits
with status `2` and a message naming the variable when a value is invalid.

| Variable | Default | Meaning |
| --- | --- | --- |
| `FLEET_DATABASE_URL` | required | `sqlite://path.db?mode=rwc`, `sqlite::memory:`, or `postgres://user:password@host:5432/db` |
| `FLEET_BIND` | `127.0.0.1:8080` | Listen address |
| `FLEET_LOG_DIR` | `./logs` | Log directory; relative paths resolve against the working directory at startup |
| `FLEET_LOG_LEVEL` | `info,sqlx=warn` | [`EnvFilter`](https://docs.rs/tracing-subscriber/latest/tracing_subscriber/filter/struct.EnvFilter.html) directives |
| `FLEET_LOG_RETENTION_DAYS` | `30` | Days to keep rotated log files (1 to 3650) |
| `FLEET_AUTHORITY_ID` | `sendbox-fleet` | Authority id hosts put in `authority:` of their operator configuration and bind into every session; not `local` |
| `FLEET_PROFILE_TRUST` | unset | YAML or JSON file with `threshold` and `signers` (the same shape as a host operator configuration's `trust` section). Profile publication is refused until it is set |
| `FLEET_OIDC_CONFIG` | unset | YAML file of trusted identity providers ([format](deployment.md#identity-providers)). Unset: only service tokens authenticate |
| `FLEET_TOKEN_TTL_SECONDS` | `43200` (12 h) | Default lifetime of tokens from `POST /v1/tokens` |
| `FLEET_TOKEN_MAX_TTL_SECONDS` | `604800` (7 d) | Longest lifetime a caller may request (at most 90 days) |
| `FLEET_AUDIT_SIGNING_KEY` | unset | Key from `admin audit keygen` (no group or other access). Enables `GET /v1/audit/head` |
| `FLEET_AUDIT_ANCHOR_DIR` | unset | Directory for periodic signed heads; needs the signing key |
| `FLEET_AUDIT_ANCHOR_INTERVAL_SECONDS` | `3600` | Anchoring interval (60 to 86400) |
| `FLEET_RATE_LIMIT_PER_MINUTE` | `1200` | `/v1` requests per principal per minute; `0` disables |
| `FLEET_AUTH_FAILURES_PER_MINUTE` | `60` | Failed authentications per peer address per minute; `0` disables |
| `FLEET_METRICS_BIND` | unset | Separate listener for Prometheus `/metrics`; must differ from `FLEET_BIND` |
| `FLEET_MIGRATE` | `true` | `false`: never change the schema; refuse to start until `admin migrate` has run |
| `FLEET_LOG_MAX_BYTES` | `104857600` (100 MiB) | Rotate the log file at this size (1 MiB to 10 GiB) |

Database credentials in `FLEET_DATABASE_URL` are never logged.

## Run locally with SQLite

```sh
export FLEET_DATABASE_URL='sqlite://sendbox-fleet.db?mode=rwc'
cargo run --bin sendbox-fleet

curl -i http://127.0.0.1:8080/healthz
curl -i http://127.0.0.1:8080/readyz
curl -i -X POST http://127.0.0.1:8080/v1/authorize   # 401: authentication required
```

Migrations run at startup. Stop the server with Ctrl-C (or `SIGTERM`); it
stops accepting connections, gives in-flight requests up to 30 seconds,
closes the database pool, and flushes logs.

## Bootstrap principals, tokens, and projects

`sendbox-fleet admin` acts on the database directly and needs only
`FLEET_DATABASE_URL` (and honors `FLEET_MIGRATE`). Every change is audited
with the actor `cli:admin`.

```sh
sendbox-fleet admin principal add oidc:olivia@example.com --kind user --operator
sendbox-fleet admin principal add oidc:owen@example.com --kind user
sendbox-fleet admin principal add worker:ci-1 --kind worker
sendbox-fleet admin project create github:example/service --owner oidc:owen@example.com
sendbox-fleet admin token issue oidc:owen@example.com --ttl-days 30 > owen.token
sendbox-fleet admin token list oidc:owen@example.com
sendbox-fleet admin token revoke <token-id>
sendbox-fleet admin principal disable oidc:owen@example.com
```

`token issue` prints the token once on stdout; only its SHA-256 is stored.
People then use the API with `Authorization: Bearer <token>`, for example:

```sh
T=$(cat owen.token); U=http://127.0.0.1:8080
curl -H "Authorization: Bearer $T" $U/v1/whoami
curl -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"principal":"oidc:alice@example.com","role":"member"}' \
  "$U/v1/projects/github:example%2Fservice/roles"
```

An operator publishes the exact profile and the signature bundle produced by
`sendbox governance sign`:

```sh
jq -n --rawfile document acme.yaml --slurpfile signatures acme.yaml.sig.json \
  '{document: $document, signatures: $signatures[0]}' |
  curl -X PUT -H "Authorization: Bearer $OPERATOR_TOKEN" \
    -H 'Content-Type: application/json' --data @- $U/v1/profiles/acme
```

On each SendBox host, the operator configuration names this service and the
caller stores their own token: `sendbox secrets add SENDBOX_FLEET_TOKEN`.

With `FLEET_OIDC_CONFIG`, people and CI sign in with their identity provider
instead, and hosts exchange that sign-in for a service token with
`sendbox governance login`. See [deployment](deployment.md#identity-providers).

Other admin commands:

```sh
sendbox-fleet admin migrate                                  # apply migrations only
sendbox-fleet admin audit keygen --output audit.key > audit-identity.json
FLEET_AUDIT_SIGNING_KEY=audit.key sendbox-fleet admin audit anchor --output anchors/
sendbox-fleet admin audit verify --identity audit-identity.json --anchor anchors/audit-head-*.json
```

## Run with PostgreSQL (Compose)

```sh
cp .env.example .env        # set POSTGRES_PASSWORD (URL-safe characters)
docker compose build --no-cache && docker compose up
```

The server listens on `127.0.0.1:${FLEET_PORT:-8080}`. The container runs as
an unprivileged user with a read-only root filesystem; logs go to the
`fleet-logs` volume. `docker compose down` stops the stack and keeps data;
`docker compose down --volumes` also deletes the database and logs.

## Checks

```sh
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
cargo audit --deny warnings          # needs cargo-audit; see .cargo/audit.toml
scripts/check-contract-pin.sh        # SendBox crates locked to sendbox main
```

Tests use in-memory SQLite and synthetic data. To run the migration and API
tests against PostgreSQL, point `FLEET_TEST_DATABASE_URL` at a disposable
database whose name ends in `_test` (the tests drop and recreate its `public`
schema):

The PostgreSQL run also checks `deploy/postgres/roles.sql` by connecting as
its roles, which the trust authentication below allows.

```sh
docker run -d --name sendbox-fleet-pg-test -p 127.0.0.1:55432:5432 \
  -e POSTGRES_DB=sendbox_fleet_test -e POSTGRES_USER=sendbox_fleet \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:18.7-alpine3.24
FLEET_TEST_DATABASE_URL=postgres://sendbox_fleet@127.0.0.1:55432/sendbox_fleet_test \
  cargo test --locked --workspace --test migrations --test http -- --test-threads=1
docker rm -f sendbox-fleet-pg-test
```

CI runs formatting, Clippy, and tests on SQLite; the migration and API tests
plus a start, probe, and graceful-stop run of the server on PostgreSQL; and
`cargo audit`.

## Logs

- Every event is a JSON line written to stdout and to
  `FLEET_LOG_DIR/sendbox-fleet.YYYY-MM-DD.log`. A new file starts at each UTC
  midnight, and whenever the live file reaches `FLEET_LOG_MAX_BYTES` the next
  part continues in `sendbox-fleet.YYYY-MM-DD.1.log`, `.2.log`, and so on.
  Files are created with mode `0600`.
- Retention runs at startup and then hourly. It deletes only regular files
  named `sendbox-fleet.YYYY-MM-DD.log` or `sendbox-fleet.YYYY-MM-DD.N.log`
  whose UTC day ended at least `FLEET_LOG_RETENTION_DAYS` days ago, judged by
  the date in the name rather than the modification time. Other files, directories, and symlinks are left
  alone; deletion failures are logged and retried at the next run.
- The log directory is created with mode `0700`.
- File writes go through a bounded queue of 16,384 events. When it is full,
  logging callers wait instead of dropping events.
- Never logged: request bodies, headers (including `Authorization`), query
  strings, and database credentials.

## Migrations

Schema changes need a new, numbered file in **both** `migrations/postgres` and
`migrations/sqlite` with equivalent constraints. Never edit a migration that
has been applied anywhere: sqlx records checksums and refuses to start on a
mismatch. Add a test in `crates/fleet-server/tests/migrations.rs` for any new
invariant.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `configuration error: FLEET_DATABASE_URL is required` (exit 2) | Export a database URL |
| `cannot connect to postgres://***@...` | Database not reachable or wrong credentials |
| `cannot listen on ...` | Port already in use; set `FLEET_BIND` or `FLEET_PORT` |
| `cannot create log directory` | `FLEET_LOG_DIR` not writable by the server user |
| Every `/v1` call returns `401 bearer token was not accepted` | The token is unknown, expired, revoked, or its principal is disabled; issue a new one with `sendbox-fleet admin token issue` |
| `503 profile signers are not configured` on profile publication | Set `FLEET_PROFILE_TRUST` |
| `409 ... is not the current revision` on session admission | The host's local profile differs from the newest published revision; install the same signed bytes on the host |
| `migrations … are not applied; run sendbox-fleet admin migrate` | `FLEET_MIGRATE=false` and the schema is behind; run `admin migrate` as the schema owner |
| `permission denied for schema public` at startup | The runtime role cannot migrate; set `FLEET_MIGRATE=false` and migrate as the owner |
| `401` for an identity-provider token | Issuer, audience, expiry, key, required claim, or `email_verified` did not match, or the principal is unknown, disabled, or of the other kind. The server log names the reason (for example `expired`, `audience_mismatch`, `not_registered`); callers only see `401` |
| `503 identity provider keys are unavailable` | The issuer's discovery or JWKS endpoint is unreachable and no keys are cached |
| `429 rate limit exceeded` | Wait `Retry-After` seconds; behind a proxy, see [deployment](deployment.md#tls-and-the-reverse-proxy) |
| `… must not be accessible by group or others` | `chmod 600` the audit signing key |
