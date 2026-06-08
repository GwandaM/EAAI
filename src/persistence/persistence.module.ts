import {
  Global,
  Inject,
  Logger,
  Module,
  type OnModuleDestroy,
} from '@nestjs/common';

import { HistoryService } from './history.service';
import { PG_POOL, pgPoolProvider, type PgPool } from './pg.provider';

/**
 * Owns the single shared pg.Pool and its lifecycle. Global so any module can
 * inject PG_POOL or HistoryService without re-importing.
 */
@Global()
@Module({
  providers: [pgPoolProvider, HistoryService],
  exports: [PG_POOL, HistoryService],
})
export class PersistenceModule implements OnModuleDestroy {
  private readonly logger = new Logger(PersistenceModule.name);

  constructor(@Inject(PG_POOL) private readonly pool: PgPool) {}

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('PostgreSQL pool closed.');
    }
  }
}
