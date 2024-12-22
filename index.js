const fs = require('fs');
const https = require('https');
const path = require('path');
const {defer, from, throwError, of, last, forkJoin, fromEvent, catchError} = require("rxjs")
const {mergeAll, map} = require("rxjs/operators");
const {fromFetch} = require("rxjs/src/internal/observable/dom/fetch");
require("dotenv").config()

// Funzione per stampare la progressione del download
function printProgress(completed, total) {
    const percent = ((completed / total) * 100).toFixed(2);
    const barLength = 20; // Lunghezza della barra di progresso
    const completedLength = Math.round((completed / total) * barLength);
    const bar = '█'.repeat(completedLength) + '-'.repeat(barLength - completedLength);
    process.stdout.write(`\r[${bar}] ${percent}%`);
}

// Funzione per scaricare un file con supporto per il ripristino e rilevamento timeout
function downloadFile(url, destination, maxRedirects = 5, retryCount = 3) {

    if (maxRedirects < 0) {
        throwError(() => new Error(`Troppi reindirizzamenti per ${url}`));
        return;
    }

    if (retryCount <= 0) {
        throwError(() => new Error(`Troppi tentativi falliti per ${url}`));
        return;
    }

    let fileSize = 0;
    let existingSize = 0;

    if (fs.existsSync(destination)) {
        existingSize = fs.statSync(destination).size;
    }

    const options = {
        headers: existingSize > 0 ? {Range: `bytes=${existingSize}-`} : {},
    };

    const timeoutDuration = 15000; // Timeout di 15 secondi
    let timeout;

    const handleTimeout = () => {
        console.error(`\nTimeout durante il download di ${url}. Ritento...`);
        fs.unlinkSync(destination); // Rimuove file incompleto
        throwError(() => new Error(`Timeout durante il download di ${url}`))
    };

    return forkJoin([
        fromFetch(url, options),
        of(setTimeout(handleTimeout, timeoutDuration))
    ]).pipe(map(data => {
        const [response, t] = data
        const {status: statusCode, headers} = response;

        if ([301, 302, 303, 307, 308].includes(statusCode)) {
            const redirectUrl = headers.location;

            if (!redirectUrl) {
                return throwError(() => new Error(`Reindirizzamento senza Location per ${url}`));
            }

            console.log(`\nReindirizzamento da ${url} a ${redirectUrl}`);
            return downloadFile(redirectUrl, destination, maxRedirects - 1, retryCount);
        }

        if (statusCode === 200 || statusCode === 206) {
            fileSize = parseInt(headers['content-length'], 10) + existingSize;
            const file = fs.createWriteStream(destination, {flags: 'a'});

            let downloadedSize = existingSize;

            timeout = setTimeout(handleTimeout, timeoutDuration);

            response.on('data', (chunk) => {
                clearTimeout(timeout);
                downloadedSize += chunk.length;
                printProgress(downloadedSize, fileSize);
                timeout = setTimeout(handleTimeout, timeoutDuration);
            });

            response.pipe(file);

            return fromEvent(file, 'finish')
                .pipe(map(data => {
                    clearTimeout(timeout);
                    file.close(() => {
                        if (downloadedSize === fileSize) {
                            console.log('\nDownload completato.');
                            return destination;
                        } else {
                            throwError(() => new Error(`File incompleto per ${url}. Dimensione attesa: ${fileSize}, scaricata: ${downloadedSize}`));
                        }
                    });
                    return destination;

                }))
        } else {
            throwError(() => new Error(`Errore durante il download di ${url}. Status: ${statusCode}`));
        }
    }), catchError(error => {
        clearTimeout(timeout);
        fs.unlinkSync(destination); // Rimuove file incompleto
        console.error(`Errore durante il download di ${url}: ${err.message}. Ritento...`, error);
        return downloadFile(url, destination, maxRedirects, retryCount - 1);
    }))
}

function elaboraFile(url, idx, urls) {
    const fileName = path.basename(new URL(url).pathname);
    const destination = path.join(process.env['DESTINATION_DIR'], fileName);

    return forkJoin([
        of(url),
        fs.existsSync(destination) ? getFileSize(url) : of(0)
    ]).pipe(map(data => {
        const [url, remoteSize] = data
        if (remoteSize > 0) {
            const localSize = fs.statSync(destination).size;
            if (localSize === remoteSize) {
                console.log(`File già scaricato: ${destination}`, `${idx} su ${urls.length} download`);
                printProgress(idx, urls.length)
                process.stdout.write("\n")
                return throwError(() => new Error([`File già scaricato: ${destination}`, `${idx} su ${urls.length} download`].join('\n')))
            }

            console.log(`Scaricando: ${url}`, `${idx} su ${urls.length} download`);
            printProgress(idx, urls.length)
            process.stdout.write("\n")
            return downloadFile(url, destination)
        }
    }))

}

// Funzione principale
async function main() {
    const inputFile = process.env.INPUT_FILE;

    const urls = fs.readFileSync(inputFile, 'utf-8')
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

    console.log(`Trovati ${urls.length} URL. Inizio il download...\n`);


    const obs = urls.map((url, idx) => defer(() => elaboraFile(url, idx, urls)))

    await new Promise((resolve) => {
        from(obs)
            .pipe(mergeAll(5))
            .pipe(last())
            .subscribe({
                next: data => {
                    console.log('tutti i download completati')
                },
                error: error => {
                    console.error("errore durante il download", error)
                },
                complete: () => resolve()
            })
    })
}

// Funzione per ottenere la dimensione di un file remoto
function getFileSize(url) {
    return fromFetch(url, {
        method: "HEAD"
    }).pipe(map(response => {
        const {statusCode: status, headers} = response;

        if ([301, 302, 303, 307, 308].includes(status)) {
            const redirectUrl = headers.location;
            if (redirectUrl) {
                return getFileSize(redirectUrl);
            } else {
                throwError(() => new Error("Reindirizzamento senza Location"))
            }
        } else if (status === 200) {
            const size = parseInt(headers['content-length'], 10);
            return of(size);
        } else {
            throwError(() => new Error(`Errore ottenendo la dimensione del file: ${status}`))
        }
    }), last())

}

// Avvia lo script
main();