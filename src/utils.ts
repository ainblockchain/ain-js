// TODO (lia): add this method to ainUtil ?
export const isValidAddress = function(input: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(input);
}
