import { Module } from '@nestjs/common';

import { KnowledgeBaseService } from './knowledge-base/knowledge-base.service';
import { BusinessApiService } from './business-api/business-api.service';
import { PolicyService } from './policy/policy.service';
import { PartyService } from './party/party.service';

@Module({
  providers: [
    KnowledgeBaseService,
    BusinessApiService,
    PolicyService,
    PartyService,
  ],
  exports: [KnowledgeBaseService, PolicyService, PartyService],
})
export class ToolsModule {}
