import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  type KnowledgeBaseRetrievalResult,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

import type { AppConfig } from '../../config/configuration';

export interface KnowledgeBaseParagraph {
  text: string;
  score: number | undefined;
  source: KnowledgeBaseRetrievalResult['location'];
  metadata: KnowledgeBaseRetrievalResult['metadata'];
}

export interface KnowledgeBaseRetrieveInput {
  searchPhrase: string;
  maxResults: number;
}

export interface KnowledgeBaseRetrieveOutput {
  knowledgeBaseId: string;
  paragraphs: KnowledgeBaseParagraph[];
}

@Injectable()
export class KnowledgeBaseService implements OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private readonly client: BedrockAgentRuntimeClient;
  private readonly knowledgeBaseId: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const aws = this.config.get('aws', { infer: true });
    const bedrock = this.config.get('bedrock', { infer: true });

    this.knowledgeBaseId = bedrock.knowledgeBaseId;
    this.client = new BedrockAgentRuntimeClient({
      region: aws.region,
      credentials: fromNodeProviderChain(),
    });
  }

  async retrieve(input: KnowledgeBaseRetrieveInput): Promise<KnowledgeBaseRetrieveOutput> {
    const response = await this.client.send(
      new RetrieveCommand({
        knowledgeBaseId: this.knowledgeBaseId,
        retrievalQuery: { type: 'TEXT', text: input.searchPhrase },
        retrievalConfiguration: {
          vectorSearchConfiguration: { numberOfResults: input.maxResults },
        },
      }),
    );

    return {
      knowledgeBaseId: this.knowledgeBaseId,
      paragraphs: (response.retrievalResults ?? []).map((r) => ({
        text: r.content?.text ?? '',
        score: r.score,
        source: r.location,
        metadata: r.metadata,
      })),
    };
  }

  onModuleDestroy() {
    this.client.destroy();
    this.logger.log('Bedrock agent runtime client destroyed.');
  }
}
