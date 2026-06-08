import { buildKnowledgeBaseTool } from './knowledge-base.tool';
import type { KnowledgeBaseService } from './knowledge-base.service';

const noopOptions = { toolCallId: 'tc-1', messages: [] } as never;

function makeServiceStub(
  retrieveImpl: KnowledgeBaseService['retrieve'],
): KnowledgeBaseService {
  return { retrieve: retrieveImpl } as unknown as KnowledgeBaseService;
}

describe('buildKnowledgeBaseTool', () => {
  it('describes itself and exposes an inputSchema (LLM contract)', () => {
    const t = buildKnowledgeBaseTool(makeServiceStub(jest.fn()));
    expect(t.description).toMatch(/knowledge base/i);
    expect(t.inputSchema).toBeDefined();
  });

  it('returns ok:true with service output on success', async () => {
    const svc = makeServiceStub(
      jest.fn().mockResolvedValue({
        knowledgeBaseId: 'KB-TEST-123',
        paragraphs: [{ text: 'hi', score: 0.9, source: undefined, metadata: undefined }],
      }),
    );

    const t = buildKnowledgeBaseTool(svc);
    const out = await t.execute!({ searchPhrase: 'hello', maxResults: 5 }, noopOptions);

    expect(out).toEqual({
      ok: true,
      data: expect.objectContaining({ knowledgeBaseId: 'KB-TEST-123' }),
    });
  });

  it('returns ok:false (never throws) when the service fails — the agent loop stays alive', async () => {
    const svc = makeServiceStub(
      jest.fn().mockRejectedValue(new Error('Bedrock unavailable')),
    );

    const t = buildKnowledgeBaseTool(svc);
    const out = await t.execute!({ searchPhrase: 'x', maxResults: 5 }, noopOptions);

    expect(out).toEqual({ ok: false, error: 'Bedrock unavailable' });
  });
});
