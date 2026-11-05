# issues

## ready

* rename the 'acp' command to the 'ask' command

* add a default 'ask' role with description 'When you ask a question via ACP.' include the following models:
  "ask": {
    "description": "When you ask a question via ACP",
    "entries": [
      {
        "harness": "opencode",
        "model": "opencode-go/deepseek-v4.1-flash",
        "effort": "medium"
      },
      {
        "harness": "claude",
        "model": "claude-haiku-4-5",
        "effort": "high"
      },
      {
        "harness": "codex",
        "model": "gpt-6-luna",
        "effort": "high"
      }
    ]
  }

* update the list of models in harness-models.json to include claude, opencode and openai models. rename the file to known-models.json and any code or tests that use the old name.


## development

## deferred

## declined
