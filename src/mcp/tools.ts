import { z } from 'zod';

export type ToolResult = { text: string; isError: boolean };

export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<ToolResult>;

export const questionInputSchema = z.object({
  tab: z.string(),
  kind: z.string(),
  question: z.string(),
  options: z.array(z.string()).optional(),
});

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
};

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: 'question',
    description: 'Ask the human a question in a tab, or request approval with options.',
    inputSchema: questionInputSchema,
  },
];
