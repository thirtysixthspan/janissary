<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Guard the ssh-config alias reader against unbounded glob complexity in Host patterns

Existing Issue: compilePatterns in src/plugins/hosts/ssh-config/parse.ts constructs a Minimatch from every Host-pattern name in the config text without the length and star-count cap that src/file-glob/match.ts applies before compiling user-supplied globs, and it recompiles them for every alias, so a config with many star-heavy patterns drives synchronous matching with no bound. Severity: 5/10

Existing Risk: 6/10 - A config read from an untrusted checkout through hosts import <file> can stall the main thread during import or export, with cost growing as name length raised to the star count and no guard short of the 1 MiB read ceiling.

Proposal Risk: 2/10 - A bounded host-pattern check refuses pathological patterns before compilation while ordinary * and ? host patterns keep matching as today, leaving only the small chance that an unusual but legitimate pattern is refused.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "guard the ssh-config Host-pattern matcher against unbounded glob complexity". In src/plugins/hosts/ssh-config/parse.ts, add a complexity check to compilePatterns, or a sibling helper in src/plugins/hosts/ssh-config/ since these modules cannot import through ../, that caps pattern length and the number of * runs in one name, mirroring the rationale in src/file-glob/pattern-limits.ts and the guarded call site in src/file-glob/match.ts; keep the nocase, dot, nobrace, noext, nonegate options and the manual leading-! stripping unchanged, and have a refused pattern make its block non-matching rather than throw out of readEffectiveAliases. Add colocated cases to src/plugins/hosts/ssh-config/parse.test.ts for an over-long pattern, a star-heavy pattern, and an ordinary * / ? pattern that must still match, so the guard neither fails open nor rejects normal configs. Do not change tokenizeSshConfig or its block-list cases, which pin the preserved tokenizer behavior.


* Match literal Host aliases whose names contain minimatch metacharacters against their own block

Existing Issue: isLiteralName in src/plugins/hosts/ssh-config/parse.ts accepts a name such as [::1] because it has no * or ? and no leading !, but compilePatterns passes that same literal to Minimatch, which reads it as a character class, so the alias never matches its own Host block and its HostName, User, and Port are silently lost. Severity: 4/10

Existing Risk: 5/10 - A config whose Host line uses a bracketed IPv6 literal or another bracket or backslash in a literal name yields an alias with empty values, so a later import falls back to the alias name as the destination instead of the configured HostName, with nothing in the result to signal the substitution.

Proposal Risk: 2/10 - Escaping the characters minimatch treats as syntax but ssh treats literally leaves wildcard matching unchanged, so the only residual risk is a pattern that relied on minimatch character-class behavior that ssh never supported.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "match literal Host aliases whose names contain minimatch metacharacters against their own block". In src/plugins/hosts/ssh-config/parse.ts, escape the bracket and backslash characters in each pattern before constructing Minimatch in compilePatterns, or swap in a literal-only * / ? matcher behind the same call, so a name containing these characters matches its literal spelling while * and ? keep their wildcard meaning; keep the leading-! stripping and the nocase, dot, nobrace, noext, nonegate options unchanged. Add cases to src/plugins/hosts/ssh-config/parse.test.ts covering a bracketed IPv6-style alias whose HostName comes from its own block, a backslash-bearing name, and an ordinary * pattern that must still match. Leave tokenizeSshConfig and its block-list cases untouched.
