import type Ain from '../src/ain';
import Reference from '../src/ain-db/ref';
import { GetOperation } from '../src/types';

function createReference(path: string) {
  // Snapshot the request when it is sent, before a later call can mutate it.
  const send = jest.fn(async (_method: string, request: any) =>
    JSON.parse(JSON.stringify(request))
  );
  const ain = { provider: { send } } as unknown as Ain;
  return { reference: new Reference(ain, path), send };
}

describe('Reference.get', () => {
  it('keeps repeated batch reads at the same paths', async () => {
    const { reference, send } = createReference('/apps/example');
    const operations: GetOperation[] = [
      { type: 'GET_VALUE', ref: 'item' },
      { type: 'GET_RULE' },
    ];

    const firstRequest = await reference.get(operations);
    const secondRequest = await reference.get(operations);

    expect(firstRequest).toEqual({
      type: 'GET',
      op_list: [
        { type: 'GET_VALUE', ref: '/apps/example/item' },
        { type: 'GET_RULE', ref: '/apps/example' },
      ],
    });
    expect(secondRequest).toEqual(firstRequest);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([method]) => method)).toEqual(['ain_get', 'ain_get']);
  });

  it('preserves the input operations and their options and order', async () => {
    const { reference } = createReference('/apps/example/');
    const operations: GetOperation[] = [
      { type: 'GET_VALUE', ref: '/items/', is_shallow: false, include_tree_info: true },
      { type: 'GET_RULE', ref: '', is_final: true },
      { type: 'GET_OWNER', is_global: false, include_version: true },
      { type: 'GET_FUNCTION', ref: 'functions', include_proof: true },
    ];
    const originalOperations = JSON.parse(JSON.stringify(operations));

    const request = await reference.get(operations);

    expect(request).toEqual({
      type: 'GET',
      op_list: [
        { type: 'GET_VALUE', ref: '/apps/example/items', is_shallow: false, include_tree_info: true },
        { type: 'GET_RULE', ref: '/apps/example', is_final: true },
        { type: 'GET_OWNER', ref: '/apps/example', is_global: false, include_version: true },
        { type: 'GET_FUNCTION', ref: '/apps/example/functions', include_proof: true },
      ],
    });
    expect(operations).toEqual(originalOperations);
  });

  it('accepts frozen operations', async () => {
    const { reference } = createReference('/apps/example');
    const operations: GetOperation[] = [
      Object.freeze({ type: 'GET_VALUE' as const, ref: 'item', is_final: true }),
    ];
    Object.freeze(operations);

    await expect(reference.get(operations)).resolves.toEqual({
      type: 'GET',
      op_list: [{ type: 'GET_VALUE', ref: '/apps/example/item', is_final: true }],
    });
    expect(operations[0].ref).toBe('item');
  });
});
