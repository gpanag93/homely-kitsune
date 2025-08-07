import { Injectable, Logger } from '@nestjs/common';
import { BrowserContext, Browser, BrowserContextOptions } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin = require('puppeteer-extra-plugin-stealth');
import { existsSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { createReadStream } from 'fs';
import { join, dirname } from 'path';
import * as readline from 'readline';
import {randomDelay} from '../../common/utils/randomDelay';
import { promises as fs } from 'fs';
import { captureAndLogError } from '../../monitoring/monitoring.utils';
import { ErrorBufferService } from '../../monitoring/error-buffer.service';

chromium.use(StealthPlugin());

@Injectable()
export class HuurwoScrapingService {
    private readonly logger = new Logger(HuurwoScrapingService.name);
    private readonly AUTH_PATH = join(process.cwd(), 'auth', 'huurwo-auth.json');

    private readonly baseSearchUrl = process.env.HUURWO_SEARCH_BASE_URL ?? (() => { throw new Error('HUURWO_SEARCH_BASE_URL is missing'); })();

    private readonly viewedPath = join(process.cwd(), 'data/huurwo/huurwo-viewed.ndjson');
    private readonly queuePath = join(process.cwd(), 'data/huurwo/huurwo-new-listings.ndjson');

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
          await randomDelay(3, 5);
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
          return this.browser.newContext({
                  ...this.getStealthContextOptions(),
                  storageState: this.AUTH_PATH,
                });
        } catch (err) {
          this.logger.warn('Invalid auth file. Will log in again.');
          unlinkSync(this.AUTH_PATH);
        }
      }
  
      this.logger.log('No session found — creating one...');

      const context = await this.browser.newContext(this.getStealthContextOptions());
      const page = await context.newPage();
      await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9'
      });
      try {
        //No need to login, just reject cookies
        await page.goto('https://www.huurwoningen.nl/en');
        await page.click('#onetrust-reject-all-handler');

        const selector = '#onetrust-reject-all-handler';

        try {
            const button = await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
            await button.click();
            this.logger.log('Rejected all cookies.');
        } catch (err) {
            this.logger.warn('Reject All button not found or not visible. Continuing without clicking.');
            // Optional fallback action (e.g., accept all, dismiss modal, etc.)
        }
    
        this.logger.log('Saving session.');

        await context.storageState({ path: this.AUTH_PATH });

        return context;

      } catch (err) {
        this.logger.error('Error creating a huurwoningen session', err);
        //Let the error propagate so it can be handled by the caller
        throw err;
      } finally {
        await page.close();
      }
      
    }

    private getStealthContextOptions(): BrowserContextOptions {
      return {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'Europe/Amsterdam',
        viewport: { width: 1366, height: 768 },
      };
    }
  
    async findNewLinks(): Promise<string[]> {
      this.logger.log('Scraping Links Started');
    
      const context = await this.getContext();
      const page = await context.newPage();
      await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9',
        'referer': `${process.env.HUURWO_BASE_URL}/en`,
      });

      const rentalLinks: string[] = [];
      const viewedLinks = await this.loadViewedLinks();//loads previously viewed links both from new-listings and viewed
    
      let pageNo = 1;
      
      const allLinksSeenNow = new Set<string>();
      try {
        while (true) {
            const pagedUrl = `${this.baseSearchUrl}&page=${pageNo}`;
            await page.goto(pagedUrl, { waitUntil: 'domcontentloaded' });
        
            this.logger.log(`Scraping page ${pageNo}\nURL: ${pagedUrl}`);
        
            // Determine if there are rental listings on the page
            const countSelector = '.search-list-header__count';
            await page.waitForSelector(countSelector, { state: 'visible', timeout: 5000 });
            const countText = await page.textContent(countSelector);
            const count = parseInt(countText?.trim() || '0', 10);

            if (count === 0) {
                this.logger.log('No rental listings found on this page.');
                break;
            }
            
            // Grab only links from hours or days ago
            const linksOnPage = await page.$$eval(
              '.listing-search-item',
              (items) => {
                const timeRegex = /\b(?:hour|hours|day|days)\b/i;

                return items
                  .filter((item) => {
                    const counter = item.querySelector(
                      '.listing-reactions-counter__details > span'
                    );
                    return counter && timeRegex.test(counter.textContent || '');
                  })
                  .map((item) => {
                    const link = item.querySelector(
                      'a.listing-search-item__link.listing-search-item__link--title'
                    );
                    return link?.getAttribute('href') || null;
                  })
                  .filter((href): href is string => !!href);
              }
            );


            for (const link of linksOnPage) {
                allLinksSeenNow.add(link);
            }

            // keep only links that are NOT in viewedLinks
            const newLinks = linksOnPage.filter(link => !viewedLinks.has(link));
        
            rentalLinks.push(...newLinks);

            //Check if we've scraped till a week ago
            const outOfReach = await page.$$eval(
                '.listing-search-item',
                (items) => {
                    const timeRegex = /\b(?:hour|hours|day|days)\b/i;

                    return items.some((item) => {
                        const counter = item.querySelector(
                            '.listing-reactions-counter__details > span'
                        );
                        return !counter || !timeRegex.test(counter.textContent || '');
                    });
                }
            );

            if (outOfReach) {
                this.logger.log('Reached listings older than a week — stopping.');
                break;
            }
        
            // Go to next page if available
            const nextButtonSelector = 'a.pagination__link--next';

            const hasNext = await page.$(nextButtonSelector);

            if (!hasNext) {
                this.logger.log('Last page reached — stopping.');
                break;
            }
        
            pageNo++;
            await randomDelay(2, 5);
        }
      } finally {
        await page.close();
      }
    
      this.logger.log(`Scraping finished — found ${rentalLinks.length} new links.`);


      await this.pruneOldViewedLinks(allLinksSeenNow);
      await context.close();

      return rentalLinks;
    }

    private async loadViewedLinks(): Promise<Set<string>> {
    
      const seen = new Set<string>();
      
      if(!existsSync(this.viewedPath) && !existsSync(this.queuePath)) {
        this.logger.log(`No viewed or queue file found.`);
        return seen;
      }

      if (existsSync(this.viewedPath)) {
        const viewedRL = readline.createInterface({
          input: createReadStream(this.viewedPath),
          crlfDelay: Infinity,
        });

        for await (const line of viewedRL) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.link) {
              seen.add(obj.link);
            }
          } catch (err) {
            this.logger.warn(`Viewed file Parser: Failed to parse line: ${line}`);
          }
        }
      }

      if (existsSync(this.queuePath)) {
        const newListingsRL = readline.createInterface({
          input: createReadStream(this.queuePath),
          crlfDelay: Infinity,
        });

        for await (const line of newListingsRL) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.link) {
              seen.add(obj.link);
            }
          } catch (err) {
            this.logger.warn(`Queue file Parser: Failed to parse line: ${line}`);
          }
        }
      }
    
      this.logger.log(`Loaded ${seen.size} previously viewed links.`);
      return seen;
    }

    private async pruneOldViewedLinks(seenLinks: Set<string>): Promise<void> {
        if (!existsSync(this.viewedPath)) {
            this.logger.log(`Viewed links file does not exist yet: ${this.viewedPath}`);
            return;
        }
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
      const context = await this.getContext();
      const page = await context.newPage();
      await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9',
        'referer': process.env.HUURWO_SEARCH_BASE_URL || 'https://www.huurwoningen.nl/en',
      });
      try {
        const fullLink = process.env.HUURWO_BASE_URL+link;
        this.logger.log(`Scraping from Link: ${fullLink}`);

        await page.goto(fullLink, { waitUntil: 'domcontentloaded', timeout: 10000, });

        const title = await page.$eval(
          'h1.listing-detail-summary__title',
          (el) => el.textContent?.trim() || ''
        );

        const descriptionPlaceholder = await page.$eval(
          '.listing-detail-description__truncated',
          (el) => {
            // Clone the element to safely remove the <h2>
            const clone = el.cloneNode(true) as HTMLElement;

            const h2 = clone.querySelector('h2');
            if (h2) h2.remove();

            return clone.textContent?.trim() || '';
          }
        );

        // Huurwoningen cuts the description for free users, so we get rid of the last sentence
        const description = descriptionPlaceholder.replace(/(?:\.\s)?[^.]*\s\.\.\.$/, '');

        //
        const features = await page.evaluate(() => {
        const allFeatures: { label: string; value: string }[] = [];

        const extractFromSection = (sectionSelector: string) => {
          const section = document.querySelector(sectionSelector);
          if (!section) return;

          const terms = section.querySelectorAll('dt.listing-features__term, dd.listing-features__term');
          const descriptions = section.querySelectorAll('dd.listing-features__description');

          for (let i = 0; i < terms.length && i < descriptions.length; i++) {
            const label = terms[i].textContent?.trim() || '';

            const mainValue = descriptions[i]
              .querySelector('.listing-features__main-description')
              ?.textContent?.trim();

            const sub = descriptions[i].querySelector('.listing-features__sub-description');
            const containsViewAll = sub?.textContent?.toLowerCase().includes('view all');

            if (mainValue && !containsViewAll) {
              allFeatures.push({ label, value: mainValue });
            }
          }
        };

        // Add all relevant sections
        extractFromSection('section.page__details--transfer');
        extractFromSection('section.page__details--dimensions');
        extractFromSection('section.page__details--construction');
        extractFromSection('section.page__details--layout');
        extractFromSection('section.page__details--outdoor');
        extractFromSection('section.page__details--contract_conditions');

        return allFeatures;
      });



        await context.close();

        return {
          link,
          title,
          description,
          features,
          timestamp: new Date().toISOString()
        };
      } catch (err) {
        this.logger.error(`Error scraping link ${link}`, err);
        captureAndLogError(this.logger, this.errorBuffer, 'HuurwoScrapingService', err, `Error scraping link: ${link}`);
        return {};
      } finally {
        await page.close();
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
