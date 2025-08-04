import { Injectable, Logger } from '@nestjs/common';
import { BrowserContext, Browser } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin = require('puppeteer-extra-plugin-stealth');
import { existsSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { createReadStream } from 'fs';
import { join, dirname } from 'path';
import * as readline from 'readline';
import {randomDelay} from '../common/utils/randomDelay';
import { promises as fs } from 'fs';
import { captureAndLogError } from '../monitoring/monitoring.utils';
import { ErrorBufferService } from '../monitoring/error-buffer.service';

chromium.use(StealthPlugin());

@Injectable()
export class KamernetScrapingService {
    private readonly logger = new Logger(KamernetScrapingService.name);
    private readonly AUTH_PATH = join(process.cwd(), 'auth', 'kamernet-auth.json');
    
    private readonly emailLogin = process.env.KAMERNET_EMAIL ?? (() => { throw new Error('KAMERNET_EMAIL is missing'); })();
    private readonly passwordLogin = process.env.KAMERNET_PASSWORD ?? (() => { throw new Error('KAMERNET_PASSWORD is missing'); })();
    
    private readonly baseSearchUrl = process.env.KAMERNET_SEARCH_BASE_URL ?? (() => { throw new Error('KAMERNET_SEARCH_BASE_URL is missing'); })();

    private readonly viewedPath = join(process.cwd(), 'data', 'kamernet-viewed.ndjson');
    private readonly queuePath = join(process.cwd(), 'data', 'kamernet-new-listings.ndjson');

    private browser: Browser | null = null;

    constructor(
      private readonly errorBuffer: ErrorBufferService
    ) {}

    async onModuleInit() {
      this.browser = await chromium.launch({ headless: true });
    }

    async onModuleDestroy() {
      if (this.browser) {
        await this.browser.close();
      }
    }

    async scrape(): Promise<void> {
      const newLinks = await this.findNewLinks();

      if (newLinks.length > 0){
        for (const link of newLinks) {
          const newRecord = await this.scrapeFromLink(link);
          if (Object.keys(newRecord).length !== 0){
            await this.appendToNewListings(newRecord);
          }
        }
      }
    }
  
    async getContext(): Promise<BrowserContext> {

      if (!this.browser || !this.browser.isConnected()) {
        this.logger.log('Browser not connected or closed. Launching a new browser instance...');
        await this.browser?.close();
        this.browser = await chromium.launch({ headless: true });
      }
  
      if (existsSync(this.AUTH_PATH)) {
        try {
          const content = readFileSync(this.AUTH_PATH, 'utf8');
          JSON.parse(content); // throws if invalid
          this.logger.log('Loading saved session...');
          return this.browser.newContext({ storageState: this.AUTH_PATH });
        } catch (err) {
          this.logger.warn('Invalid auth file. Will log in again.');
          unlinkSync(this.AUTH_PATH);
        }
      }
  
      this.logger.log('No session found — logging in...');

      try {
        const context = await this.browser.newContext();
        const page = await context.newPage();
    
        await page.goto('https://kamernet.nl/en');
        await page.getByRole('button', { name: 'Log in' }).click();
        await randomDelay();
        await page.getByRole('textbox', { name: 'Email' }).click();
        await page.getByRole('textbox', { name: 'Email' }).fill(this.emailLogin);
        await randomDelay();
        await page.getByRole('textbox', { name: 'Password' }).click();
        await page.getByRole('textbox', { name: 'Password' }).fill(this.passwordLogin);
        await randomDelay();
        await page.getByRole('button', { name: 'Log In' }).click();
    
        const acceptButton = page.getByRole('button', { name: 'Accept all' });

        if (await acceptButton.isVisible().catch(() => false)) {
          await acceptButton.click();
        }
    
        this.logger.log('Login successful — saving session.');

        await context.storageState({ path: this.AUTH_PATH });

        return context;

      } catch (err) {
        this.logger.error('Error getting Kamernet credentials', err);
        //Let the error propagate so it can be handled by the caller
        throw err;
      }
      
    }
  
    async findNewLinks(): Promise<string[]> {
      this.logger.log('Scraping Links Started');
    
      const context = await this.getContext();
      const page = await context.newPage();
    
      const rentalLinks: string[] = [];
      const viewedLinks = await this.loadViewedLinks();
    
      let pageNo = 1;
      
      const allLinksSeenNow = new Set<string>();
    
      while (true) {
        const pagedUrl = `${this.baseSearchUrl}&pageNo=${pageNo}`;
        await page.goto(pagedUrl, { waitUntil: 'domcontentloaded' });
    
        this.logger.log(`Scraping page ${pageNo}`);
    
        const noResults = await page.$(`text="We couldn't find any results"`);
        if (noResults) {
          this.logger.log('No results found — stopping.');
          break;
        }
    
        const linksOnPage = await page.$$eval(
          'a[href^="/en/for-rent/"]',
          elements =>
            elements
              .map(el => el.getAttribute('href') || '')
              .filter(href => !href.startsWith('/en/for-rent/properties'))
        );

        for (const link of linksOnPage) {
          allLinksSeenNow.add(link);
        }

        // keep only links that are NOT in viewedLinks
        const newLinks = linksOnPage.filter(link => !viewedLinks.has(link));
    
        rentalLinks.push(...newLinks);
    
        const nextButton = await page.$('button[aria-label="Go to next page"]');
        if (!nextButton) {
          this.logger.log('Only one page detected — stopping.');
          break;
        }
    
        const disabled = await nextButton.isDisabled();

        if (disabled) {
          this.logger.log('Last page reached — stopping.');
          break;
        }
    
        pageNo++;
        randomDelay();
      }
    
      this.logger.log(`Scraping finished — found ${rentalLinks.length} new links.`);


      await this.pruneOldViewedLinks(allLinksSeenNow);
      await context.close();

      return rentalLinks;
    }

    private async loadViewedLinks(): Promise<Set<string>> {
    
      const seen = new Set<string>();
    
      if (!existsSync(this.viewedPath)) {
        this.logger.log(`Viewed links file does not exist yet: ${this.viewedPath}`);
        return seen;
      }
    
      const rl = readline.createInterface({
        input: createReadStream(this.viewedPath),
        crlfDelay: Infinity,
      });
    
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.link) {
            seen.add(obj.link);
          }
        } catch (err) {
          this.logger.warn(`Failed to parse line: ${line}`);
        }
      }
    
      this.logger.log(`Loaded ${seen.size} previously viewed links.`);
      return seen;
    }

    private async pruneOldViewedLinks(seenLinks: Set<string>): Promise<void> {
      try {
        const fileContent = await fs.readFile(this.viewedPath, 'utf-8');
        const lines = fileContent.trim().split('\n');

        const keptLines = lines.filter(line => {
          try {
            const entry = JSON.parse(line);
            return seenLinks.has(entry.link);
          } catch {
            return false;
          }
        });

        await fs.writeFile(this.viewedPath, keptLines.join('\n') + '\n', 'utf-8');
      } catch (err) {
        console.error('Error pruning viewed links:', err);
      }
    }

    private async scrapeFromLink(link: string): Promise<Record<string, any>>{
      try {
        const fullLink = process.env.KAMERNET_BASE_URL+link;
        this.logger.log(`Scraping from Link: ${fullLink}`);

        const context = await this.getContext();
        const page = await context.newPage();

        await page.goto(fullLink, { waitUntil: 'domcontentloaded', timeout: 10000, });

        //Cost breakdown
        const costRows = await page.locator('#cost-breakups div:has(> p):has(> h6)');
        const costCount = await costRows.count();

        const costBreakdown: Record<string, number> = {};

        for (let i = 0; i < costCount; i++) {
          const row = costRows.nth(i);

          const label = await row.locator('p').innerText();
          const valueText = await row.locator('h6').innerText();

          const numericValue = parseFloat(
            valueText.replace(/[^\d,.]/g, '')  // remove € etc.
                    .replace(/,/g, '')        // remove thousands separators
          );

          if (!isNaN(numericValue)) {
            costBreakdown[label] = numericValue;
          }
        }

        //Floor area and property Type
        const areaTypeEl = page.locator(
          'div:has(> div > svg[data-testid="StraightenIcon"])'
        );
        
        const floorArea = await areaTypeEl.locator('h6').innerText();
        const propertyType = await areaTypeEl.locator('p').innerText();
        
        //Availability from-until
        const availabilityEl = page.locator(
          'div:has(> div > svg[data-testid="CalendarTodayIcon"])'
        );
        
        const availableFrom = await availabilityEl.locator('h6').innerText();
        const availableUntil = await availabilityEl.locator('p').innerText();

        //Description
        const description = await page.locator(
          'section:has(> h5:text("About the place")) pre p'
        ).innerText();

        //Details
        const detailsLocator = page.locator(
          `section:has(> h5:text("What you'll get")) div:has(> p)`
        );
        
        const detailsCount = await detailsLocator.count();
        
        const details: string[] = [];
        
        for (let i = 0; i < detailsCount; i++) {
          const text = await detailsLocator.nth(i).locator('p').innerText();
          details.push(text);
        }

        //Street
        const street = await page
          .locator('a[href="#map"]')
          .innerText();

        //Ideal tenant
        const iTenantRows = page.locator(
          `section:has(> h5:text("Landlord's ideal tenant")) div:has(> p)`
        );
        
        const count = await iTenantRows.count();
        
        const idealTenant: { label: string; value: string }[] = [];
        
        for (let i = 0; i < count; i++) {
          const row = iTenantRows.nth(i);
          const ps = row.locator('p');
          const pCount = await ps.count();
        
          if (pCount >= 2) {
            const label = await ps.nth(0).innerText();
            const value = await ps.nth(1).innerText();
            idealTenant.push({ label, value });
          }
        }

        await context.close();

        return {
          link,
          costBreakdown,
          floorArea,
          propertyType,
          availableFrom,
          availableUntil,
          description,
          details,
          street,
          idealTenant,
          timestamp: new Date().toISOString()
        };
      } catch (err) {
        this.logger.error(`Error scraping link ${link}`, err);
        captureAndLogError(this.logger, this.errorBuffer, 'KamernetScrapingService', err, `Error scraping link: ${link}`);
        return {};
      }
    }

    private async appendToNewListings(record: Record<string, any>): Promise<void> {
      // Check that `link` field exists
      if (!record.link) {
        throw new Error(`Record is missing required 'link' field: ${JSON.stringify(record)}`);
      }
    
      const dataDir = join(process.cwd(), 'data');
    
      // Make sure the folder exists
      await fs.mkdir(dataDir, { recursive: true });
    
      // If file doesn't exist → nothing to check → just write it
      try {
        await fs.access(this.queuePath);
      } catch {
        const jsonLine = JSON.stringify(record) + '\n';
        await fs.appendFile(this.queuePath, jsonLine, 'utf8');
        return;
      }
    
      // Check if link already exists
      if (await this.linkExistsInQueue(record.link)) {
        this.logger.log(`Link already exists in queue: ${record.link}`);
        return;
      }

      // Append since it’s unique
      const jsonLine = JSON.stringify(record) + '\n';
      await fs.appendFile(this.queuePath, jsonLine, 'utf8');
    }

    private async linkExistsInQueue(link: string): Promise<boolean> {
      try {
        const fileStream = createReadStream(this.queuePath);
    
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity,
        });
    
        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.link === link) {
              return true;
            }
          } catch {
            // skip malformed lines
          }
        }
    
        return false;
      } catch {
        // file probably does not exist yet → no links
        return false;
      }
    }
  }
