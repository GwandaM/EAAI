import { buildVisualizationTools } from './visualization.tool';

describe('visualization tools', () => {
  const tools = buildVisualizationTools();

  describe('presentChart', () => {
    it('echoes a valid bar chart spec back as ok:true', async () => {
      const input = {
        chartType: 'bar' as const,
        title: 'Clients per product',
        xAxisLabel: 'Product',
        yAxisLabel: 'Clients',
        series: [
          {
            name: 'Clients',
            points: [
              { x: 'Pension Plan', y: 42 },
              { x: 'Investment Bond', y: 17 },
            ],
          },
        ],
      };

      const out = await tools.presentChart.execute!(input);

      expect(out).toEqual({ ok: true, data: { kind: 'chart', ...input } });
    });

    it('rejects pie charts with more than one series', async () => {
      const out = await tools.presentChart.execute!({
        chartType: 'pie',
        title: 'Product mix',
        series: [
          { name: 'A', points: [{ x: 'Pension', y: 1 }] },
          { name: 'B', points: [{ x: 'Bond', y: 2 }] },
        ],
      });

      expect(out).toMatchObject({ ok: false });
      expect((out as { error: string }).error).toContain('exactly one series');
    });

    it('rejects scatter charts with categorical x values', async () => {
      const out = await tools.presentChart.execute!({
        chartType: 'scatter',
        title: 'Size vs return',
        series: [{ name: 'Policies', points: [{ x: 'POL-1', y: 4.2 }] }],
      });

      expect(out).toMatchObject({ ok: false });
      expect((out as { error: string }).error).toContain('numeric x values');
    });
  });

  describe('presentDiagram', () => {
    it('echoes a valid mermaid spec back as ok:true with trimmed source', async () => {
      const out = await tools.presentDiagram.execute!({
        title: 'Policy relationships',
        mermaid: '  flowchart TD\n  A[Party] --> B[Policy]\n',
      });

      expect(out).toEqual({
        ok: true,
        data: {
          kind: 'diagram',
          title: 'Policy relationships',
          mermaid: 'flowchart TD\n  A[Party] --> B[Policy]',
        },
      });
    });

    it('rejects sources wrapped in markdown fences', async () => {
      const out = await tools.presentDiagram.execute!({
        title: 'Fenced',
        mermaid: '```mermaid\nflowchart TD\nA --> B\n```',
      });

      expect(out).toMatchObject({ ok: false });
      expect((out as { error: string }).error).toContain('without markdown code fences');
    });

    it('rejects sources that do not start with a known diagram type', async () => {
      const out = await tools.presentDiagram.execute!({
        title: 'Not mermaid',
        mermaid: 'SELECT * FROM diagrams;',
      });

      expect(out).toMatchObject({ ok: false });
      expect((out as { error: string }).error).toContain('must start with a diagram type');
    });
  });
});
