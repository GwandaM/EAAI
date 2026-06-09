import { Module } from '@nestjs/common';

import { KnowledgeBaseService } from './knowledge-base/knowledge-base.service';
<<<<<<< HEAD
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
=======
import { CompanyApiService } from './company-api/company-api.service';
import { DatabaseService } from './database/database.service';

@Module({
  providers: [KnowledgeBaseService, CompanyApiService, DatabaseService],
  exports: [KnowledgeBaseService, CompanyApiService, DatabaseService],
>>>>>>> 651a0558592feb65a9df8327110da0226de684ef
})
export class ToolsModule {}
