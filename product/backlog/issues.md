# issues

## ready

* update plan-a-feature.md to add a question round and plan section specifically for UI concerns.

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


## development

## deferred

## declined
