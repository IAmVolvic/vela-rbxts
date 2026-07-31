# Security Policy

## Supported Versions

`vela-rbxts` is pre-1.0. Only the latest published minor receives fixes.

| Version | Supported |
| --- | --- |
| 0.4.x | Yes |
| < 0.4 | No |

## Reporting a Vulnerability

Please do not open a public issue for a security report.

Report privately through GitHub Security Advisories:

<https://github.com/astra-void/vela-rbxts/security/advisories/new>

Include as much as you can:

- affected package and version
- a description of the issue and its impact
- reproduction steps, ideally a minimal roblox-ts project or a class string
- any suggested fix

## What to Expect

- Acknowledgement within 7 days.
- An assessment and a rough remediation timeline within 14 days.
- A fix released as a patch version, with credit in the advisory unless you ask
  otherwise.

Because this project is maintained by a single person, response times are best
effort rather than a guarantee.

## Scope

In scope:

- the compiler, transformer, and `rbxtsc` host adapter
- the language server and the VS Code extension
- the release and publish tooling in `scripts/release`

Out of scope:

- vulnerabilities in roblox-ts, Roblox Studio, or other upstream dependencies —
  report those to their maintainers
- issues that require a user to run an already-untrusted `vela.config.ts`, since
  config files execute as ordinary project code
