# issues

## ready

* add the max tool turns configuration to the config.json file with a default of 20 if it is not present.

* refreshing models from the model tab should not include the addition of non-conversational models to known models.

* collapsable tool sections in the connections tab should have both a command and reply section rather than two tool seperate tool sections

* provide more guidance to the subagent about generating and delineating a final result section so that it can be cleanly extracted and no thought processes or tool calls are included in the response to the caller. the delimiters themselved should not be returned to the caller, just the contents.

* supplement the subagents tool preamble to identify which standard harness tools are not enabled and should not be called. For example, ask sessions do not include access to the bash or shell tool.

* include the preamble that subagents receive in the connection tab transcript.

## development

## deferred

## declined
