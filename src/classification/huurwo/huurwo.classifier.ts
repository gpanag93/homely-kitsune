import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { join } from 'path';
import * as readline from 'readline';
import * as fs from 'fs';
import { open, rename } from 'fs/promises';
import { OpenAI } from 'openai';
import { ErrorBufferService } from '../../monitoring/error-buffer.service';
import { captureAndLogError } from '../../monitoring/monitoring.utils';

@Injectable()
export class HuurwoClassifier implements OnModuleInit {

    private readonly logger = new Logger(HuurwoClassifier.name);

    private initialized = false;

    private newListingsPath: string;
    private newRecords: Set<Record<string, any>>;
    private promptPath: string;
    private prompt: string;
    private notificationQueuePath: string;
    private viewedPath: string;

    private readonly openai: OpenAI;

    onModuleInit() {
        this.newListingsPath = join(process.cwd(), 'data/huurwo/huurwo-new-listings.ndjson');
        this.promptPath = join(process.cwd(), 'classification-prompt.txt');
        this.notificationQueuePath = join(process.cwd(), 'data/notification-queue.html');
        this.viewedPath = join(process.cwd(), 'data/huurwo/huurwo-viewed.ndjson');

        this.initialized = this.loadInitialData();
        if (!this.initialized) {
            Logger.warn('HuurwoClassifier failed to initialise - it will stay dormant.');
        }
    }

    private loadInitialData(): boolean {
        if (!fs.existsSync(this.notificationQueuePath)) {
            Logger.warn(`File not found, creating: ${this.notificationQueuePath}`);
            fs.writeFileSync(this.notificationQueuePath, '', { encoding: 'utf-8' });
        }

        if (!fs.existsSync(this.promptPath)) {
            Logger.warn(`Huurwoningen prompt file not found: ${this.promptPath}`);
            return false;
        }

        const promptContent = fs.readFileSync(this.promptPath, 'utf-8').trim();
        if (!promptContent) {
            Logger.warn(`Huurwoningen prompt file is empty: ${this.promptPath}`);
            return false;
        }
        this.prompt = promptContent;

        return true;
    }

