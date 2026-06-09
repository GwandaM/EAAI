import { ConfigService } from '@nestjs/config';
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

import { KnowledgeBaseService } from './knowledge-base.service';

function fakeConfig(): ConfigService<unknown, true> {
  const map: Record<string, unknown> = {
    aws: { region: 'us-east-1' },
    bedrock: { modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0', knowledgeBaseId: 'KB-TEST-123' },
  };
  return {
    get: jest.fn((key: string) => map[key]),
  } as unknown as ConfigService<unknown, true>;
}

describe('KnowledgeBaseService', () => {
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    sendSpy = jest
      .spyOn(BedrockAgentRuntimeClient.prototype, 'send')
      .mockImplementation(jest.fn() as never);
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  describe('accuracy', () => {
    it('maps retrievalResults into paragraphs with text, score, source, metadata', async () => {
      sendSpy.mockResolvedValue({
        retrievalResults: [
          {
            content: { text: 'Policy paragraph 1.' },
            score: 0.87,
            location: { type: 'S3', s3Location: { uri: 's3://bucket/doc1.pdf' } },
            metadata: { docId: 'doc1' },
          },
          {
            content: { text: 'Policy paragraph 2.' },
            score: 0.71,
          },
        ],
      } as never);

      const svc = new KnowledgeBaseService(fakeConfig());
      const result = await svc.retrieve({ searchPhrase: 'leave policy', maxResults: 5 });

      expect(result.knowledgeBaseId).toBe('KB-TEST-123');
      expect(result.paragraphs).toHaveLength(2);
      expect(result.paragraphs[0]).toEqual({
        text: 'Policy paragraph 1.',
        score: 0.87,
        source: { type: 'S3', s3Location: { uri: 's3://bucket/doc1.pdf' } },
        metadata: { docId: 'doc1' },
      });
      expect(result.paragraphs[1].text).toBe('Policy paragraph 2.');
      expect(result.paragraphs[1].source).toBeUndefined();
    });

    it('returns an empty paragraph list when retrievalResults is missing', async () => {
      sendSpy.mockResolvedValue({} as never);

      const svc = new KnowledgeBaseService(fakeConfig());
      const result = await svc.retrieve({ searchPhrase: 'unknown topic', maxResults: 5 });

      expect(result.paragraphs).toEqual([]);
    });
  });

  describe('security / contract', () => {
    it('sends a RetrieveCommand with the configured KB id and the requested result count', async () => {
      sendSpy.mockResolvedValue({ retrievalResults: [] } as never);

      const svc = new KnowledgeBaseService(fakeConfig());
      await svc.retrieve({ searchPhrase: 'security review', maxResults: 3 });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const command = sendSpy.mock.calls[0][0];
      expect(command).toBeInstanceOf(RetrieveCommand);
      expect(command.input).toEqual({
        knowledgeBaseId: 'KB-TEST-123',
        retrievalQuery: { type: 'TEXT', text: 'security review' },
        retrievalConfiguration: {
          vectorSearchConfiguration: { numberOfResults: 3 },
        },
      });
    });
  });

  describe('error handling', () => {
    it('propagates client errors so the tool wrapper can convert them to ok:false', async () => {
      sendSpy.mockRejectedValue(new Error('ThrottlingException: rate exceeded') as never);

      const svc = new KnowledgeBaseService(fakeConfig());
      await expect(
        svc.retrieve({ searchPhrase: 'anything', maxResults: 1 }),
      ).rejects.toThrow('ThrottlingException');
    });
  });
});
