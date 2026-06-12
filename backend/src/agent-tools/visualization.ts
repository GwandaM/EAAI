import { tool } from 'ai';
import { z } from 'zod';

/**
 * Visualization tools are validate-and-echo: the model composes a declarative
 * spec, the tool validates it against the schema, and the frontend renders the
 * tool-result part as an actual chart/diagram component. No upstream I/O.
 */

const CHART_TYPES = [
  'bar',
  'horizontal-bar',
  'line',
  'area',
  'pie',
  'donut',
  'scatter',
] as const;

const pointSchema = z.object({
  x: z
    .union([z.string().min(1).max(80), z.number()])
    .describe(
      'Category label (bar/pie/line over categories) or numeric x value (scatter, numeric time axis).',
    ),
  y: z.number().describe('The numeric value to plot.'),
});

const seriesSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .describe('Series name shown in the legend, e.g. a product or broker name.'),
  points: z.array(pointSchema).min(1).max(100),
});

const chartInputSchema = z.object({
  chartType: z
    .enum(CHART_TYPES)
    .describe(
      'Choose the type that best fits the data: bar/horizontal-bar for categorical comparisons, pie/donut for share-of-total distributions, line/area for trends over time, scatter for correlations between two numeric values.',
    ),
  title: z.string().min(1).max(120).describe('Short human-readable chart title.'),
  description: z
    .string()
    .max(500)
    .optional()
    .describe('Optional one-sentence caption shown under the chart.'),
  xAxisLabel: z.string().min(1).max(60).optional(),
  yAxisLabel: z.string().min(1).max(60).optional(),
  series: z
    .array(seriesSchema)
    .min(1)
    .max(8)
    .describe(
      'One or more named data series. Pie/donut charts accept exactly one series whose points are the slices.',
    ),
});

export type ChartInput = z.infer<typeof chartInputSchema>;
export type ChartSpec = ChartInput & { kind: 'chart' };

// Mermaid is rendered client-side; reject specs that can't possibly render so
// the model gets a correctable ok:false instead of the user seeing a broken
// diagram. First word must be a diagram type mermaid actually supports.
const MERMAID_DIAGRAM_TYPES = [
  'graph',
  'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'quadrantChart',
  'timeline',
  'mindmap',
];

const diagramInputSchema = z.object({
  title: z.string().min(1).max(120).describe('Short human-readable diagram title.'),
  description: z
    .string()
    .max(500)
    .optional()
    .describe('Optional one-sentence caption shown under the diagram.'),
  mermaid: z
    .string()
    .min(10)
    .max(4000)
    .describe(
      'Mermaid source. Must start with a diagram type such as "flowchart TD", "graph LR", "sequenceDiagram", "erDiagram", "mindmap" or "timeline". Keep node labels short; do not include markdown fences.',
    ),
});

export type DiagramInput = z.infer<typeof diagramInputSchema>;
export type DiagramSpec = DiagramInput & { kind: 'diagram' };

function validateChart(input: ChartInput): ChartSpec {
  if ((input.chartType === 'pie' || input.chartType === 'donut') && input.series.length !== 1) {
    throw new Error(
      `A ${input.chartType} chart requires exactly one series (got ${input.series.length}). Put each slice as a point { x: label, y: value } of a single series.`,
    );
  }
  if (input.chartType === 'scatter') {
    const nonNumeric = input.series
      .flatMap((s) => s.points)
      .some((p) => typeof p.x !== 'number');
    if (nonNumeric) {
      throw new Error(
        'A scatter chart requires numeric x values on every point. Use a bar chart for categorical x values.',
      );
    }
  }
  return { kind: 'chart', ...input };
}

function validateDiagram(input: DiagramInput): DiagramSpec {
  const source = input.mermaid.trim();
  if (source.startsWith('```')) {
    throw new Error('Provide raw mermaid source without markdown code fences.');
  }
  const firstWord = source.split(/\s/, 1)[0];
  if (!MERMAID_DIAGRAM_TYPES.includes(firstWord)) {
    throw new Error(
      `Mermaid source must start with a diagram type (one of: ${MERMAID_DIAGRAM_TYPES.join(', ')}); got "${firstWord}".`,
    );
  }
  return { kind: 'diagram', ...input, mermaid: source };
}

// Unlike the API tools, visualization tools return an { ok } envelope instead
// of throwing: the frontend renders `output.ok === true` parts as components,
// and an ok:false result gives the model a correctable validation message.
type VisualizationOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function present<T>(validate: () => T): VisualizationOutcome<T> {
  try {
    return { ok: true, data: validate() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createVisualizationTools() {
  return {
    presentChart: tool({
      description:
        'Render a chart in the chat UI. Call this whenever you present numerical or categorical results that are easier to grasp visually — distributions (e.g. clients per product), comparisons, shares of a total, trends over time, or correlations. Pick the chartType that best fits the data. The chart is shown to the user directly; still explain the key takeaways in your text answer.',
      inputSchema: chartInputSchema,
      execute: async (input) => present(() => validateChart(input)),
    }),
    presentDiagram: tool({
      description:
        'Render a Mermaid diagram in the chat UI. Use for structural or process information — relationships between parties, policies and organisations, ownership trees, or step-by-step flows. The diagram is shown to the user directly; still explain it in your text answer.',
      inputSchema: diagramInputSchema,
      execute: async (input) => present(() => validateDiagram(input)),
    }),
  };
}
