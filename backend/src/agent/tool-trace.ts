/**
 * Dev-observability hooks for the agent loop: colourised stderr traces of
 * every tool call's args, result, duration and step boundaries. Wired into
 * streamText/generateText via the experimental_onToolCall* options.
 */

function dim(s: string): string {
  return `\x1b[2m${s} \x1b[0m`;
}

function cyan(s: string): string {
  return `\x1b[36m${s} \x1b[0m`;
}

function green(s: string): string {
  return `\x1b[32m${s} \x1b[0m`;
}

function red(s: string): string {
  return `\x1b[31m${s} \x1b[0m`;
}

function truncate(value: unknown, maxLen = 200): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > maxLen ? s.slice(0, maxLen) + "..." : s;
}

interface ToolCallStartEvent {
  toolCall: { toolName: string; input: unknown };
}

interface ToolCallFinishEvent {
  toolCall: { toolName: string };
  durationMs: number;
  success: boolean;
  output?: unknown;
  error?: unknown;
}

export function onToolCallStart({ toolCall }: ToolCallStartEvent): void {
  const name = cyan(toolCall.toolName);
  const args = truncate(toolCall.input);
  console.error(dim(`\n------------------`));
  console.error(`${dim("[-]")} ${name} ${dim("called")} `);
  console.error(` ${dim("args:")} ${args} `);
}

export function onToolCallFinish(event: ToolCallFinishEvent): void {
  const name = cyan(event.toolCall.toolName);
  if (event.success) {
    const out = truncate(event.output);
    console.error(` ${dim("[✓]")} ${name} ${green("✓")} ${dim(`(${event.durationMs}ms)`)} `);
    console.error(` ${dim("result:")} ${out} `);
  } else {
    console.error(` ${dim("[x]")} ${name} ${red("X")} ${dim(`(${event.durationMs}ms)`)} `);
    console.error(` ${dim("error:")} ${event.error} `);
  }
}

export function onStepFinish({ toolCalls }: { toolCalls: unknown[] }): void {
  if (toolCalls.length > 0) {
    console.error(dim(` -- Step complete: ${toolCalls.length} tool call(s) - `));
    console.error();
  }
}
