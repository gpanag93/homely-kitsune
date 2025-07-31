import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';


function ensureFoldersExist() {
  const folders = [
    join(process.cwd(), 'data'),
    join(process.cwd(), 'auth'),
  ];

  folders.forEach((folder) => {
    if (!existsSync(folder)) {
      mkdirSync(folder, { recursive: true });
      console.log(`Folder: ${folder} was missing and has been created.`);
    }
  });
}

async function bootstrap() {
  ensureFoldersExist();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  await app.listen(3000);
}
bootstrap();
