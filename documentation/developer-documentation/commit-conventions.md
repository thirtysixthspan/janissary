# Commit conventions

All commit messages and PR titles must follow the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification, detailed in [`ai/guidelines/conventional-commits.md`](https://github.com/thirtysixthspan/janissary/blob/master/ai/guidelines/conventional-commits.md). The format is:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Valid types: `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `revert`. Breaking changes are indicated with a `!` after the type/scope or a `BREAKING CHANGE:` footer.
