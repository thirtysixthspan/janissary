# Refuse a filter value that is not the column's own type

`typed` in `src/visualizations/transforms.ts` read a numeric cell with `Number(cell)`, and `isFilterStep` in `src/visualizations/chart-spec.ts` accepted any string as a value. So a model that misread a type — or a user who said "only twenty-twenty-four" — produced `"twenty-twenty-four"`, which became `NaN`, compared false against every cell, and matched no row. The chart was drawn with no marks, and the spec and `transforms.ts`'s own comment both call that state "a question with an empty answer", so nothing on screen said whether the filter was wrong or the answer genuinely was empty. `Number` did the same to an empty cell, reading it as `0`.

Two halves, because the value has to be refused in the grammar as well as in the applier:

- `typed` returns a number only for a finite one, treats an empty string as nothing rather than as `0`, and reads nothing at all for a `null` cell in a numeric column.
- `filterStep` checks each value before filtering and returns a named refusal naming the value and the type the column holds: `"twenty-twenty-four" is not a number, and "year" holds numbers`. A `null` value is left alone, because filtering for the cells that are empty is a thing people want.
- `isFilterStep` requires a value for every comparison including `contains`. A comparison with nothing to compare against matches every row or none, and which of the two it does is not something to build a chart on silently. `null` still passes, so "the empty ones" is still expressible.

A number against a text column is still accepted — it is a string that has not been quoted yet, and a CSV produces exactly those.

The spec's sentence is split in two: a mistyped value is refused, and an empty chart now means the question was answerable and the answer was empty. The distinction is the whole point of the change, and the old sentence collapsed them.

`src/visualizations/transforms.test.ts` gains cases for a non-numeric string against a numeric column, a bad value inside an `in` list against a boolean column, a numeric string accepted, a number accepted against a text column, an empty cell kept out of a numeric comparison, and the empty cells still matchable. `src/visualizations/chart-spec.test.ts` gains the grammar case, including `null` still passing.
