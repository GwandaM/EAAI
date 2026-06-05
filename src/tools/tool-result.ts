import { Logger } from '@nestjs/common';

const toolLogger = new Logger('AgentTool');

export type ToolOutcome<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Wrap a tool execution so a thrown error becomes a structured `{ ok: false, error }`
 * payload returned to the model. This keeps the agent loop alive — the model can
 * see the failure, reason about it, and either retry, call a different tool, or
 * tell the user what went wrong, instead of the entire HTTP request 500-ing.
 */
export async function wrapToolResult<T>(
  toolName: string,
  fn: () => Promise<T>,
): Promise<ToolOutcome<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown tool error';
    toolLogger.error(`Tool "${toolName}" failed: ${message}`);
    return { ok: false, error: message };
  }
}
