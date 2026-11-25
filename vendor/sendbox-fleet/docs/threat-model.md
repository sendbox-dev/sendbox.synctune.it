# Threat model

Scope: the shared governance service in this repository and its interfaces to
SendBox hosts, people, and its database. The SendBox VM boundary, host broker,
and increment-1 local authority are covered in the sendbox repository.

Status column: **implemented** means implemented and tested here;
**documented** means the mitigation is deployment guidance in
[deployment.md](deployment.md). Remaining work is in [roadmap.md](roadmap.md).

## Assets

- Authorization decisions: session admission, grants, per-request decisions.
- Policy state: signed profile revisions, minimum revisions, project roles,
  exceptions.
- Audit evidence and its integrity.
- Availability of authorization for running sessions.

Provider credentials are **not** an asset of this service: they stay in the
SendBox host broker and never reach the fleet.

## Actors

| Actor | Trust |
| --- | --- |
| Operator | Trusted to sign and publish profiles, create projects, and recover ownership |
| Project owner, admin, member, viewer | Trusted within their project role |
| SendBox host (user or worker token) | Trusted to report sessions of the principal whose token it holds; untrusted for anything else |
| Service host administrator (`sendbox-fleet admin`) | Issues tokens and creates principals; equivalent to database access |
| Workload (agent inside a VM) | Untrusted; never talks to the fleet directly |
| Network attacker | Untrusted |
| Database administrator | Can bypass application controls; mitigated by evidence anchoring |
| Identity provider in `FLEET_OIDC_CONFIG` | Trusted to name principals under its own prefix, within its audience and required claims; nothing else |

## Threats and mitigations

| # | Threat | Mitigation | Status |
| --- | --- | --- | --- |
| T1 | Caller spoofs identity with headers such as `X-Forwarded-User` | Only bearer tokens authenticate; identity headers are ignored; auth runs before routing | Implemented (tested) |
| T2 | Workload-supplied identity in a body is trusted | Binding and grant principals must equal the authenticated caller; projects and sessions are checked against stored state; `local-user:` principals rejected by API and schema | Implemented (tested) |
| T3 | Stolen or replayed bearer token | Service tokens stored only as SHA-256, expiring within 90 days (exchanged ones within `FLEET_TOKEN_MAX_TTL_SECONDS`, 7 days by default), listable and revocable by their owner, void when the principal is disabled; a service token cannot mint another; identity-provider JWTs need this service's audience and expire in minutes; TLS in front of the service ([deployment](deployment.md#tls-and-the-reverse-proxy)) | Implemented (tested) |
| T4 | Compromised worker acts for sessions it does not run | A caller can only admit, use, renew, or end sessions bound to its own principal; grants bound to session, principal, project, binding digest, and profile revision (composite foreign key) | Implemented (tested) |
| T5 | Stale policy or approval authorizes changed work | Sessions, grants, and exceptions reference an exact profile revision and digest; a new revision or raised minimum makes them stale; approvals of stale requests are refused; sessions bound to a revoked or expired exception are denied | Implemented (tested) |
| T6 | Grant wider than the profile allows | Methods and path prefixes must be inside the profile service; lifetime capped by the profile TTL, profile expiry, exception expiry, and 7 days | Implemented (tested) |
| T7 | Audit evidence altered or deleted | Append-only triggers, contiguous hash chain computed by the service and enforced on insert, `GET /v1/audit/verify`; runtime role without `UPDATE`, `DELETE`, `TRUNCATE`, or `ALTER` on audit (`deploy/postgres/roles.sql`); Ed25519-signed chain heads anchored outside the database and checked by `admin audit verify` | Implemented (tested) |
| T8 | Secrets leak into logs or audit | No request bodies, headers, or query strings logged; database URL credentials redacted; tokens stored only as digests; no credential columns; audit keeps a redacted target without query strings (schema check) and omits exception reasons | Implemented (tested) |
| T9 | Authority outage silently allows requests | Hosts deny with `authority_unavailable` on any non-200 answer, timeout, or redirect; a token lookup failure is `503` | Implemented (host client tested in sendbox) |
| T10 | Exception abuse or self-approval | Only denials the signed revision lists as liftable; reason; expiry at most the profile's `exceptions.max_ttl_seconds` and 7 days; approver is a different `owner` or `admin` (also a schema check); lifting never widens the ceiling; every request, decision, refusal, use, and revocation audited | Implemented (tested) |
| T11 | Revocation does not stop in-flight traffic | New requests denied at once; open streams bounded by the profile grace window (at most 60 seconds) on the host; uncertain outcomes audited on the host as `aborted_uncertain` and centrally as `request.outcome` with outcome `unknown` | Implemented (tested) |
| T12 | Resource exhaustion | Body limits (64 KiB, 1 MiB for profile publication), bounded connection pool and acquire timeout, bounded list sizes, non-lossy bounded log queue, per-principal request and per-peer authentication-failure rate limits, at most 20 live exchanged tokens per principal, bounded and throttled JWKS fetches, size-capped log files | Implemented (tested); limits are per instance |
| T13 | Supply-chain compromise | Actions pinned by commit SHA, images pinned by digest, `Cargo.lock` committed, contract pinned by git revision, `cargo audit` in CI with documented exceptions | Implemented |
| T14 | Forged or misdirected identity-provider token | Exact issuer match against an operator-written list (HTTPS, or HTTP to loopback for tests), audience required, keys only from that issuer's JWKS (no `jku`, `x5u`, or embedded keys, no `none` or HMAC algorithms, `crit` refused), per-issuer algorithm allowlist, required claims (for example `repository_owner`), verified email, unique principal prefixes, kind bound to the issuer; auto-provisioned principals get no roles | Implemented (tested) |
| T15 | Rate-limit bypass or lockout behind a proxy | The failure limit keys on the TCP peer and ignores `X-Forwarded-For`; deployment guidance to limit per client at the proxy | Documented |
| T16 | Metrics leak identities | Metrics on a separate listener, labels limited to status classes and decision codes | Implemented (tested) |

## Known accepted risks

- `RUSTSEC-2026-0459` (bundled SQLite older than the fix): SQLite is used
  only for local development and tests on files the service creates. The fix
  is libsqlite3-sys 0.39, which sqlx 0.9.0 does not allow yet. Tracked in
  [roadmap.md](roadmap.md).
- Database triggers do not stop a database owner or superuser. Run the
  service with `sendbox_fleet_app` and anchor chain heads on storage those
  administrators cannot rewrite; then a rewrite is detected, though not
  prevented.
- An identity-provider compromise can sign in as any principal that provider
  names. Limit each issuer's prefix, audience, and required claims, and keep
  `auto_provision` off where it is not needed.
