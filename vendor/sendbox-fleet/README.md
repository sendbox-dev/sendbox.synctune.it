<img src="docs/assets/logo.svg" width="96" height="96" alt="SendBox Fleet logo">

# sendbox-fleet

Shared governance service for [SendBox](https://github.com/mbianchidev/sendbox) governed sessions: operator-signed policy profiles shared across users and hosts, project-scoped roles, session admission, credential grant authorization and revocation, approved expiring exceptions, and a hash-chained central audit log. It is increment 2 of [mbianchidev/sendbox#87](https://github.com/mbianchidev/sendbox/issues/87).

Provider credentials never reach this service; they stay in the SendBox host broker.

## Status

Feature-complete for increment 2 and usable for team deployments:

- Signed profiles, project roles, session admission, grants, per-request authorization, revocation, and exceptions with a different approver.
- Sign-in with any OpenID Connect provider (people and CI such as GitHub Actions), exchanged for short-lived service tokens; admin-issued tokens for bootstrap.
- Hash-chained audit with host-reported request outcomes, signed chain heads, and anchoring outside the database.
- Operations: PostgreSQL least-privilege roles, rate limits, Prometheus metrics, size and daily log rotation, deployment and backup guidance.

Not yet done: a governed session on Apple or Kata against real model providers through a deployed fleet. That run is host-side work tracked in [mbianchidev/sendbox#96](https://github.com/mbianchidev/sendbox/issues/96). See the [roadmap](docs/roadmap.md).

## Quick start

```sh
export FLEET_DATABASE_URL='sqlite://sendbox-fleet.db?mode=rwc'
cargo run --bin sendbox-fleet -- admin principal add oidc:you@example.com --kind user --operator
cargo run --bin sendbox-fleet -- admin token issue oidc:you@example.com > you.token
cargo run --bin sendbox-fleet
curl -H "Authorization: Bearer $(cat you.token)" http://127.0.0.1:8080/v1/whoami
```

Set `FLEET_PROFILE_TRUST` to publish signed profiles; see [development](docs/development.md#bootstrap-principals-tokens-and-projects). With PostgreSQL: `cp .env.example .env`, set `POSTGRES_PASSWORD`, then `docker compose build --no-cache && docker compose up`. For a shared setup, follow [deployment](docs/deployment.md).

## Documentation

- [Architecture](docs/architecture.md): relationship to SendBox, trust boundaries, authentication, roles, API surface, schema, audit
- [Deployment](docs/deployment.md): TLS, database roles, identity providers, audit anchoring, metrics, backups
- [Shared contract](docs/contract.md): how `sendbox-governance` is pinned and versioned
- [Threat model](docs/threat-model.md)
- [Roadmap](docs/roadmap.md): delivered and remaining work mapped to the issue's acceptance criteria
- [Development](docs/development.md): configuration, bootstrap, local runs, tests, logs
- [Contributing](CONTRIBUTING.md) and [security](SECURITY.md)

## License

[Apache-2.0](LICENSE)
