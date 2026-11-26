<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Match literal Host aliases whose names contain minimatch metacharacters against their own block

Existing Issue: isLiteralName in src/plugins/hosts/ssh-config/parse.ts accepts a name such as [::1] because it has no * or ? and no leading !, but compilePatterns passes that same literal to Minimatch, which reads it as a character class, so the alias never matches its own Host block and its HostName, User, and Port are silently lost. Severity: 4/10

Existing Risk: 5/10 - A config whose Host line uses a bracketed IPv6 literal or another bracket or backslash in a literal name yields an alias with empty values, so a later import falls back to the alias name as the destination instead of the configured HostName, with nothing in the result to signal the substitution.

Proposal Risk: 2/10 - Escaping the characters minimatch treats as syntax but ssh treats literally leaves wildcard matching unchanged, so the only residual risk is a pattern that relied on minimatch character-class behavior that ssh never supported.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "match literal Host aliases whose names contain minimatch metacharacters against their own block". In src/plugins/hosts/ssh-config/parse.ts, escape the bracket and backslash characters in each pattern before constructing Minimatch in compilePatterns, or swap in a literal-only * / ? matcher behind the same call, so a name containing these characters matches its literal spelling while * and ? keep their wildcard meaning; keep the leading-! stripping and the nocase, dot, nobrace, noext, nonegate options unchanged. Add cases to src/plugins/hosts/ssh-config/parse.test.ts covering a bracketed IPv6-style alias whose HostName comes from its own block, a backslash-bearing name, and an ordinary * pattern that must still match. Leave tokenizeSshConfig and its block-list cases untouched.
