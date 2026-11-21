# issues

## ready

* `ai/guidelines/plan-template.md` records Assumptions without an anchor: §23–25 asks each bullet to name "the fact and its source (a file, a spec, or an answer)," but names no format. A plan can therefore carry "the close method already kills the subprocess" as a settled premise with no `path:line`, and nothing catches it if the code disagrees. Closing this means requiring every Assumptions bullet to express a single assumption about the code and to carry a `path:line` plus the quoted identifier (matching `improve-plan.md:74`'s anchor rule). update improve-plan.md to be responsible for verifying that assumptions have anchors and identifiers and that the assumptions, pointer and identifiers are correct.

* `ai/guidelines/plan-template.md` Requirements should be numbered and quoted near-verbatim. §29 says "one per bullet" and "traceable," but a bulleted, paraphrased list can't be counted reproducibly. Number them 1., 2., split any "and" joining two behaviors, and quote the feature text and resolved answers rather than restating.

## deferred

## declined
