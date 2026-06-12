'use client';

import { useEffect, useRef, useState } from 'react';

// The spec type comes straight from the backend presentDiagram tool's zod
// schema (type-only import — nothing from the backend ships to the browser).
import type { DiagramSpec } from '@backend/agent-tools/ui';

export type { DiagramSpec };

let renderSeq = 0;

export function AgentDiagram({ spec }: { spec: DiagramSpec }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        // Mermaid is large and browser-only; load it lazily on first diagram.
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'neutral',
        });
        const { svg } = await mermaid.render(`agent-diagram-${renderSeq++}`, spec.mermaid);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (error) {
        console.error('[diagram] mermaid render failed:', error);
        if (!cancelled) setFailed(true);
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [spec.mermaid]);

  return (
    <figure className="my-3 rounded-md border border-border bg-background p-3">
      <figcaption className="mb-2 text-sm font-medium">{spec.title}</figcaption>
      {failed ? (
        <pre className="overflow-x-auto rounded bg-secondary p-2 text-xs">
          {spec.mermaid}
        </pre>
      ) : (
        <div ref={containerRef} className="overflow-x-auto [&_svg]:mx-auto" />
      )}
      {spec.description && (
        <p className="mt-2 text-xs text-muted-foreground">{spec.description}</p>
      )}
    </figure>
  );
}
