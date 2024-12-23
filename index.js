import fs from 'fs';
import https from 'https';
import path from 'path';
import {from, of} from 'rxjs';
import {catchError, finalize, map, mergeMap} from 'rxjs/operators';
import {config} from "dotenv"
import cliTable from "cli-table3"
import * as logger from "./logger.js"

config();

const context = {}
let urls = []
let idxMax = 0;

function filename(url) {
    const filename = filename$(url)
    return `${filename} (${new URL(url).host})`
}

function filename$(url) {
    return decodeURI(path.basename(new URL(url).pathname))
}

function updateContext(destination, url, downloadedSize, fileSize, prevSize, prevDate, curDate) {
    context[destination] = {
        url,
        downloaded: downloadedSize,
        total: fileSize,
        timestamp: curDate,
        previousDownloaded: prevSize,
        previousTimestamp: prevDate
    }
    printUpdate()
}

let printing = false

function formatBytes(bytes) {
    if (bytes === 0) return '0 Byte';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

async function printUpdate() {
    if (!printing) {
        printing = true
        await _printUpdate()
        printing = false
    }
}

async function _printUpdate() {

    return new Promise(resolve => {
        const table = new cliTable({
            head: ['URL', 'Scaricato', 'Totale', 'Progresso (%)', 'Velocità'],
            colWidths: [60, 15, 15, 15, 30]
        });
        const table2 = new cliTable({
            head: ['Elaborati', 'Totali'],
            colWidths: [15, 15]
        })

        for (const [destination, data] of Object.entries(context)) {
            const {url, total, downloaded, timestamp, previousTimestamp, previousDownloaded} = data

            const progressPercentage = total > 0 ? ((downloaded / total) * 100).toFixed(2) : 'N/A';
            if (downloaded === total
                || progressPercentage === "100.00"
                || formatBytes(downloaded) === formatBytes(total))
                continue

            let speed = "In Attesa"

            if (total > 0) {
                if (formatBytes(downloaded) === formatBytes(total)) {
                    speed = "Completato"
                } else {
                    if (timestamp === previousTimestamp) speed = formatBytes(0) + '/s'
                    else speed = formatBytes(
                        (downloaded - previousDownloaded) / (timestamp - previousTimestamp) * 1000
                    ) + '/s'
                }
            }

            table.push([
                destination,
                formatBytes(downloaded),
                formatBytes(total),
                progressPercentage === 'N/A' ? 'In attesa' : `${progressPercentage} %`,
                speed
            ]);
        }

        table2.push([idxMax, urls.length])

        // console.clear();
        console.log('Stato del download:');
        console.log(table.toString());
        console.log(table2.toString());
        setTimeout(resolve, 500)
    })
}

function getFileSize$(url) {
    logger.log("Ottengo dimensione per", url)
    return new Promise((resolve, reject) => {
        https.get(url, {method: 'HEAD'}, (response) => {
            const {statusCode, headers} = response;

            if ([301, 302, 303, 307, 308].includes(statusCode)) {
                const redirectUrl = headers.location;
                if (redirectUrl) {
                    resolve(getFileSize$(redirectUrl));
                } else {
                    reject('Reindirizzamento senza Location');
                }
            } else if (statusCode === 200) {
                const size = parseInt(headers['content-length'], 10);
                resolve(size);
            } else {
                reject(`Errore ottenendo la dimensione del file: ${statusCode}`);
            }
        }).on('error', reject);
    });
}


// Funzione per scaricare un file HTTP
function downloadFile$(url, destination) {
    return new Promise(async (resolve, reject) => {
        let fileSize = 0;
        let downloadedSize = 0;

        logger.log('Scaricamento', filename(url))

        // Verifica se esiste un file parziale
        const options = {};
        if (fs.existsSync(destination)) {
            const stats = fs.statSync(destination);
            downloadedSize = stats.size;
            options.headers = {Range: `bytes=${downloadedSize}-`};
            fileSize = await getFileSize$(url, downloadedSize)
            if (downloadedSize === fileSize) {
                logger.log("File già scaricato, skip")
                resolve(destination)
            }
        }


        logger.debug("Controllo dimensione", formatBytes(downloadedSize), downloadedSize, formatBytes(fileSize), fileSize)

        const req = https.get(url, options, (response) => {
            const {statusCode, headers} = response;

            // Gestione reindirizzamenti
            if ([301, 302, 303, 307, 308].includes(statusCode)) {
                const redirectUrl = headers.location;
                if (!redirectUrl) {
                    reject(`Reindirizzamento senza Location per ${url}`);
                    return;
                }
                logger.debug(`Reindirizzamento da ${url} a ${redirectUrl}`);
                resolve(downloadFile$(redirectUrl, destination));
                return;
            }

            if (statusCode === 416) {
                logger.debug("file già scaricato", destination)
                fileSize = parseInt(headers['content-length'], 10) + downloadedSize;
                updateContext(
                    filename(url), url, downloadedSize, fileSize, downloadedSize, new Date().getMilliseconds(), new Date().getMilliseconds())

            } else if (statusCode === 200 || statusCode === 206) {
                fileSize = parseInt(headers['content-length'], 10) + downloadedSize;
                const file = fs.createWriteStream(destination, {flags: 'a'});

                let curDate = new Date().getMilliseconds()
                response.on('data', (chunk) => {
                    const prevSize = downloadedSize
                    const prevDate = curDate
                    curDate = new Date().getMilliseconds()
                    downloadedSize += chunk.length;
                    updateContext(
                        filename(url), url, downloadedSize, fileSize, prevSize, prevDate, curDate)
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close(() => {
                        if (downloadedSize === fileSize) {
                            logger.debug(`\nDownload completato: ${path.basename(destination)}`);
                            resolve(destination);
                        } else {
                            reject(`File incompleto per ${url}.`);
                        }
                    });
                });

                file.on('error', (err) => {
                    file.close();
                    reject(err);
                });
            } else {
                reject(`Errore durante il download di ${url}. Status: ${statusCode}`);
            }
        });

        req.on('error', (err) => {
            reject(err);
        });
    });
}

// Funzione per scaricare un file con retry usando RxJS
function downloadFileWithRetry$(url, destination, maxRetries = 3) {
    return of(null).pipe(
        mergeMap(() => from(downloadFile$(url, destination))),
        catchError((err) => {
            logger.error(`Errore scaricando ${url}: ${err}`);
            return of(null); // Gestisce l'errore e continua
        }),
        finalize(() => {
            idxMax++
            logger.log(`Completato: ${url}`)
        })
    );
}

// Funzione principale
function main() {
    const inputFile = process.env.INPUT_FILE;
    const downloadDir = process.env.DESTINATION_DIR;

    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir);
    }

    urls = fs
        .readFileSync(inputFile, 'utf-8')
        .split('\n')
        .map((url) => decodeURI(url.trim()))
        .filter((url) => url.length > 0);

    logger.log(`Trovati ${urls.length} URL. Inizio il download...\n`);

    from(urls)
        .pipe(
            map((url) => {
                const fileName = filename$(url);

                const destination = path.join(downloadDir, fileName);

                // Verifica file esistente
                if (fs.existsSync(destination)) {
                    const localSize = fs.statSync(destination).size;
                    logger.log(`File esistente, si tenta di finirlo nel caso non sia completo: ${fileName}`);
                    return {url, destination, skip: false};
                }
                return {url, destination, skip: false};
            }),
            mergeMap(
                ({url, destination, skip}) =>
                    skip
                        ? of(`File già scaricato: ${destination}`)
                        : downloadFileWithRetry$(url, destination),
                5 // Limita a 5 richieste parallele
            )
        )
        .subscribe({
            next: (result) => {
                if (result) logger.debug(result);
            },
            error: (err) => logger.error(`Errore nel flusso: ${err}`),
            complete: () => logger.log('\nTutti i download completati.')
        });
}

// Avvia lo script
main();
