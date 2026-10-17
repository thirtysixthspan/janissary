On every launch the state directory is cleared before the UI renders, so every session starts fresh.

The one exception to that cleanup is the parked remote session record: every launch reattaches every parked remote session (see `sessions-tab.md`). No tab is restored. Every launch opens the required `janus` shell and then attempts to create one hidden, managed `system` shell (see `tabs.md`). The `system` shell starts in the project directory without a workspace. If it cannot start, the app posts the startup-failure notification and continues; failure to open `janus` remains fatal.

No tab's state is saved. Shell and harness tabs, view tabs, harness tabs, and plugin tabs alike are live and in-memory, and none of them is written to disk to be recreated by a later launch.
