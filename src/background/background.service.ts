// background.service.ts
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { KamernetScrapingService } from '../scraper/kamernet/kamernet.service';
import { HuurwoScrapingService } from '../scraper/huurwoningen/huurwoningen.service';
import { ClassificationService } from '../classification/classification.service';
import { EmailService } from '../email/email.service';
import { ErrorBufferService } from '../monitoring/error-buffer.service';
import { captureAndLogError } from '../monitoring/monitoring.utils';
import { randomDelay } from 'src/common/utils/randomDelay';

@Injectable()
export class BackgroundService implements OnApplicationBootstrap, OnApplicationShutdown {
  private isRunning = true;
  private readonly logger = new Logger(BackgroundService.name);
  private readonly timeStart: number;
  private readonly timeEnd: number;

  constructor(
    private readonly kamernetScrapingService: KamernetScrapingService,
    private readonly huurwoScrapingService: HuurwoScrapingService,
    private readonly classificationService: ClassificationService,
    private readonly emailService: EmailService,
    private readonly errorBuffer: ErrorBufferService,
  ) {
    const start = parseInt(process.env.TIME_START || '', 10);
    this.timeStart = isNaN(start) ? 8 : start;

    const end = parseInt(process.env.TIME_END || '', 10);
    this.timeEnd = isNaN(end) ? 1 : end;
  }

  onApplicationBootstrap() {
    this.logger.log('Background loop starting...');
    this.startLoop();
  }

  onApplicationShutdown(signal: string) {
    this.logger.log(`Shutting down background loop due to ${signal}`);
    this.isRunning = false;
  }

  private async startLoop() {
    while (this.isRunning) {
      const now = new Date();
      const hour = now.getHours();

      if (!(hour < this.timeStart && hour >= this.timeEnd)) {
        try {
          this.logger.log('Running scheduled job...');

          await this.kamernetScrapingService.scrape();
          await this.huurwoScrapingService.scrape();
          await this.classificationService.classify();
          await this.emailService.sendNotificationEmail();

          this.logger.log('Cycle completed.');
        } catch (err) {
          this.logger.error('Error during scheduled job', err);
          captureAndLogError(this.logger, this.errorBuffer, 'BackgroundService', err);
        }

        this.logger.log(`Sleeping for a random interval between 4 and 12 minutes...`);
        await randomDelay(4*60, 12*60); 
        
      } else {
        const randomOffsetMinutes = Math.floor(Math.random() * (15 - 3 + 1)) + 3;

        const targetTime = new Date();
        targetTime.setHours(this.timeStart, randomOffsetMinutes, 0, 0); // sets h:m:s:ms at once

        const now = new Date();
        const diffMs = targetTime.getTime() - now.getTime();

        const minutesOfInactivity = Math.floor(diffMs / 60000);
        this.logger.log(`Outside active hours. Sleeping ${minutesOfInactivity} minutes...`);
        await this.sleep(diffMs);
      }
      
    await this.emailService.sendErrorDigest(); //Runs only if there are errors
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRandomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

}
