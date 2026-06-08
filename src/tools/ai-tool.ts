import { tool } from 'ai';

export interface AgentTool<Input, Output> {
  description: string;
  inputSchema: unknown;
  execute?: (input: Input, options?: unknown) => Promise<Output>;
}

type ToolDefinition<Input, Output> = {
  description: string;
  inputSchema: unknown;
  execute: (input: Input, options?: unknown) => Promise<Output>;
};

const defineTool = tool as unknown as <Input, Output>(
  definition: ToolDefinition<Input, Output>,
) => AgentTool<Input, Output>;

export function defineAgentTool<Input, Output>(
  definition: ToolDefinition<Input, Output>,
): AgentTool<Input, Output> {
  return defineTool(definition);
}
