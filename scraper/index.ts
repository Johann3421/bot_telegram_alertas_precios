import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerScraper, runAllScrapers, startScheduler } from './core/scheduler';
import { scrapeHiraoka } from './providers/hiraoka';
import { scrapeCoolbox } from './providers/coolbox';
import { scrapeImpacto } from './providers/impacto';
import { scrapeOechsle } from './providers/oechsle';
import { scrapeDeltron } from './providers/deltron';
import { scrapeIngramMicro } from './providers/ingram-micro';
import { scrapeIntcomex } from './providers/intcomex';
import { scrapeMaximaInternacional } from './providers/maxima-internacional';
import { scrapeCompudiskett } from './providers/compudiskett';
import { closeBrowser } from './core/browser';

// Registrar todos los scrapers
registerScraper('Hiraoka', scrapeHiraoka);
registerScraper('Coolbox', scrapeCoolbox);
registerScraper('Impacto', scrapeImpacto);
registerScraper('Oechsle', scrapeOechsle);
registerScraper('Deltron', scrapeDeltron);
registerScraper('Ingram Micro', scrapeIngramMicro);
registerScraper('Intcomex', scrapeIntcomex);
registerScraper('Maxima Internacional', scrapeMaximaInternacional);
registerScraper('Compudiskett', scrapeCompudiskett);

export { runAllScrapers, startScheduler, closeBrowser };

const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (entryFile === currentFile) {
	runAllScrapers()
		.catch((error) => {
			console.error('[Scraper CLI] Error:', error);
			process.exitCode = 1;
		})
		.finally(async () => {
			await closeBrowser();
		});
}
