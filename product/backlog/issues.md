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

* when establishing an acp session, the models should use the 'ask' role. The role will provide multiple models in order of preference. each model should be tried until a given model succeeds. some model may be out of credits or not have the proper provider credentials. an ACP request should only fail once all the models in the role have been attempted.

* update the list of models in harness-models.json to include claude, opencode and openai models. rename the file to known-models.json and any code or tests that use the old name.


## development

## deferred

## declined
