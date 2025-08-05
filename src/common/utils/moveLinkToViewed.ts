import * as readline from 'readline';
import { join } from 'path';
import { createReadStream } from 'fs';
import { open, rename } from 'fs/promises';

const viewedPath = join(process.cwd(), 'data/kamernet/kamernet-viewed.ndjson');
const queuePath = join(process.cwd(), 'data/kamernet/kamernet-new-listings.ndjson');

export async function moveLinkToViewed(link: string): Promise<void> {
  const tmpPath = queuePath + '.tmp';

  const queueWrite = await open(tmpPath, 'w');
  const viewedWrite = await open(viewedPath, 'a');

  const rl = readline.createInterface({
    input: createReadStream(queuePath),
    crlfDelay: Infinity,
  });

  let found = false;

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const obj = JSON.parse(line);
      if (obj.link === link) {
        // Move to viewed
        const viewedLine = JSON.stringify({ link }) + '\n';
        await viewedWrite.write(viewedLine, null, 'utf8');
        found = true;
      } else {
        // Keep in queue
        await queueWrite.write(JSON.stringify(obj) + '\n', null, 'utf8');
      }
    } catch {
      // Malformed line → preserve
      await queueWrite.write(line + '\n', null, 'utf8');
    }
  }

  rl.close(); // readline.close() is synchronous
  await queueWrite.close();
  await viewedWrite.close();

  await rename(tmpPath, queuePath);

  if (!found) {
    console.warn(`Link not found in queue: ${link}`);
  } else {
    console.warn(`Moved link to viewed: ${link}`);
  }
}
