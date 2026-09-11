import { nativeEscrowRelease, microUnitEscrowRelease } from '../src/state-channel/cooperative-escrow';

test('the actual 20 by 3 micro-AIN payout is rejected without rounding away the chain failure', () => {
  expect(1 - 0.50006).toBe(0.49994000000000005);
  expect(() => nativeEscrowRelease({ balanceA: 499940, balanceB: 500060 })).toThrow(/native _release/);
});

test.each([[500000, 500000, 0.5], [0, 1000000, 1], [1000000, 0, 0]])(
  'exact native allocation %i/%i returns only the unchanged ratio', (balanceA, balanceB, ratio) => {
    expect(nativeEscrowRelease({ balanceA, balanceB })).toEqual({ ratio });
  });

test.each([[-1, 1000001], [0, 0], [1.5, 1], [NaN, 1], [Infinity, 1], [2 ** 32, 1]])(
  'malformed native allocation %s/%s fails closed', (balanceA, balanceB) => {
    expect(() => nativeEscrowRelease({ balanceA, balanceB })).toThrow(/invalid native escrow allocation/);
    expect(() => microUnitEscrowRelease({ balanceA, balanceB })).toThrow(/invalid native escrow allocation/);
  });
