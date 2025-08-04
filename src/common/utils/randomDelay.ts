export async function randomDelay(minSeconds = 0.5, maxSeconds = 2) {
  const min = minSeconds * 1000;
  const max = maxSeconds * 1000;
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`Delaying for ${formatDelay(delay)}...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

function formatDelay(ms: number): string {
  if (ms < 60_000) {
    const seconds = Math.round(ms / 1000);
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  } else if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else {
    const hours = Math.round(ms / 3_600_000);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
}