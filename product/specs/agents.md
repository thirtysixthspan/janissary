# Tab names

## agent names

The 52 agent names (from `agent-names.json`) are a preset list of lowercase Turkish-origin names: ahmed, akbar, aslan, basir, bekir, bilal, cafer, cahit, cavus, davud, demir, dogan, ekrem, emrah, ersin, farid, fariz, fikri, hakim, hamza, harun, idris, ilyas, imran, jabir, jalal, jamal, kadir, kamil, kasim, latif, lutfi, mahir, malik, murad, omair, orhan, osman, rasim, recep, rifat, sabri, salih, selim, tahir, timur, turan, yahya, yavuz, yusuf.

A project can supply its own `.janissary/agent-names.json` (a JSON array of names) to replace this preset list entirely for that project. Names in the file are lowercased and duplicates dropped. If the file is missing, the preset list is used. If it exists but isn't valid JSON, the warning `.janissary/agent-names.json is invalid JSON — using the bundled name list` is printed and the preset list is used. The same happens, with the warning `.janissary/agent-names.json is not a non-empty list of valid agent names — using the bundled name list`, when the file isn't a non-empty array of strings or any name couldn't serve as a single workspace folder and a state-file name (empty, `.` or `..`, or holding a `/`, a `\`, a space, or any character other than letters, digits, `_`, `.`, and `-`). Loading lives in `src/agent/names.ts` (`decodeAgentNames`).


## Shell and harness launch names

The bundled shell plugin draws unused names from this pool for unnamed tabs. Harnesses use their own tool name with a numeric suffix by default. Explicit names are case-insensitive and are refused on clashes with open tabs, live Sessions rows, or a running workspace. `src/launch-name/check.ts` owns the shared checks; `src/launch-name/local.ts` owns local workspace preflight. See [[shell-tab]], [[harness]], and [[workspaced-agent]].
