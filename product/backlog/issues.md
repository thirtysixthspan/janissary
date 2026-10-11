# issues

## ready

* pass token in kilo-token into sandbox environment for opencode to use to connect to the kilo gateway.

* support chatgpt oauth authentication for opencode in sandbox environments by taking credentials from ~/.codex/auth.json on the application side and making them available in the auth file in a temporary directory used for launching opencode in the correct json format (requires reformating from chatgpt auth)
jq -n \
  --slurpfile codex "$HOME/.codex/auth.json" '
  ($codex[0].tokens.access_token) as $access |
  ($access | split(".")[1] | @base64d | fromjson | .exp * 1000) as $expires |
  {
    openai: {
      type: "oauth",
      access: $access,
      refresh: $codex[0].tokens.refresh_token,
      expires: $expires,
      accountId: $codex[0].tokens.account_id
    }
  }'
tmp=$(mktemp -d)
mkdir -p "$tmp/opencode"
# Write converted Codex OAuth JSON into:
# "$tmp/opencode/auth.json"
XDG_DATA_HOME="$tmp" opencode

## development

## deferred

## declined
