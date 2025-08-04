export async function randomDelay(minSeconds = 0.5, maxSeconds = 2) {
  const min = minSeconds * 1000;
  const max = maxSeconds * 1000;
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}