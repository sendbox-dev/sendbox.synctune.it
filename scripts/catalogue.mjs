// The single list of projects, published documents and their site routes.
// Every upstream path here is synced into vendor/<project>/ and recorded in SOURCE.json.

export const site = {
  origin: "https://sendbox.synctune.it",
  name: "SendBox",
  org: "https://github.com/sendbox-dev",
  repository: "https://github.com/sendbox-dev/sendbox.synctune.it",
};

// Previous repository owners. Links to them are rewritten to the current owner.
export const formerOwners = ["mbianchidev"];

const sendboxGroups = [
  {
    title: "Get started",
    pages: [
      { slug: "overview", upstream: "README.md", label: "Overview and quick start", summary: "What SendBox is, supported agents and the shortest path to a first run." },
      { slug: "installation", upstream: "docs/installation.md", label: "Installation", summary: "Host and runtime requirements, workload images, release verification, source builds and macOS package notes." },
      { slug: "configuration", upstream: "docs/configuration.md", label: "Configuration", summary: "YAML examples, policy settings and credential configuration." },
      { slug: "cli-reference", upstream: "docs/cli-reference.md", label: "CLI reference", summary: "Commands, run flags and common examples." },
      { slug: "interactive-sessions", upstream: "docs/interactive-sessions.md", label: "Interactive sessions", summary: "Terminal requirements, behavior and troubleshooting." },
      { slug: "cli-agents", upstream: "docs/cli-agents.md", label: "CLI agents", summary: "Agent profiles, native MCP formats, multi-repo scope, HTTP proxies and syscall tracing." },
      { slug: "integrations", upstream: "docs/integrations.md", label: "Integrations", summary: "MCP, GitHub, model providers, private registries, devcontainers and CI workflows." },
      { slug: "similar-tools", upstream: "docs/alternatives.md", label: "Similar tools", summary: "SendBox compared with other agent sandboxes and dev containers." },
    ],
  },
  {
    title: "Runtimes and operations",
    pages: [
      { slug: "apple-runtime", upstream: "docs/apple-runtime.md", label: "Apple runtime", summary: "Apple Containerization on macOS, supported container CLI versions and qualification status." },
      { slug: "kata-containers", upstream: "docs/kata-containers.md", label: "Kata Containers", summary: "The Linux runtime: Kata, containerd, nerdctl and KVM setup." },
      { slug: "hyperlight", upstream: "docs/hyperlight.md", label: "Hyperlight", summary: "The explicit one-shot Linux/KVM provider and what it rejects." },
      { slug: "dns-cold-start", upstream: "docs/dns-cold-start.md", label: "Cold-start DNS diagnostics", summary: "A credential-free diagnostic for first-request networking failures." },
      { slug: "package-supply-chain", upstream: "docs/package-supply-chain.md", label: "Package supply-chain proxy", summary: "Verify and inspect npm packages before their bytes reach the workload." },
      { slug: "mcp-inspection", upstream: "docs/mcp-inspection.md", label: "MCP inspection", summary: "The MCP boundary, tool policies and inspection records." },
    ],
  },
  {
    title: "Security",
    pages: [
      { slug: "security-model", upstream: "docs/security-model.md", label: "Security model", summary: "Guarantees, assumptions and defense-in-depth analysis." },
      { slug: "security-policy", upstream: "SECURITY.md", label: "Reporting vulnerabilities", summary: "How to report a vulnerability privately and which versions receive fixes." },
      { slug: "egress-trust-boundary", upstream: "docs/security/egress-enforcement-trust-boundary.md", label: "Egress trust boundary", summary: "The egress enforcement trust boundary and runtime integration contract." },
      { slug: "secrets-migration", upstream: "docs/migration/secrets.md", label: "Secrets migration", summary: "Moving existing secrets to the current secret store." },
      { slug: "security-records-migration", upstream: "docs/migration/security-records.md", label: "Security-record migration", summary: "Migrating stored security records." },
    ],
  },
  {
    title: "Contribute",
    contributor: true,
    pages: [
      { slug: "contributing", upstream: "docs/contributing.md", label: "Contributing", summary: "Source setup, checks, documentation conventions and release procedures." },
      { slug: "qualification", upstream: "docs/qualification.md", label: "Qualification", summary: "The qualification inventory, conformance checks and benchmarks." },
      { slug: "roadmap", upstream: "ROADMAP.md", label: "Roadmap", summary: "Future proposals and historical designs." },
    ],
  },
  {
    title: "Architecture",
    contributor: true,
    pages: [
      { slug: "architecture/runtime-core", upstream: "docs/architecture/runtime-core.md", label: "Runtime core" },
      { slug: "architecture/execution-broker", upstream: "docs/architecture/execution-broker.md", label: "Execution broker" },
      { slug: "architecture/guest-supervisor", upstream: "docs/architecture/guest-supervisor.md", label: "Guest supervisor" },
      { slug: "architecture/guest-artifact-bundles", upstream: "docs/architecture/guest-artifact-bundles.md", label: "Guest artifact bundles" },
      { slug: "architecture/interactive-terminal", upstream: "docs/architecture/interactive-terminal.md", label: "Interactive terminal" },
      { slug: "architecture/kata-runtime", upstream: "docs/architecture/kata-runtime.md", label: "Kata runtime" },
      { slug: "architecture/authenticated-guest-protocol", upstream: "docs/architecture/authenticated-guest-protocol.md", label: "Authenticated guest protocol" },
      { slug: "architecture/session-security-lifecycle", upstream: "docs/architecture/session-security-lifecycle.md", label: "Session security lifecycle" },
      { slug: "architecture/egress-enforcement", upstream: "docs/architecture/egress-enforcement.md", label: "Egress enforcement" },
      { slug: "architecture/mcp-broker", upstream: "docs/architecture/mcp-broker.md", label: "MCP broker" },
      { slug: "architecture/package-registry-proxy", upstream: "docs/architecture/package-registry-proxy.md", label: "Package registry proxy" },
      { slug: "architecture/secrets-and-credential-broker", upstream: "docs/architecture/secrets-and-credential-broker.md", label: "Secrets and credential broker" },
      { slug: "architecture/governed-sessions", upstream: "docs/architecture/governed-sessions.md", label: "Governed sessions" },
      { slug: "architecture/git-branch-guard", upstream: "docs/architecture/git-branch-guard.md", label: "Git branch guard" },
      { slug: "architecture/safe-outputs", upstream: "docs/architecture/safe-outputs.md", label: "Safe Outputs" },
      { slug: "architecture/security-records", upstream: "docs/architecture/security-records.md", label: "Security records" },
      { slug: "architecture/agent-orchestration", upstream: "docs/architecture/agent-orchestration.md", label: "Agent orchestration" },
      { slug: "architecture/native-project-analysis", upstream: "docs/architecture/native-project-analysis.md", label: "Native project analysis" },
      { slug: "architecture/rust-cli-parity", upstream: "docs/architecture/rust-cli-parity.md", label: "Rust CLI" },
    ],
  },
];

