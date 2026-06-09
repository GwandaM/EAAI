/**
 * Tool harness CLI: invoke any model-facing tool directly from the terminal,
 * bypassing the model. Boots the real DI container, builds the same tool
 * objects the agent uses (via buildAgentTools), validates args with the same
 * Zod schemas the model is held to, and prints the { ok, ... } envelope.
 *
 *   npm run tools -- list
 *   npm run tools -- describe getPolicy
 *   npm run tools -- run getPolicy --args '{"policyId":"P-1001"}' --broker BRK-9
 *   npm run tools -- run oracle.query --args '{"sql":"SELECT 1 FROM dual"}'
 */
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { z } from 'zod';

import { buildAgentTools } from '../tools/agent-tools';
import { defineAgentTool, type AgentTool } from '../tools/ai-tool';
import type { BusinessToolContext } from '../tools/business-api/business-tool-context';
import { KnowledgeBaseService } from '../tools/knowledge-base/knowledge-base.service';
import { OracleService } from '../tools/oracle/oracle.service';
import { PartyService } from '../tools/party/party.service';
import { PolicyService } from '../tools/policy/policy.service';
import { wrapToolResult } from '../tools/tool-result';
import { ToolsCliModule } from './tools-cli.module';

const USAGE = `Tool harness CLI — invoke agent tools directly, no model involved.

Usage:
  npm run tools -- list
  npm run tools -- describe <tool>
  npm run tools -- run <tool> [--args '<json>'] [options]

Options:
  --args '<json>'   Tool input as a JSON object (default: {})
  --user <id>       BusinessToolContext.userId   (default: cli-dev-user)
  --email <email>   BusinessToolContext.email
  --broker <id>     BusinessToolContext.brokerId
  --party <id>      BusinessToolContext.partyId
  --json            Print only the raw JSON result (for piping/scripting)

Exit codes: 0 = ok:true, 1 = ok:false or invalid args, 2 = usage error.`;

class UsageError extends Error {}

type CliTool = AgentTool<unknown, unknown>;

interface CliArgs {
  command: string;
  toolName?: string;
  args?: string;
  user?: string;
  email?: string;
  broker?: string;
  party?: string;
  json: boolean;
}

const VALUE_FLAGS = new Set(['args', 'user', 'email', 'broker', 'party']);

function parseCliArgs(argv: string[]): CliArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (name === 'json') {
      flags[name] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) {
      throw new UsageError(`Unknown option: --${name}`);
    }
    const value = argv[i + 1];
    if (value === undefined) {
      throw new UsageError(`Missing value for --${name}`);
    }
    flags[name] = value;
    i += 1;
  }
  const [command, toolName] = positionals;
  if (!command) {
    throw new UsageError('No command given.');
  }
  return {
    command,
    toolName,
    args: flags.args as string | undefined,
    user: flags.user as string | undefined,
    email: flags.email as string | undefined,
    broker: flags.broker as string | undefined,
    party: flags.party as string | undefined,
    json: flags.json === true,
  };
}

function buildContext(cli: CliArgs): BusinessToolContext {
  return {
    userId: cli.user ?? 'cli-dev-user',
    email: cli.email,
    brokerId: cli.broker,
    partyId: cli.party,
  };
}

/** Dev-only Oracle wrapper. Lives in the CLI on purpose: the agent registry
 *  (buildAgentTools) must never expose raw SQL to the model. */
const oracleQuerySchema = z.object({
  sql: z
    .string()
    .min(1)
    .describe('Read-only SELECT/WITH statement. Use :name placeholders for binds.'),
  binds: z
    .record(z.union([z.string(), z.number(), z.null()]))
    .optional()
    .describe('Named bind values for :name placeholders.'),
});

function buildOracleCliTool(service: OracleService): CliTool {
  return defineAgentTool<z.infer<typeof oracleQuerySchema>, unknown>({
    description:
      'DEV-ONLY: run a read-only SQL query against Oracle. Not registered with the agent.',
    inputSchema: oracleQuerySchema,
    execute: async (input) => wrapToolResult('oracle.query', () => service.query(input)),
  }) as CliTool;
}

/** Strip Optional/Default/Nullable/Effects wrappers to reach the core schema. */
function unwrapSchema(schema: z.ZodTypeAny): {
  schema: z.ZodTypeAny;
  optional: boolean;
  defaultValue?: unknown;
} {
  let current = schema;
  let optional = false;
  let defaultValue: unknown;
  for (;;) {
    const def = current._def as {
      typeName?: string;
      innerType?: z.ZodTypeAny;
      schema?: z.ZodTypeAny;
      defaultValue?: () => unknown;
    };
    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodNullable') {
      optional = true;
      current = def.innerType as z.ZodTypeAny;
    } else if (def.typeName === 'ZodDefault') {
      optional = true;
      defaultValue = def.defaultValue?.();
      current = def.innerType as z.ZodTypeAny;
    } else if (def.typeName === 'ZodEffects' && def.schema) {
      current = def.schema;
    } else {
      return { schema: current, optional, defaultValue };
    }
  }
}

