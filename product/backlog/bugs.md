# bugs

## ready

* when querying an acp agent, the 'Thinking' should be on the next line and entirely visible, but it is not. It looks like:
> ask size of a manhole cover in san francisco
  inking <spinner>
Then the result is covered:
See thought processndard SFPUC sewer manhole frame and cover is 26 inches in diameter (detail MH-1.10), with 30-inch frames and covers (MH-1.13/MH-1.14) also standard for larger structures. There's no single citywide size — those are the two common ones, plus other utility covers of varying sizes.
Instead we should see:
> ask size of a manhole cover in san francisco
[thinking <spinner>]
and
> ask size of a manhole cover in san francisco
[see though process]
San Francisco's standard SFPUC sewer manhole frame and cover is 26 inches in diameter (detail MH-1.10), with 30-inch frames and covers (MH-1.13/MH-1.14) also standard for larger structures. There's no single citywide size — those are the two common ones, plus other utility covers of varying sizes.


## development

## deferred

## declined
