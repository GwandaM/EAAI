import type { PgPool } from './pg.provider';
import { HistoryService } from './history.service';

type PoolStub = { query: jest.Mock };

function withPool(pool: PoolStub): HistoryService {
  return new HistoryService(pool as unknown as PgPool);
}

describe('HistoryService — disabled (no pool)', () => {
  const svc = new HistoryService(null);

  it('reports disabled and degrades gracefully on reads', async () => {
    expect(svc.enabled).toBe(false);
    await expect(svc.listConversations('u1')).resolves.toEqual([]);
    await expect(svc.getConversation('u1', 'c1')).resolves.toBeNull();
    await expect(svc.appendMessage('u1', 'c1', 'user', [{}])).resolves.toBe(
      false,
    );
  });

  it('throws when asked to create a conversation', async () => {
    await expect(svc.createConversation('u1')).rejects.toThrow(
      /not configured/i,
    );
  });
});

describe('HistoryService — appendMessage ownership', () => {
  it('does not insert a message when the conversation is not owned by the user', async () => {
    const pool: PoolStub = {
      query: jest.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }),
    };
    const svc = withPool(pool);

    const ok = await svc.appendMessage('intruder', 'c1', 'user', [
      { type: 'text', text: 'hi' },
    ]);

    expect(ok).toBe(false);
    // Only the ownership UPDATE ran; no INSERT followed.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('inserts the message (parameterized) when the user owns the conversation', async () => {
    const pool: PoolStub = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'c1' }] }) // ownership update
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }), // message insert
    };
    const svc = withPool(pool);
    const parts = [{ type: 'text', text: 'hello' }];

    const ok = await svc.appendMessage('owner', 'c1', 'assistant', parts);

    expect(ok).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(2);
    const [insertSql, insertValues] = pool.query.mock.calls[1];
    expect(insertSql).toMatch(/insert into messages/i);
    expect(insertValues[0]).toBe('c1');
    expect(insertValues[1]).toBe('assistant');
    // parts are JSON-encoded, never inlined into SQL.
    expect(insertValues[2]).toBe(JSON.stringify(parts));
  });
});

describe('HistoryService — title summarization', () => {
  it('needs a title only when the owned conversation has none', async () => {
    const pool: PoolStub = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ title: null }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ title: 'Set' }] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
    };
    const svc = withPool(pool);

    await expect(svc.conversationNeedsTitle('u1', 'c1')).resolves.toBe(true);
    await expect(svc.conversationNeedsTitle('u1', 'c1')).resolves.toBe(false);
    // Not owned / not found.
    await expect(svc.conversationNeedsTitle('intruder', 'c1')).resolves.toBe(
      false,
    );
  });

  it('setTitleIfUnset updates only untitled conversations owned by the user', async () => {
    const pool: PoolStub = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
    };
    const svc = withPool(pool);

    await expect(svc.setTitleIfUnset('u1', 'c1', 'My title')).resolves.toBe(
      true,
    );
    const [sql, values] = pool.query.mock.calls[0];
    expect(sql).toMatch(/title is null/i);
    expect(sql).toMatch(/user_id = \$2/i);
    expect(values).toEqual(['c1', 'u1', 'My title']);
  });

  it('degrades gracefully without a pool', async () => {
    const svc = new HistoryService(null);
    await expect(svc.conversationNeedsTitle('u1', 'c1')).resolves.toBe(false);
    await expect(svc.setTitleIfUnset('u1', 'c1', 't')).resolves.toBe(false);
  });
});

describe('HistoryService — listConversations', () => {
  it('scopes the query to the requesting user', async () => {
    const pool: PoolStub = {
      query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    };
    const svc = withPool(pool);

    await svc.listConversations('user-42');

    const [sql, values] = pool.query.mock.calls[0];
    expect(sql).toMatch(/where user_id = \$1/i);
    expect(values).toEqual(['user-42']);
  });
});
