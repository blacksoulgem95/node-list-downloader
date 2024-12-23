import fs from 'fs';
import https from 'https';
import path from 'path';
import {from, of} from 'rxjs';
import {catchError, finalize, map, mergeMap} from 'rxjs/operators';
import {config} from "dotenv"
import cliTable from "cli-table3"

config();

const context = {}

function updateContext(destination, downloadedSize, fileSize, prevSize, prevDate, curDate) {
    context[destination] = {
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
        for (const [url, data] of Object.entries(context)) {
            const {total, downloaded, timestamp, previousTimestamp, previousDownloaded} = data

            const progressPercentage = total > 0 ? ((downloaded / total) * 100).toFixed(2) : 'N/A';

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
                url,
                formatBytes(downloaded),
                formatBytes(total),
                progressPercentage === 'N/A' ? 'In attesa' : `${progressPercentage} %`,
                speed
            ]);
        }

        console.clear();
        console.log('Stato del download:');
        console.log(table.toString());
        setTimeout(resolve, 500)
    })
}

// Funzione per scaricare un file HTTP
function downloadFile$(url, destination) {
    return new Promise((resolve, reject) => {
        let fileSize = 0;
        let downloadedSize = 0;

        // Verifica se esiste un file parziale
        const options = {};
        if (fs.existsSync(destination)) {
            const stats = fs.statSync(destination);
            downloadedSize = stats.size;
            options.headers = {Range: `bytes=${downloadedSize}-`};
        }

        const req = https.get(url, options, (response) => {
            const {statusCode, headers} = response;

            // Gestione reindirizzamenti
            if ([301, 302, 303, 307, 308].includes(statusCode)) {
                const redirectUrl = headers.location;
                if (!redirectUrl) {
                    reject(`Reindirizzamento senza Location per ${url}`);
                    return;
                }
                console.log(`Reindirizzamento da ${url} a ${redirectUrl}`);
                resolve(downloadFile$(redirectUrl, destination));
                return;
            }

            if (statusCode === 416) {
                console.log("file già scaricato", destination)
                fileSize = parseInt(headers['content-length'], 10) + downloadedSize;
                updateContext(destination, downloadedSize, fileSize, downloadedSize, new Date().getMilliseconds(), new Date().getMilliseconds())
            }

            if (statusCode === 200 || statusCode === 206) {
                fileSize = parseInt(headers['content-length'], 10) + downloadedSize;
                const file = fs.createWriteStream(destination, {flags: 'a'});

                let curDate = new Date().getMilliseconds()
                response.on('data', (chunk) => {
                    const prevSize = downloadedSize
                    const prevDate = curDate
                    curDate = new Date().getMilliseconds()
                    downloadedSize += chunk.length;
                    updateContext(destination, downloadedSize, fileSize, prevSize, prevDate, curDate)
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close(() => {
                        if (downloadedSize === fileSize) {
                            console.log(`\nDownload completato: ${path.basename(destination)}`);
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
            console.error(`Errore scaricando ${url}: ${err}`);
            return of(null); // Gestisce l'errore e continua
        }),
        finalize(() => console.log(`Completato: ${url}`))
    );
}

// Funzione principale
function main() {
    const inputFile = process.env.INPUT_FILE;
    const downloadDir = process.env.DESTINATION_DIR;

    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir);
    }

    const urls = fs
        .readFileSync(inputFile, 'utf-8')
        .split('\n')
        .map((url) => url.trim())
        .filter((url) => url.length > 0);

    console.log(`Trovati ${urls.length} URL. Inizio il download...\n`);

    from(urls)
        .pipe(
            map((url) => {
                const fileName = path.basename(new URL(url).pathname);
                const destination = path.join(downloadDir, fileName);

                // Verifica file esistente
                if (fs.existsSync(destination)) {
                    const localSize = fs.statSync(destination).size;
                    console.log(`File esistente, si tenta di finirlo nel caso non sia completo: ${fileName}`);
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
                if (result) console.log(result);
            },
            error: (err) => console.error(`Errore nel flusso: ${err}`),
            complete: () => console.log('\nTutti i download completati.')
        });
}

// Avvia lo script
main();
