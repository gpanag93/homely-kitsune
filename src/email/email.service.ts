import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import { join } from 'path';
import { ErrorBufferService } from '../monitoring/error-buffer.service';
import { captureAndLogError } from '../monitoring/monitoring.utils';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private readonly notificationQueuePath = join(process.cwd(), 'data/notification-queue.html');

  constructor(private readonly errorBuffer: ErrorBufferService) {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: false, // true for port 465, false for 587
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async sendMail(subject: string, text: string, html?: string) {
    const info = await this.transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.SUBSCRIBER_EMAIL,
      subject,
      text,
      html,
    });
    this.logger.log(`Email sent: ${info.messageId}`);
    return info;
  }

  async sendErrorMail(text: string, html?: string){
    const info = await this.transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.SUBSCRIBER_EMAIL,
      subject: '❌  I got a problem',
      text,
      html,
    });
    this.logger.log(`Email sent: ${info.messageId}`);
    return info;
  }

  async prepareFromNotificationQueue() {
    
    if (!fs.existsSync(this.notificationQueuePath)) {
        Logger.warn(`Notification queue file not found: ${this.notificationQueuePath}`);
        return null;
    }

    const notificationQueueContent = fs.readFileSync(this.notificationQueuePath, 'utf-8').trim();
    if (!notificationQueueContent) {
        Logger.warn(`Notification queue file is empty: ${this.notificationQueuePath}`);
        return null;
    }

    const completeStyledEmail =  
    `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>New Listings Found!</title>
        </head>
        <body style="margin:0; padding:0; background-color:#ffffff;">
          <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">`
          +notificationQueueContent+
      `   </div>
        </body>
      </html>`

    return completeStyledEmail;
  }

  async sendNotificationEmail() {
    const emailContent = await this.prepareFromNotificationQueue();
    if (!emailContent) {
      this.logger.warn('No new listings to send.');
      return;
    }

    try {
      const info = await this.sendMail('🏠 New Listings Found!', '', emailContent);
      this.logger.log(`Notification email sent: ${info.messageId}`);
      fs.unlinkSync(this.notificationQueuePath);
    } catch (err) {
      this.logger.error('Failed to send notification email', err);
      captureAndLogError(this.logger, this.errorBuffer, 'EmailService', err);
    }
  }

  async sendErrorDigest() {
    if (process.env.ERROR_DIGEST_ENABLED !== 'true') return;
    if (!this.errorBuffer.hasErrors()) return;

    const errorEntries = this.errorBuffer.flush();

    //TODO: Implement a proper email template
    const emailContent = errorEntries.map(entry => `
      <div>
        <p><strong>Time:</strong> ${entry.timestamp}</p>
        <p><strong>Path:</strong> ${entry.path}</p>
        <p><strong>Method:</strong> ${entry.method}</p>
        <p><strong>Message:</strong> ${entry.message}</p>
        ${entry.stack ? `<pre>${entry.stack}</pre>` : ''}
      </div>
    `).join('<hr>');

    if (!emailContent) {
      this.logger.warn('No new listings to send.');
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: process.env.SUBSCRIBER_EMAIL,
        subject: '🔧 Error Report',
        text: 'New errors have been logged. Please check the attached HTML for details.',
        html: emailContent,
      });
      this.logger.log(`Email sent: ${info.messageId}`);
      return info;
    } catch (err) {
      this.logger.error('Failed to send error report email', err);
      captureAndLogError(this.logger, this.errorBuffer, 'EmailService', err);
    }
  } 

}