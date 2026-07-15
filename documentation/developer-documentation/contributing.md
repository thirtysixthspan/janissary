# Contributing

Contributions to Janissary are welcome — but the shape they take is deliberately unusual. Janissary is built by driving agents through a [product development workflow](/user-documentation/workflows/product-development): work is thought through as a **plan** first, and an agent turns that plan into code. Contributions follow the same model. What we ask you to contribute is a **draft plan**, not a patch.

## What to contribute, and how

### Bugs and feature requests → GitHub issues

Report bugs and propose high-level feature ideas through **[GitHub issues](https://github.com/thirtysixthspan/janissary/issues)**. This is the right channel for anything that is a report or a request rather than a worked-out proposal:

- **Bugs** — what you did, what happened, and what you expected instead.
- **Feature requests** — the capability you'd like and why, at a high level. You don't need to work out how it should behave in detail; the idea is enough.

Issues feed the project's backlog. Someone may pick one up, think it through into a plan, and build it — you don't need to write the plan yourself to file an issue.

### Worked-out proposals → a draft plan by pull request

If you've thought a change through and want to contribute the thinking, open a **pull request that adds a single draft plan file** under `product/plans/draft/`. A plan is a functional specification: it describes *what* the change does and *how you'll know it's done*, so the project can convert it into code.

Open your pull request with the draft-plan template applied by appending `?template=draft-plan.md` to the compare URL — [start one here](https://github.com/thirtysixthspan/janissary/compare?template=draft-plan.md). The template's checklist is the contribution guideline in short form. (The template is opt-in rather than automatic, so core contributors' plan-to-code pull requests aren't held to it.)

A good draft plan states:

- **What it does** — the behavior, from the user's point of view. What changes, what the user sees, how it responds.
- **Decisions already made** — the choices you've settled, so they don't get re-litigated during implementation.
- **What's out of scope** — the boundary, so the change stays focused.
- **How you'll know it's done** — the observable outcomes that mean the behavior is correct.

**Leave out the implementation.** Do not specify file paths, function names, module structure, data types, or which existing code to touch. Those are decisions the project makes when it converts the plan into code — a contributed plan that hard-codes them just constrains the implementation without adding value. Describe the *behavior*; let the project work out the *mechanism*.

Think of it this way: if a sentence would still be true after the code was rewritten from scratch, it belongs in the plan. If it would break, it's an implementation detail — leave it out.

## What happens to your plan

A contributed plan lands in `product/plans/draft/` — the same place the project's own draft plans start. From there it goes through the normal [workflow](/user-documentation/workflows/product-development): the project reviews and hardens the draft against the current state of the codebase, resolves anything ambiguous, and — once nothing is left unresolved — an agent implements it and writes the resulting behavior into a spec. Your contribution is the plan; the project supplies the code.

Because of this split, **pull requests that contain source code, tests, or configuration changes are not the contribution path.** A change arrives as a plan and leaves as code written by the project. If you've written code to prove an idea works, that's useful background — describe what you learned in the plan's prose, but keep the diff itself to the single plan file.

## In short

| You have… | Contribute it as… |
| --- | --- |
| A bug | A [GitHub issue](https://github.com/thirtysixthspan/janissary/issues) |
| A high-level feature idea | A [GitHub issue](https://github.com/thirtysixthspan/janissary/issues) |
| A worked-out, behavior-level proposal | A pull request adding one draft plan under `product/plans/draft/` |
| A code patch | Rework it into a draft plan — the project writes the code |
