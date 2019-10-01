export default function request(url: string) {
  return new Promise((resolve, reject) => {
    process.nextTick(() => resolve('test_string'));
  });
}