function typeLabel(schema: z.ZodTypeAny): string {
  const typeName = (schema._def as { typeName?: string }).typeName ?? 'ZodUnknown';
  return typeName.replace(/^Zod/, '').toLowerCase();
}

function describeTool(name: string, tool: CliTool): string {
  const lines = [name, `  ${tool.description}`, '', '  Input fields:'];
  const root = unwrapSchema(tool.inputSchema as z.ZodTypeAny).schema;
  const def = root._def as { typeName?: string };
  if (def.typeName !== 'ZodObject') {
    lines.push(`    (${typeLabel(root)})`);
    return lines.join('\n');
  }
  const shape = (root as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
  const entries = Object.entries(shape);
  if (entries.length === 0) {
    lines.push('    (none)');
  }
  for (const [field, fieldSchema] of entries) {
    const { schema, optional, defaultValue } = unwrapSchema(fieldSchema);
    const parts = [`${field}: ${typeLabel(schema)}`];
    parts.push(optional ? '(optional' : '(required');
    if (defaultValue !== undefined) {
      parts[parts.length - 1] += `, default ${JSON.stringify(defaultValue)}`;
    }
    parts[parts.length - 1] += ')';
    const description = fieldSchema.description ?? schema.description;
    if (description) {
      parts.push(`— ${description}`);
    }
    lines.push(`    ${parts.join(' ')}`);
  }
  return lines.join('\n');
}

function listTools(registry: Record<string, CliTool>): string {
  const names = Object.keys(registry).sort();
  const width = Math.max(...names.map((name) => name.length)) + 2;
  const lines = names.map(
    (name) => `  ${name.padEnd(width)}${registry[name].description}`,
  );
  return [`${names.length} tools available:`, '', ...lines].join('\n');
}

interface RunResult {
  output: string;
  exitCode: number;
}

async function runTool(registry: Record<string, CliTool>, cli: CliArgs): Promise<RunResult> {
  if (!cli.toolName) {
    throw new UsageError('run requires a tool name. Try: npm run tools -- list');
  }
  const tool = registry[cli.toolName];
  if (!tool) {
    throw new UsageError(
      `Unknown tool "${cli.toolName}". Try: npm run tools -- list`,
    );
  }

  let rawArgs: unknown = {};
  if (cli.args) {
    try {
      rawArgs = JSON.parse(cli.args);
    } catch {
      throw new UsageError(`--args is not valid JSON: ${cli.args}`);
    }
  }

  // Same gate the model faces: the AI SDK validates tool input against the
  // Zod schema before execute() ever runs.
  const schema = tool.inputSchema as z.ZodTypeAny;
  const validation = schema.safeParse(rawArgs);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    return {
      output: `Invalid args for ${cli.toolName}:\n${issues}`,
      exitCode: 1,
    };
  }

  const startedAt = Date.now();
  const result = await tool.execute?.(validation.data, {
    toolCallId: 'cli',
    messages: [],
  });
  const elapsedMs = Date.now() - startedAt;

  const ok =
    typeof result === 'object' && result !== null && 'ok' in result
      ? (result as { ok: boolean }).ok
      : true;
  const body = JSON.stringify(result, null, 2);
  return {
    output: cli.json ? body : `${cli.toolName} (${elapsedMs}ms)\n${body}`,
    exitCode: ok ? 0 : 1,
  };
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));

  if (cli.command === 'help') {
    console.log(USAGE);
    process.exit(0);
  }
  if (!['list', 'describe', 'run'].includes(cli.command)) {
    throw new UsageError(`Unknown command: ${cli.command}`);
  }

  const app = await NestFactory.createApplicationContext(ToolsCliModule, {
    logger: ['error', 'warn'],
  });

  let exitCode = 0;
  try {
    const registry: Record<string, CliTool> = {
      ...(buildAgentTools(
        {
          policy: app.get(PolicyService),
          party: app.get(PartyService),
          knowledgeBase: app.get(KnowledgeBaseService),
        },
        buildContext(cli),
      ) as unknown as Record<string, CliTool>),
      'oracle.query': buildOracleCliTool(app.get(OracleService)),
    };

    if (cli.command === 'list') {
      console.log(listTools(registry));
    } else if (cli.command === 'describe') {
      if (!cli.toolName || !registry[cli.toolName]) {
        throw new UsageError(
          'describe requires a known tool name. Try: npm run tools -- list',
        );
      }
      console.log(describeTool(cli.toolName, registry[cli.toolName]));
    } else {
      const result = await runTool(registry, cli);
      console.log(result.output);
      exitCode = result.exitCode;
    }
  } finally {
    await app.close();
  }
  // Explicit exit: the Oracle pool (when configured) holds the event loop open.
  process.exit(exitCode);
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exit(2);
  }
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
