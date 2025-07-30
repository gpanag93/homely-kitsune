import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { ClassificationModule } from './classification/classification.module';
import { APP_FILTER } from '@nestjs/core';
import { ErrorBufferModule } from './monitoring/error-buffer.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { BackgroundModule } from './background/background.module';
import { EmailModule } from './email/email.module';
import { ScraperModule } from './scraper/scraper.module';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    ClassificationModule,
    EmailModule,
    BackgroundModule,
    ErrorBufferModule,
    ScraperModule,
  ],
  controllers: [AppController],
  providers: [
    AppService, 
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
