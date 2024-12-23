import * as cheerio from 'cheerio';
import * as logger from "../logger.js"
import {fetchHTML, newLine, printProgress} from "../utils.js";
import fs from "fs/promises";

// Funzione per analizzare il contenuto HTML
async function analyzeHTML(url) {
    try {
        logger.log("Fetching information for", url)
        const html = await fetchHTML(url);
        if (!url.endsWith('/')) url += '/'
        logger.log("HTML Loaded", url)

        // Carica l'HTML in Cheerio
        const $ = cheerio.load(html);

        const linkList = []
        const $el = $('table.directory-listing-table tbody tr')

        const totalLink = $el.length

        $el.each((index, tr) => {
            $(tr).find('td').each((j, td) => {
                const a = $(td).find('a')[0]
                if (a) {
                    const href = $(a).attr('href');
                    const text = $(a).text().trim();
                    logger.debug("Found link", text, href)
                    printProgress(index + 1, totalLink)
                    if (href.startsWith("/details")) {
                        newLine()
                        logger.log('Skipping back to parent link')
                    } else {
                        linkList.push(url + href)
                    }
                }
            })
        })

        newLine()
        logger.log('Links:', linkList.length);
        logger.log('Saving file', process.env['EXTRACTOR_OUTPUT'])
        return fs.writeFile(process.env['EXTRACTOR_OUTPUT'], linkList.join('\n'), {
            flag: process.env.EXTRACTOR_WRITE_FLAG || 'a'
        })
    } catch (error) {
        console.error('Errore durante il fetch o l\'analisi:', error.message);
    }
}

export default analyzeHTML
