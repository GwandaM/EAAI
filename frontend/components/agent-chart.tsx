'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// Mirrors the backend presentChart tool output (backend/src/tools/visualization).
export interface ChartSpec {
  kind: 'chart';
  chartType:
    | 'bar'
    | 'horizontal-bar'
    | 'line'
    | 'area'
    | 'pie'
    | 'donut'
    | 'scatter';
  title: string;
  description?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  series: { name: string; points: { x: string | number; y: number }[] }[];
}

const PALETTE = [
  '#2563eb',
  '#0d9488',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#db2777',
  '#65a30d',
  '#0891b2',
];

const CHART_HEIGHT = 300;

/** Merge all series into Recharts rows keyed by x: { x, [seriesName]: y }. */
function toRows(spec: ChartSpec): Record<string, string | number>[] {
  const rows = new Map<string | number, Record<string, string | number>>();
  for (const series of spec.series) {
    for (const point of series.points) {
      const row = rows.get(point.x) ?? { x: point.x };
      row[series.name] = point.y;
      rows.set(point.x, row);
    }
  }
  return [...rows.values()];
}

function axes(spec: ChartSpec, numericX = false) {
  return (
    <>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
      <XAxis
        dataKey="x"
        type={numericX ? 'number' : 'category'}
        tick={{ fontSize: 12 }}
        label={
          spec.xAxisLabel
            ? { value: spec.xAxisLabel, position: 'insideBottom', offset: -4, fontSize: 12 }
            : undefined
        }
      />
      <YAxis
        tick={{ fontSize: 12 }}
        label={
          spec.yAxisLabel
            ? { value: spec.yAxisLabel, angle: -90, position: 'insideLeft', fontSize: 12 }
            : undefined
        }
      />
      <Tooltip />
      {spec.series.length > 1 && <Legend />}
    </>
  );
}

function chartBody(spec: ChartSpec) {
  const rows = toRows(spec);

  switch (spec.chartType) {
    case 'bar':
      return (
        <BarChart data={rows}>
          {axes(spec)}
          {spec.series.map((s, i) => (
            <Bar key={s.name} dataKey={s.name} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </BarChart>
      );
    case 'horizontal-bar':
      return (
        <BarChart data={rows} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis type="number" tick={{ fontSize: 12 }} />
          <YAxis dataKey="x" type="category" width={120} tick={{ fontSize: 12 }} />
          <Tooltip />
          {spec.series.length > 1 && <Legend />}
          {spec.series.map((s, i) => (
            <Bar key={s.name} dataKey={s.name} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </BarChart>
      );
    case 'line':
      return (
        <LineChart data={rows}>
          {axes(spec)}
          {spec.series.map((s, i) => (
            <Line
              key={s.name}
              dataKey={s.name}
              stroke={PALETTE[i % PALETTE.length]}
              dot={false}
              type="monotone"
            />
          ))}
        </LineChart>
      );
    case 'area':
      return (
        <AreaChart data={rows}>
          {axes(spec)}
          {spec.series.map((s, i) => (
            <Area
              key={s.name}
              dataKey={s.name}
              stroke={PALETTE[i % PALETTE.length]}
              fill={PALETTE[i % PALETTE.length]}
              fillOpacity={0.25}
              type="monotone"
            />
          ))}
        </AreaChart>
      );
    case 'pie':
    case 'donut': {
      const slices = spec.series[0]?.points ?? [];
      return (
        <PieChart>
          <Tooltip />
          <Legend />
          <Pie
            data={slices.map((p) => ({ name: String(p.x), value: p.y }))}
            dataKey="value"
            nameKey="name"
            innerRadius={spec.chartType === 'donut' ? '55%' : 0}
            label={({ name, percent }) =>
              `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
            }
          >
            {slices.map((p, i) => (
              <Cell key={String(p.x)} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      );
    }
    case 'scatter':
      return (
        <ScatterChart>
          {axes(spec, true)}
          {spec.series.map((s, i) => (
            <Scatter
              key={s.name}
              name={s.name}
              data={s.points}
              dataKey="y"
              fill={PALETTE[i % PALETTE.length]}
            />
          ))}
        </ScatterChart>
      );
  }
}

export function AgentChart({ spec }: { spec: ChartSpec }) {
  return (
    <figure className="my-3 rounded-md border border-border bg-background p-3">
      <figcaption className="mb-2 text-sm font-medium">{spec.title}</figcaption>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        {chartBody(spec)}
      </ResponsiveContainer>
      {spec.description && (
        <p className="mt-2 text-xs text-muted-foreground">{spec.description}</p>
      )}
    </figure>
  );
}
