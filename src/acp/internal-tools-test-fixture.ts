// The codex deny-all configuration the tests expect. The names are written out on purpose, never derived
// from `CODEX_DISABLED_FEATURES`, so a key dropped from that list fails every suite that expects them.
export const CODEX_FEATURES_OFF = {
  shell_tool: false,
  unified_exec: false,
  view_image: false,
  image_generation: false,
  multi_agent: false,
  apps: false,
  goals: false,
  tool_suggest: false,
  multi_agent_v2: false,
  code_mode: false,
  request_permissions_tool: false,
  standalone_web_search: false,
};

export const CODEX_TOOLS_OFF = { update_plan: { enabled: false }, experimental_request_user_input: { enabled: false } };

export const CODEX_DENY_ALL = { web_search: 'disabled', features: CODEX_FEATURES_OFF, tools: CODEX_TOOLS_OFF };