const fleetGroups = [
  {
    title: "Get started",
    pages: [
      { slug: "overview", upstream: "README.md", label: "Overview and quick start", summary: "What SendBox Fleet does, its status and a local quick start." },
      { slug: "deployment", upstream: "docs/deployment.md", label: "Deployment", summary: "TLS, database roles, identity providers, audit anchoring, metrics and backups." },
      { slug: "architecture", upstream: "docs/architecture.md", label: "Architecture", summary: "Relationship to SendBox, trust boundaries, authentication, roles, API surface, schema and audit." },
      { slug: "contract", upstream: "docs/contract.md", label: "Shared contract", summary: "How the sendbox-governance contract is pinned and versioned." },
    ],
  },
  {
    title: "Security",
    pages: [
      { slug: "threat-model", upstream: "docs/threat-model.md", label: "Threat model", summary: "Assets, adversaries and mitigations for the governance service." },
      { slug: "security-policy", upstream: "SECURITY.md", label: "Reporting vulnerabilities", summary: "How to report a vulnerability privately." },
    ],
  },
  {
    title: "Contribute",
    contributor: true,
    pages: [
      { slug: "contributing", upstream: "CONTRIBUTING.md", label: "Contributing", summary: "Trust boundaries to keep, contract changes, migrations and pre-PR checks." },
      { slug: "development", upstream: "docs/development.md", label: "Development", summary: "Configuration, bootstrap, local runs, tests and logs." },
      { slug: "roadmap", upstream: "docs/roadmap.md", label: "Roadmap", summary: "Delivered and remaining work." },
    ],
  },
];

export const projects = [
  {
    id: "sendbox",
    name: "SendBox",
    repo: "sendbox-dev/sendbox",
    route: "sendbox",
    logo: { upstream: "docs/assets/logo.svg", file: "assets/logos/sendbox.svg" },
    license: "LICENSE",
    tagline: "Give your coding agent a workspace, not your whole machine.",
    intro: "SendBox is an open-source Rust CLI for running coding agents in dedicated Linux VMs on macOS and Linux. Keep your terminal workflow while explicitly choosing the files, network destinations, credentials and MCP tools a session can use.",
    groups: sendboxGroups,
  },
  {
    id: "sendbox-fleet",
    name: "SendBox Fleet",
    repo: "sendbox-dev/sendbox-fleet",
    route: "fleet",
    logo: { upstream: "docs/assets/logo.svg", file: "assets/logos/sendbox-fleet.svg" },
    license: "LICENSE",
    tagline: "Shared governance for SendBox teams.",
    intro: "SendBox Fleet is the shared governance service for SendBox governed sessions: operator-signed policy profiles shared across users and hosts, project roles, session admission, credential grants and a hash-chained central audit log. Provider credentials never reach it; they stay in the SendBox host broker.",
    groups: fleetGroups,
  },
];

export function pagesOf(project) {
  return project.groups.flatMap((group) => group.pages.map((page) => ({ ...page, group: group.title })));
}

// Every file synced from upstream for a project: published documents, the logo and the license.
export function upstreamFiles(project) {
  return [...pagesOf(project).map((page) => page.upstream), project.logo.upstream, project.license];
}
