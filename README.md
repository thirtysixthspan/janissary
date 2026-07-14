# Janissary

A [Janissary](https://en.wikipedia.org/wiki/Janissary) was an elite infantry soldier in the Ottoman Empire — a servant of the gate, loyal, and ever-ready. 

Janissary is an **Agentic Working Environment**. In other words, it is an application for supporting your work using AI agents.

See the [User Docs](https://thirtysixthspan.github.io/janissary/user-documentation/getting-started/application) for the full command reference, tab types, and automation/advanced-agent guides, and the [Developer Docs](https://thirtysixthspan.github.io/janissary/developer-documentation/) for testing, code quality, and contribution workflow. Once running, type `help` for a quick command and key-binding summary.

## Prerequisites

- macOS
- Node.js 24+
- Google Chrome 

## Usage

```
npx janus
```

Or install globally:

```
npm install -g janissary
janus
```

See [`help.md`](help.md) for the full in-app command and key-binding reference (the same
content the `help` command prints), and the [documentation site](https://thirtysixthspan.github.io/janissary/)
for tab types, automation, and advanced-agent guides.

## Security

### Workspace sandbox (macOS only)

A workspaced tab (`agent -w` / `harness -w`) confines its processes to the workspace directory using a kernel-enforced Seatbelt sandbox. Network access is allowed by default; add `--offline` to a workspaced tab to deny it instead. Isolation is on by default; set `"sandboxWorkspaces": false` in `.janissary/config.json` to disable it. See the [Developer Docs](https://thirtysixthspan.github.io/janissary/developer-documentation/workspace-sandbox) for the full read/write carve-out model, GitHub push/PR token setup, and known limitations.

### Dev-tooling security checks

See the [Developer Docs](https://thirtysixthspan.github.io/janissary/developer-documentation/security-checks) for the automated lint/secrets/dependency checks that run in this repo's own CI, and their threat model.

## License

Janissary is free to use under the [PolyForm Noncommercial License](LICENSE) for any noncommercial purpose. Any commercial use — including using Janissary in a commercial setting for your own software development — requires a commercial license. Commercial licenses are available on request; see [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md) for how to request one.

## Development

```bash
npm start
```

Run tests:

```bash
npm test
```

See the [Developer Docs](https://thirtysixthspan.github.io/janissary/developer-documentation/) for the doc site build, testing, checking changes, code coverage, code quality, code duplication, CSS linting, dead code, security checks, linting, and commit conventions.

