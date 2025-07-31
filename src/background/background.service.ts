// background.service.ts
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { KamernetScrapingService } from '../scraper/kamernet.service';
import { ClassificationService } from '../classification/classification.service';
import { EmailService } from '../email/email.service';
import { ErrorBufferService } from '../monitoring/error-buffer.service';
import { captureAndLogError } from '../monitoring/monitoring.utils';

@Injectable()
export class BackgroundService implements OnApplicationBootstrap, OnApplicationShutdown {
  private isRunning = true;
  private readonly logger = new Logger(BackgroundService.name);
  private readonly timeStart: number;
  private readonly timeEnd: number;

  constructor(
    private readonly kamernetScrapingService: KamernetScrapingService,
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
          await this.classificationService.classify();
          await this.emailService.sendNotificationEmail();

          this.logger.log('Cycle completed.');
        } catch (err) {
          this.logger.error('Error during scheduled job', err);
          captureAndLogError(this.logger, this.errorBuffer, 'BackgroundService', err);
        }

        // Wait random time between 3min and 10min
        const delayMs = this.getRandomInt(180_000, 600_000);
        this.logger.log(`Waiting ${Math.round(delayMs / 1000)}s before next cycle...`);
        await this.sleep(delayMs);
      } else {
        // Generate a random number between 10 and 50 (inclusive)
        const randomOffsetMinutes = Math.floor(Math.random() * (50 - 10 + 1)) + 10;

        // Target time = timeStart hour + offset in minutes
        const targetTime = new Date();
        targetTime.setHours(this.timeStart);
        targetTime.setMinutes(0);
        targetTime.setSeconds(0);
        targetTime.setMilliseconds(0);
        targetTime.setTime(targetTime.getTime() + randomOffsetMinutes * 60 * 1000);

        // Now
        const now = new Date();

        // Difference in minutes (if target time is in the future)
        const diffMs = targetTime.getTime() - now.getTime();
        const minutesOfInactivity = diffMs > 0 ? Math.floor(diffMs / 60000) : 0;
        this.logger.log(`Outside active hours. Sleeping ${minutesOfInactivity} minutes...`);
        await this.sleep(minutesOfInactivity * 60 * 1000);
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
