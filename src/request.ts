// This is a mock module for sending requests and having delays.
export default function request(url: string) {
  return new Promise(resolve => {
    process.nextTick(() => {
      if (url.includes("Count") || url.includes("Amount")) resolve(31);
      resolve('test_string');
    });
  });
}
