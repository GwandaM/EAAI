import { Module } from '@nestjs/common';

import { HistoryController } from './history.controller';

/**
 * HistoryService and PG_POOL are provided by the global PersistenceModule, so
 * this module only needs to register the controller.
 */
@Module({
  controllers: [HistoryController],
})
export class HistoryModule {}
