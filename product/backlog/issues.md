# issues

## ready

* update plan-a-new-feature.md with a research phase after the current step 2a. Call it "Research the feature". This phase should execute online research about the best way to implement the feature at hand. This research should be done in a directed subagent. Implement this task as ai/tasks/feature/research-a-feature.md and call it from plan-a-new-feature.md. the task will take a description of the feature, a short feature description passed by a human caller or a long feature description passed by an ai caller. The task will return a list of only the most relevant and valuable suggestions for use in the implementation of the feature. This research should look for the latest patterns, designs, strategies, techniques, tools and libraries that could be used in the implementation and which could be used to simplify or improve the implementation of the feature.
The caller will then use its own judgement about the appropriateness of the suggestions for plan building, as not all research results will necessarily be relevant. The caller may ask the user in the implementation question phase, irrespective of feature complexity, about the relevance of research results when the appropriateness, usefulness or need is not clear.

## deferred

## declined
