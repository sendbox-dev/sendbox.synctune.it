# Shared contract

SendBox hosts and this service must agree byte-for-byte on identities,
profile references, session bindings, grants, request contexts, and
decisions. That agreement lives in one crate, `sendbox-governance`, in the
[sendbox](https://github.com/mbianchidev/sendbox) repository
(`crates/sendbox-governance`). This service depends on it instead of
redefining any of those types.

## How it is pinned

```toml
# Cargo.toml (workspace)
sendbox-governance = { git = "https://github.com/mbianchidev/sendbox", branch = "main" }
sendbox-security = { git = "https://github.com/mbianchidev/sendbox", branch = "main" }
```

`sendbox-security` supplies the signing envelope and trust store used for
profile signatures and audit heads.

- The dependency tracks sendbox `main`, and `Cargo.lock` records the exact
  commit. CI builds with `--locked`, so every build sees the same contract
  until the lockfile moves.
- [Dependabot](../.github/dependabot.yml) checks sendbox `main` daily and opens
  one pull request (group `sendbox-contract`) that moves `Cargo.lock` to the
  latest commit. The
  [auto-merge workflow](../.github/workflows/dependabot-auto-merge.yml) enables
  auto-merge when that pull request updates nothing but `sendbox-governance`
  and `sendbox-security`, and branch protection merges it only after every CI
  job passes. A contract change that breaks this service leaves the pull
  request open with failing checks for a maintainer to fix.
- Both crates inherit versions from the sendbox workspace and depend on
  `sendbox-core` by path; Cargo resolves all three from the same git checkout,
  so they always share one commit.
- Only `main` is tracked, so the recorded commit cannot disappear when sendbox
  feature branches are rewritten or deleted. A pull request that needs an
  unmerged contract change may track the sendbox pull request branch while
  both are in review. CI's last step,
  [`scripts/check-contract-pin.sh`](../scripts/check-contract-pin.sh), fails
  until every SendBox crate is locked to a sendbox `main` commit again (it also
  rejects `rev`/`tag` pins and local path patches), so such a pull request
  cannot merge. After the sendbox pull request merges, set `branch = "main"`
  and run `cargo update -p sendbox-governance -p sendbox-security`.

To move the lockfile by hand, to the latest `main` commit or to a specific one:

```sh
cargo update -p sendbox-governance -p sendbox-security
cargo update -p sendbox-governance --precise <commit-sha>   # moves all three crates
scripts/check-contract-pin.sh
cargo test --locked --workspace
```

## What the API reuses

| Contract type | Used by |
| --- | --- |
| `api::CallerIdentity` | `GET /v1/whoami` response |
| `api::SessionAdmissionRequest`, `api::SessionAdmission`, `GovernanceBinding` | `POST /v1/sessions:admit` body and response |
| `api::SessionEnd` | `POST /v1/sessions/{session}:end` body |
| `GrantRequest`, `CredentialGrant` | `POST /v1/grants` body and response |
| `GrantId` | `:renew` and `:revoke` path parameter; renew response is a `CredentialGrant` |
| `api::RevokeGrantRequest`, `RevocationReason` | `:revoke` body |
| `RequestContext`, `Decision`, `DenyReason`, `evaluate_request` | `POST /v1/authorize` body, response, and decision rules |
| `ProfileId`, `ProfileRef`, `GovernanceProfile`, `check_current` | `/v1/profiles/{profile_id}`; publication bodies are parsed with `GovernanceProfile::parse` |
| `PolicyException`, `ExceptionScope`, `ExceptionId`, `api::ExceptionList` | `/v1/exceptions` responses; scopes are checked with `GovernanceProfile::permits_exception` |
| `ProjectId`, `PrincipalId` | Role, exception, and audit endpoints |
| `Sha256Digest`, `canonical_digest` | Digests in responses, binding storage, and audit event hashes |
| `api::TokenRequest`, `api::IssuedToken` | `POST /v1/tokens` body and response |
| `api::RequestOutcomeReport`, `api::ReportedOutcome` | `POST /v1/grants/{grant}:outcome` body, checked with `RequestOutcomeReport::validate` |

Validation is the contract's own: identifier grammars, `deny_unknown_fields`,
`GovernanceBinding::validate`, `validate_method`, `validate_path_prefix`, and
`GovernanceProfile::parse`. Invalid input is a `400` problem.

Wire types a SendBox host also uses live in `sendbox_governance::api`. Types
only people use live here, in the route module that uses them:
`CreateProject`, `ProjectRole` and `RoleBinding`, `ExceptionRequest`,
`ProfilePublication` and `MinimumRevision`, `TokenSummary` and `TokenList`,
and the audit query, page, event, and signed-head types. Profile signatures use SendBox's signing envelope
(`sendbox_security::provenance::DetachedSignature` in a
`sendbox.governance-signatures` bundle), verified with the same trust store
code as hosts.

## Versioning

- `sendbox_governance::CONTRACT_VERSION` (currently `2`, which added
  exceptions to the session binding) is the wire and digest version. `GovernanceBinding` and `CredentialGrant` carry it, and validation
  rejects any other value. The server logs it at startup.
- Contract structs use `deny_unknown_fields`, so adding a field is a breaking
  change for older peers. Any change to a contract type or to how digests are
  computed requires bumping `CONTRACT_VERSION` in the sendbox repository and
  then updating this pin; hosts and the fleet must be upgraded together or
  support both versions during the transition.
- The `/v1` path prefix versions the HTTP API surface (routes, fleet-only
  types, problem format). It changes independently of `CONTRACT_VERSION`.
