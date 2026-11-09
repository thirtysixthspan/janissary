export const APPLICATION_COMMAND_NATIVE_TOOLS = ['database', 'browser', 'question'] as const;
export const APPLICATION_COMMAND_SOURCES = ['home', 'project', 'default'] as const;
export const APPLICATION_COMMAND_KINDS = ['builtin', 'plugin', 'help', 'native'] as const;

export type ApplicationCommandNativeTool = (typeof APPLICATION_COMMAND_NATIVE_TOOLS)[number];
export type ApplicationCommandSource = (typeof APPLICATION_COMMAND_SOURCES)[number];
export type ApplicationCommandKind = (typeof APPLICATION_COMMAND_KINDS)[number];

export type ApplicationCommandRow = Readonly<{
  name: string;
  kind: ApplicationCommandKind;
  aliases: readonly string[];
  forms: readonly string[];
  parent?: string;
  nativeTool?: ApplicationCommandNativeTool;
}>;

export type ApplicationCommandDeclaration = Readonly<{
  name: string;
  forms: readonly string[];
  aliases?: readonly string[];
  parent?: string;
  nativeTool?: ApplicationCommandNativeTool;
}>;

export type DisabledApplicationCommand = Readonly<{
  name: string;
  aliases: readonly string[];
  forms: readonly string[];
}>;
