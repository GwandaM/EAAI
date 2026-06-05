import { Module } from '@nestjs/common';

import { KnowledgeBaseService } from './knowledge-base/knowledge-base.service';
import { CompanyApiService } from './company-api/company-api.service';
import { DatabaseService } from './database/database.service';

@Module({
  providers: [KnowledgeBaseService, CompanyApiService, DatabaseService],
  exports: [KnowledgeBaseService, CompanyApiService, DatabaseService],
})
export class ToolsModule {}
