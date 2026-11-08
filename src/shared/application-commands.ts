
export type ApplicationCommandRow = Readonly<{
  name: string;
  kind: ApplicationCommandKind;
  aliases: readonly string[];
  forms: readonly string[];
  parent?: string;
  nativeTool?: 'database' | 'browser' | 'question';
}>;

export type ApplicationCommandDeclaration = Readonly<{
  name: string;
  forms: readonly string[];
  aliases?: readonly string[];
  parent?: string;
  nativeTool?: 'database' | 'browser' | 'question';
}>;

export type ApplicationCommandKind = 'builtin' | 'plugin' | 'help' | 'native';