    constructor(
        private readonly errorBuffer: ErrorBufferService
    ){
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
          });
    }

    //Classify records and add them to the notification queue
    //This is the main function that is called from the ClassificationService
    async classify() {

        if (!await this.readyToClassify()) {
            return;
        }

        for (const record of this.newRecords) {
            try {
                const openAIassessment = await this.classifyRecord(record)
                if (openAIassessment) {
                    this.addToNotificationQueue(record, openAIassessment);
                    await this.moveLinkToViewed(record.link);
                }
            } catch (err) {
                this.logger.error(`Error classifying record: ${JSON.stringify(record)}`, err);
                captureAndLogError(this.logger, this.errorBuffer, 'Huurwo.Classifier', err);
            }
        }
        
    }

    private async readyToClassify(): Promise<boolean> {
        if (!fs.existsSync(this.newListingsPath)) {
            Logger.warn(`New listings file not found: ${this.newListingsPath}`);
            return false;
        }
        const listingsContent = fs.readFileSync(this.newListingsPath, 'utf-8').trim();
        if (!listingsContent) {
            Logger.warn(`New listings file is empty: ${this.newListingsPath}`);
            return false;
        }
        
        this.newRecords = this.loadRecords();
        
        if (this.newRecords.size === 0) {
            Logger.warn(`No new listings found in: ${this.newListingsPath}`);
            return false;
        }

        return true;
    }

    private loadRecords(): Set<Record<string, any>> {
        const result = new Set<Record<string, any>>();

        if (!fs.existsSync(this.newListingsPath)) {
            console.warn(`File not found: ${this.newListingsPath}`);
            return result;
        }

        const fileContent = fs.readFileSync(this.newListingsPath, 'utf-8');
        const lines = fileContent.split('\n').filter(line => line.trim().length > 0);

        for (const line of lines) {
            try {
                const json = JSON.parse(line);
                result.add(json);
            } catch (err) {
                this.logger.error(`Failed to parse line: ${line}`, err);
                captureAndLogError(this.logger, this.errorBuffer, 'Huurwo.Classifier', err);
            }
        }

        return result;
    }

    private async classifyRecord(record: Record<string, any>): Promise<string | null> {

        const listingTxt = await this.preparePrompt(record);
        const response = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: this.prompt },
              { role: 'user', content: listingTxt },
            ],
          });

        const message = response.choices[0].message.content;
        console.log('Classification result:', message);

        return message;
    }

    private async moveLinkToViewed(link: string): Promise<void> {
      const tmpPath = this.newListingsPath + '.tmp';
    
      const queueWrite = await open(tmpPath, 'w');
      const viewedWrite = await open(this.viewedPath, 'a');
    
      const rl = readline.createInterface({
        input: fs.createReadStream(this.newListingsPath),
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
    
      rl.close();
      await queueWrite.close();
      await viewedWrite.close();
    
      await rename(tmpPath, this.newListingsPath);
    
      if (!found) {
        console.warn(`Link not found in queue: ${link}`);
      } else {
        console.warn(`Moved link to viewed: ${link}`);
      }
    }

    private async preparePrompt(record: Record<string, any>): Promise<string> {

        let features = '';
        record.features.forEach(feat => {
            features += `${feat.label}: ${feat.value}\n`;
        });

        return [
            `Listing Details:`,
            `\nDescription:\n${record.description.trim()}`,
            `\nFeatures:\n${features}`,
        ].join("\n");
    }

    private addToNotificationQueue(record: Record<string, any>, openAIreply: string | null = null): boolean {
        let tempPath = this.notificationQueuePath + '.tmp';
        let matching: string | null = null;
        let assessment: string | null = null;
        if (openAIreply){
            const match = openAIreply.match(/\s*Matching:\s*(\d{1,3})%\s*$/);

            if (match) {
                matching = match[1].trim();         // Get the percentage
                assessment = openAIreply.replace(match[0], '').trim(); // remove from original string
            }
        }

        const url = `${process.env.HUURWO_BASE_URL}${record.link}`;
        const title = record.title || 'Unknown location';
        const propertyType = record.features.find(f => f.label === "Type of house")?.value || 'N/A';
        const area = record.features.find(f => f.label === "Living area")?.value || 'N/A';
        const availableFrom = record.features.find(f => f.label === "Available")?.value || 'N/A';
        const availableUntil = 'N/A';
        const cost = record.features.find(f => f.label === "Rental price")?.value || 'N/A';

        // Do not use nested divs. Each entry should be a single div.
        const entry = `
            <div style="border: 1px solid #ccc; padding: 16px; margin-bottom: 16px; border-radius: 6px;">
            <h3 style="margin-top: 0; margin-bottom: 8px;">
                <a href="${url}" style="text-decoration: none; color: #1a73e8;">${title}</a>
            </h3>
            ${matching ? `<p style="margin: 4px 0;"><strong>Matching:</strong> ${matching}%</p>` : ''}
            <p style="margin: 4px 0;"><strong>Type:</strong> ${propertyType}</p>
            <p style="margin: 4px 0;"><strong>Area:</strong> ${area}</p>
            <p style="margin: 4px 0;"><strong>Available:</strong> ${availableFrom} → ${availableUntil}</p>
            <p style="margin: 8px 0;"><strong>Cost:</strong> ${cost}</p>
            ${
                assessment
                ? 
                `
                <p style="margin: 8px 0;"><strong>Assessment:</strong></p>
                <p style="margin: 8px 0; background-color: #f3f3f3; padding: 8px; border-left: 4px solid #1a73e8;"><em>${assessment}</em></p>
                `
                : ''
            }
            </div>
        `.trim();

        let final = entry;

        // Read existing content
        let existing = '';
        if (fs.existsSync(this.notificationQueuePath)) {
            existing = fs.readFileSync(this.notificationQueuePath, { encoding: 'utf-8' });
        }

        // If the file isn't empty sort the entries by matching score
        if (existing.trim()) {
            // Split entries by div
            const parts = existing
                .split('</div>')
                .map(part => part.trim())
                .filter(part => part.length > 0)
                .map(part => part + '</div>');

            // Helper: extract matching score from HTML block
            const getMatchingScore = (html: string): number => {
                const match = html.match(/<strong>Matching:<\/strong>\s*(\d{1,3})%/);
                return match ? parseInt(match[1]) : 0;
            };

            // Insert new entry
            parts.push(entry);
            parts.sort((a, b) => getMatchingScore(b) - getMatchingScore(a));

            // Write back full HTML
            final = parts.join('\n\n') + '\n';
        }

        try {
            fs.writeFileSync(tempPath, final, 'utf-8');
            fs.renameSync(tempPath, this.notificationQueuePath);
        } catch (err) {
            this.logger.error(`Failed to write notification queue: ${this.notificationQueuePath}`, err);
            captureAndLogError(this.logger, this.errorBuffer, 'Huurwo.Classifier', err);
            return false;
        }

        return true;
    }
}
