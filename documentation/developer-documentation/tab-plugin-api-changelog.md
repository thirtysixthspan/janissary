# Tab-plugin API changelog

This changelog tracks the host contract version from `src/plugins/api.ts`, not an individual
plugin's package version. The current host contract is **1.0**.

## Compatibility policy

A plugin may activate when its required API major equals the host major and its required minor is no
newer than the host minor. Plugin tab payload schemas are versioned separately and match exactly.

- **Minor:** an additive optional field, hook, or capability that preserves every frozen fixture.
- **Major:** removal, rename, tighter type or validation, changed observable ordering/semantics, or
  any change that breaks a frozen compatibility fixture.

A replacement ships before a contract is deprecated. The deprecation notice names the replacement
and removal version, warns once per process at the point of use, and keeps the old behavior for at
least two subsequent minor releases. Removal includes migration notes here.

## 1.0 — 2026-08-02

Initial bundled tab-plugin contract:

- static declarations with command, opener, MIME, tab metadata, and capability claims;
- literal lazy server and client loaders;
- one generic, versioned plugin-tab envelope and plugin-intent request/reply;
- stable-instance tab dedupe and tab-owned served-file cleanup;
- transcript, plugin-tab, served-file, external-viewer, and external-open server capabilities;
- resource URL, tab-scoped intent, and Split-action client capabilities;
- guarded activation, validation, handlers, disposal, lazy rendering, process-lifetime disablement,
  timing, and fixed execution budgets; and
- the permanent `fixture-v1` compatibility plugin.

No APIs are deprecated in 1.0.

## Future entries

Record the API version and date, classify compatibility impact, name affected contracts, and include
migration instructions. A deprecation entry must also state its replacement, first warning version,
and planned removal version.
