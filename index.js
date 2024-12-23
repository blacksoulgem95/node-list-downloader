import fs from 'fs';
import https from 'https';
import path from 'path';
import {from, of} from 'rxjs';
import {catchError, finalize, map, mergeMap} from 'rxjs/operators';
import {config} from "dotenv"
import cliTable from "cli-table3"
import * as logger from "./logger.js"
import I18n from "./i18n/index.js";
import Metadata from "./Metadata.js"
import {getProgressBar, newLine, printProgress} from "./utils.js";

config();

const context = []
let urls = []
let idxMax = 0;

function censor(censor) {
    let i = 0;

    return function(key, value) {
        if(i !== 0 && typeof(censor) === 'object' && typeof(value) == 'object' && censor === value)
            return '[Circular]';

        if(i >= 29) // seems to be a harded maximum of 30 serialized objects?
            return '[Unknown]';

        ++i; // so we know we aren't using the original object anymore

        return value;
    }
}


const i18n = new I18n(process.env['LANGUAGE'] || 'en')
const t = i18n.translate.bind(i18n)

function filename(url) {
    const filename = filename$(url)
    return `${filename} (${new URL(url).host})`
}

function filename$(url) {
    return decodeURI(path.basename(new URL(url).pathname))
}


let printing = false

function formatBytes(bytes) {
    if (bytes === 0) return '0 Byte';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

async function printUpdate(extraLog) {
    if (!printing) {
        printing = true
        await _printUpdate(extraLog)
        printing = false
    }
}

async function _printUpdate(extraLog) {

    return new Promise(resolve => {
        const table = new cliTable({
            head: [t('report.url'), t('report.downloaded'), t('report.total'), t('report.progress'), t('report.speed')],
            colWidths: [60, 15, 15, 40, 20]
        });
        const table2 = new cliTable({
            head: [t('report.noDownloaded'), t('report.noTotal')],
            colWidths: [15, 15]
        })

        for (const meta of context) {
            const url = filename$(meta.getUrl())
            const total = meta.getFileSize()
            const downloaded = meta.getDownloadedSize()
            const timestamp = meta.getLastUpdateTs()
            const previousTimestamp = meta.getPrevUpdateTs()
            const previousDownloaded = meta.getPrevDownloadedSize()

            if (meta.getCompleted()
                || downloaded === total
                || formatBytes(downloaded) === formatBytes(total)
                || total === 0)
                continue

            let speed = t('report.waiting')

            if (total > 0) {
                if (formatBytes(downloaded) === formatBytes(total)) {
                    speed = t('report.completed')
                } else {
                    if (timestamp === previousTimestamp) speed = formatBytes(0) + '/s'
                    else speed = formatBytes(
                        (downloaded - previousDownloaded) / (timestamp - previousTimestamp) * 1000
                    ) + '/s'
                }
            }

            const progressPercentage = total > 0 ? getProgressBar(downloaded, total) : 'N/A'

            table.push([
                url,
                formatBytes(downloaded),
                formatBytes(total),
                progressPercentage === 'N/A' ? t('report.waiting') : `${progressPercentage} %`,
                speed
            ]);
        }

        table2.push([idxMax, urls.length])

        if (process.env['DEBUG'] !== 'true') console.clear();

        console.log(t('report.title'));
        console.log(table.toString());
        console.log(table2.toString());
        console.log(extraLog || new Date().toLocaleString())
        printProgress(idxMax, urls.length)
        newLine()
        setTimeout(resolve, 500)
    })
}

function getFileSize$(url) {
    logger.log(t('logging.obtainingSize', {file: url}))
    return new Promise((resolve, reject) => {
        https.get(url, {method: 'HEAD'}, (response) => {
            const {statusCode, headers} = response;

            if ([301, 302, 303, 307, 308].includes(statusCode)) {
                const redirectUrl = headers.location;
                if (redirectUrl) {
                    resolve(getFileSize$(redirectUrl));
                } else {
                    reject(t('error.redirectWithoutLocation', {url}));
                }
            } else if (statusCode === 200) {
                const size = parseInt(headers['content-length'], 10);
                resolve(size);
            } else {
                reject(t('error.getFileSizeGeneric', {statusCode}));
            }
        }).on('error', reject);
    });
}


// Funzione per scaricare un file HTTP
function downloadFile$(meta) {
    return new Promise(async (resolve, reject) => {


        if (context.indexOf(meta) < 0) context.push(meta)
        printUpdate(t('logging.downloading', {file: filename(meta.getUrl())}))

        // Verifica se esiste un file parziale
        const options = {};
        if (fs.existsSync(meta.getFilename())) {
            const stats = fs.statSync(meta.getFilename());
            options.headers = {Range: `bytes=${stats.size}-`};
            if (meta.getDownloadedSize() !== stats.size) {
                meta.downloadedSize(stats.size)
                    .fileSize(await getFileSize$(meta.getUrl()))
                    .flush()
            }

            printUpdate()
            if (meta.getDownloadedSize() === meta.getFileSize()) {
                logger.log(t('logging.alreadyDownloaded'))
                idxMax++;
                return resolve(meta.completed(true).flush())
            }
        }

        printUpdate()
        const req = https.get(meta.getUrl(), options, (response) => {
            const {statusCode, headers} = response;
            printUpdate()

            // logger.debug("response", JSON.stringify(response, censor(response), 2))
            // Gestione reindirizzamenti
            if ([301, 302, 303, 307, 308].includes(statusCode)) {
                const redirectUrl = headers.location;
                if (!redirectUrl) {
                    reject(t('error.redirectWithoutLocation', {url: meta.getUrl()}));
                    return;
                }
                logger.debug(t('logging.redirect', {origin: meta.getUrl(), redirect: redirectUrl}));
                meta.url(redirectUrl).flush()
                resolve(downloadFile$(meta));
                return;
            }

            if (statusCode === 416) {
                logger.debug(t('logging.alreadyDownloaded'), meta.getFilename())
                idxMax++
                meta.fileSize(parseInt(headers['content-length'], 10) + meta.getDownloadedSize());
                meta.lastUpdateTs(new Date().getMilliseconds())
                    .prevUpdateTs(new Date().getMilliseconds())
                    .completed(true)
                    .flush()
                printUpdate()
                resolve(meta)

            } else if (statusCode === 200 || statusCode === 206) {
                meta.fileSize(parseInt(headers['content-length'], 10) + meta.getDownloadedSize());
                const file = fs.createWriteStream(meta.getFilename(), {flags: 'a'});

                meta.lastUpdateTs(new Date().getMilliseconds())
                    .prevUpdateTs(new Date().getMilliseconds())
                    .completed(false)
                    .flush()
                printUpdate()

                response.on('data', (chunk) => {
                    meta.prevUpdateTs(meta.getLastUpdateTs())
                        .lastUpdateTs(new Date().getMilliseconds())
                        .prevDownloadedSize(meta.getDownloadedSize())
                        .downloadedSize(meta.getDownloadedSize() + chunk.length)
                        .flush()
                    printUpdate()
                });

                response.on('close', (error) => {
                    if (meta.getDownloadedSize() !== meta.getFileSize()) {
                        let msg = t("error.downloadError", {file: meta.getUrl(), statusCode: error})
                        logger.error(msg)
                        reject(msg)
                    }
                    printUpdate()
                })

                response.on('timeout', (error) => {
                    let msg = t("error.downloadError", {file: meta.getUrl(), statusCode: error})
                    logger.error(msg)
                    reject(msg)
                    printUpdate()
                })

                response.pipe(file);

                file.on('finish', () => {
                    file.close(() => {
                        if (meta.getDownloadedSize() === meta.getFileSize()) {
                            logger.debug(t('logging.downloadCompleted', {file: filename$(meta.getUrl())}));
                            resolve(meta);
                        } else {
                            reject(t('error.uncompletedFile', {file: meta.getUrl()}));
                        }
                        printUpdate()
                    });
                });

                file.on('error', (err) => {
                    file.close();
                    reject(err);
                    printUpdate()
                });
            } else {
                reject(t('error.downloadError', {file: meta.getUrl(), statusCode}));
            }
        });

        req.on('error', (err) => {
            reject(err);
        });
    });
}

// Funzione per scaricare un file con retry usando RxJS
function downloadFileWithRetry$(meta, maxRetries = 3) {
    return of(null).pipe(
        mergeMap(() => from(downloadFile$(meta))),
        catchError((err) => {
            logger.error(t('error.downloadError', {file: meta.getUrl(), statusCode: err}));
            return of(null); // Gestisce l'errore e continua
        }),
        finalize(() => {
            idxMax++
            logger.log(t('logging.downloadCompleted', {file: meta.getUrl()}))
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

    logger.log(t('logging.urlsFound', {noUrls: urls.length}));

    from(urls)
        .pipe(
            map((url) => {
                const fileName = filename$(url);

                const destination = path.join(downloadDir, fileName);

                const meta = new Metadata(destination, url).load()

                // Verifica file esistente
                if (fs.existsSync(destination)) {
                    const localSize = fs.statSync(destination).size;
                    meta.downloadedSize(localSize).flush()
                    if (!meta.getCompleted()) logger.log(t('logging.existingFile', {file: fileName}));
                    else logger.log(t('logging.downloadCompleted', {file: fileName}))
                }
                return meta
            }),
            mergeMap(
                (meta) => {
                    return meta.getCompleted()
                        ? of(`File già scaricato: ${meta.getFilename()}`)
                        : downloadFileWithRetry$(meta)
                },
                5 // Limita a 5 richieste parallele
            ),
            map(meta => {
                printUpdate()
                return meta
            })
        )
        .subscribe({
            next: (result) => {
                if (result) logger.debug(result);
            },
            error: (err) => logger.error(t('error.fluxError', {err}), err),
            complete: () => logger.log("\n", t('logging.allCompleted'))
        });
}

// Avvia lo script
main();
