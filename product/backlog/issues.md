# issues

## ready

* add a inverted text button at the end of the inline editor query when the query can be run. clicking the button will make it run. For example: 
> assistant give me a list of numbers from 1 to 10 [run]
when no agent has been entered the pill should say [agent?], for example:
> [agent?]
when the agent has been entered the pill should say [query?], for example:
> assistant [query?]
when the agent query is running the pill should say [running...], for example:
> assistant give me a list of numbers from 1 to 10 [running...]
when the agent comes back without a response the pill should say [no suggestion], for example:
> assistant give me a list of numbers from 1 to 10 [no suggestion]

* the inline editor query change sets should not sow as a separate change block at the top of the tab, instead it should show the actual change to the lines in the buffer with changed content highlighted using standard diff colors.


## development

## deferred
