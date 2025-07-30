import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { join } from 'path';
import * as fs from 'fs';
import { OpenAI } from 'openai';
import { moveLinkToViewed } from '../../common/utils/moveLinkToViewed';
import { ErrorBufferService } from '../../monitoring/error-buffer.service';
import { captureAndLogError } from '../../monitoring/monitoring.utils';

@Injectable()
export class KamernetClassifier implements OnModuleInit {

    private readonly logger = new Logger(KamernetClassifier.name);
    
    private initialized = false;

    private newListingsPath: string;
    private newRecords: Set<Record<string, any>>;
    private kamernetPromptPath: string;
    private kamernetPrompt: string;
    private notificationQueuePath: string;
    private readonly openai: OpenAI;

    onModuleInit() {
        this.newListingsPath = join(process.cwd(), 'data/kamernet-new-listings.ndjson');
        this.kamernetPromptPath = join(process.cwd(), 'data/classification-prompt.txt');
        this.notificationQueuePath = join(process.cwd(), 'data/notification-queue.html');

        this.initialized = this.loadInitialData();
        if (!this.initialized) {
            Logger.warn('KamernetClassifier failed to initialise - it will stay dormant.');
        }
    }

    private loadInitialData(): boolean {
        if (!fs.existsSync(this.notificationQueuePath)) {
            Logger.warn(`File not found, creating: ${this.notificationQueuePath}`);
            fs.writeFileSync(this.notificationQueuePath, '', { encoding: 'utf-8' });
        }

        if (!fs.existsSync(this.kamernetPromptPath)) {
            Logger.warn(`Kamernet prompt file not found: ${this.kamernetPromptPath}`);
            return false;
        }

        const promptContent = fs.readFileSync(this.kamernetPromptPath, 'utf-8').trim();
        if (!promptContent) {
            Logger.warn(`Kamernet prompt file is empty: ${this.kamernetPromptPath}`);
            return false;
        }
        this.kamernetPrompt = promptContent;

        return true;
    }

    constructor(
        private readonly errorBuffer: ErrorBufferService
    ){
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
          });
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
                captureAndLogError(this.logger, this.errorBuffer, 'Kamernet.Classifier', err);
            }
        }

        return result;
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
                    await moveLinkToViewed(record.link);
                }
            } catch (err) {
                this.logger.error(`Error classifying record: ${JSON.stringify(record)}`, err);
                captureAndLogError(this.logger, this.errorBuffer, 'Kamernet.Classifier', err);
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

    private async classifyRecord(record: Record<string, any>): Promise<string | null> {

        const listingTxt = await this.preparePrompt(record);
        const response = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: this.kamernetPrompt },
              { role: 'user', content: listingTxt },
            ],
          });

        const message = response.choices[0].message.content;
        console.log('Classification result:', message);

        return message;
    }

    private async preparePrompt(record: Record<string, any>): Promise<string> {

        const cost = Object.entries(record.costBreakdown)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ");

        const idealTenant = record.idealTenant
            .map((t) => `${t.label}: ${t.value}`)
            .join("\n");

        return [
            `Listing Details:`,
            `Cost Breakdown: ${cost}`,
            `Floor Area: ${record.floorArea}`,
            `Property Type: ${record.propertyType}`,
            `Available From: ${record.availableFrom}`,
            `Available Until: ${record.availableUntil}`,
            `Street: ${record.street}`,
            `Details: ${record.details.join(", ")}`,
            `\nDescription:\n${record.description.trim()}`,
            `\nIdeal Tenant:\n${idealTenant}`,
        ].join("\n");
    }

    private addToNotificationQueue(record: Record<string, any>, assessment: string | null = null): boolean {
        let matching: string | null = null;
        let input: string | null = null;
        if (assessment){
            const match = assessment.match(/\s*Matching:\s*(\d{1,3})%\s*$/);

            if (match) {
                matching = match[1].trim()+`%`;         // Get the percentage
                input = assessment.replace(match[0], '').trim(); // remove from original string
            }
        }

        const url = `${process.env.KAMERNET_BASE_URL}${record.link}`;
        const title = record.street || 'Unknown location';
        const propertyType = record.propertyType || 'N/A';
        const area = record.floorArea || 'Unknown';
        const availableFrom = record.availableFrom || 'N/A';
        const availableUntil = record.availableUntil || 'N/A';

        const cost = Object.entries(record.costBreakdown)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ")
             || 'No cost information provided';

        const entry = `
            <div style="border: 1px solid #ccc; padding: 16px; margin-bottom: 16px; border-radius: 6px;">
            <h3 style="margin-top: 0; margin-bottom: 8px;">
                <a href="${url}" style="text-decoration: none; color: #1a73e8;">${title}</a>
            </h3>
            <p style="margin: 4px 0;"><strong>Matching:</strong> ${matching}</p>
            <p style="margin: 4px 0;"><strong>Type:</strong> ${propertyType}</p>
            <p style="margin: 4px 0;"><strong>Area:</strong> ${area}</p>
            <p style="margin: 4px 0;"><strong>Available:</strong> ${availableFrom} → ${availableUntil}</p>
            <p style="margin: 8px 0;"><strong>Cost:</strong> ${cost}</p>
            ${
                input
                ? `<p style="margin: 8px 0; background-color: #f3f3f3; padding: 8px; border-left: 4px solid #1a73e8;"><em>${input}</em></p>`
                : ''
            }
            </div>
        `.trim();

        fs.appendFileSync(this.notificationQueuePath, '\n' + entry, { encoding: 'utf-8' });

        return true;
    }
}
