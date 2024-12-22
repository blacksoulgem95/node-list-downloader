const fs = require('fs');
const https = require('https');
const path = require('path');
const {defer, from} = require("rxjs")
const { mergeAll } = require("rxjs/operators");
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
    return new Promise((resolve, reject) => {
        if (maxRedirects < 0) {
            reject(`Troppi reindirizzamenti per ${url}`);
            return;
        }

        if (retryCount <= 0) {
            reject(`Troppi tentativi falliti per ${url}`);
            return;
        }

        let fileSize = 0;
        let existingSize = 0;

        if (fs.existsSync(destination)) {
            existingSize = fs.statSync(destination).size;
        }

        const options = {
            headers: existingSize > 0 ? { Range: `bytes=${existingSize}-` } : {},
        };

        const timeoutDuration = 15000; // Timeout di 15 secondi
        let timeout;

        const handleTimeout = () => {
            console.error(`\nTimeout durante il download di ${url}. Ritento...`);
            fs.unlinkSync(destination); // Rimuove file incompleto
            resolve(downloadFile(url, destination, maxRedirects, retryCount - 1));
        };

        const req = https.get(url, options, (response) => {
            clearTimeout(timeout);
            const { statusCode, headers } = response;

            if ([301, 302, 303, 307, 308].includes(statusCode)) {
                const redirectUrl = headers.location;
                if (!redirectUrl) {
                    reject(`Reindirizzamento senza Location per ${url}`);
                    return;
                }
                console.log(`\nReindirizzamento da ${url} a ${redirectUrl}`);
                resolve(downloadFile(redirectUrl, destination, maxRedirects - 1, retryCount));
                return;
            }

            if (statusCode === 200 || statusCode === 206) {
                fileSize = parseInt(headers['content-length'], 10) + existingSize;
                const file = fs.createWriteStream(destination, { flags: 'a' });

                let downloadedSize = existingSize;

                timeout = setTimeout(handleTimeout, timeoutDuration);

                response.on('data', (chunk) => {
                    clearTimeout(timeout);
                    downloadedSize += chunk.length;
                    printProgress(downloadedSize, fileSize);
                    timeout = setTimeout(handleTimeout, timeoutDuration);
                });

                response.pipe(file);

                file.on('finish', () => {
                    clearTimeout(timeout);
                    file.close(() => {
                        if (downloadedSize === fileSize) {
                            console.log('\nDownload completato.');
                            resolve(destination);
                        } else {
                            reject(`File incompleto per ${url}. Dimensione attesa: ${fileSize}, scaricata: ${downloadedSize}`);
                        }
                    });
                });
            } else {
                reject(`Errore durante il download di ${url}. Status: ${statusCode}`);
            }
        });

        req.on('error', (err) => {
            clearTimeout(timeout);
            fs.unlinkSync(destination); // Rimuove file incompleto
            console.error(`Errore durante il download di ${url}: ${err.message}. Ritento...`);
            resolve(downloadFile(url, destination, maxRedirects, retryCount - 1));
        });

        timeout = setTimeout(handleTimeout, timeoutDuration);
    });
}

async function elaboraFile(url, idx, urls) {
    try {
        const fileName = path.basename(new URL(url).pathname);
        const destination = path.join(process.env['DESTINATION_DIR'], fileName);

        // Verifica dimensione del file locale
        if (fs.existsSync(destination)) {
            const localSize = fs.statSync(destination).size;

            console.log(`Verifica file esistente: ${fileName}`);
            const { size: remoteSize } = await getFileSize(url);
            if (localSize === remoteSize) {
                console.log(`File già scaricato: ${destination}`, `${idx} su ${urls.length} download`);
                printProgress(i, urls.length)
                process.stdout.write("\n")
                return;
            }
        }

        console.log(`Scaricando: ${url}`, `${idx} su ${urls.length} download`);
        printProgress(i, urls.length)
        process.stdout.write("\n")
        return await downloadFile(url, destination);
    } catch (error) {
        console.error(`\nErrore scaricando ${url}: ${error}`);
    }

}

// Funzione principale
async function main() {
    const inputFile = process.env.INPUT_FILE;

    try {
        const urls = fs.readFileSync(inputFile, 'utf-8')
            .split('\n')
            .map(url => url.trim())
            .filter(url => url.length > 0);

        console.log(`Trovati ${urls.length} URL. Inizio il download...\n`);

        let promises = []

        const obs = urls.map((url, idx) => defer( () => elaboraFile(url, idx, urls)))

        from(obs)
            .pipe(mergeAll(5))
            .pipe(mergeAll())
            .subscribe({})

        await Promise.all(promises)

        console.log('Tutti i download completati.');
    } catch (error) {
        console.error(`Errore leggendo il file ${inputFile}: ${error.message}`);
    }
}

// Funzione per ottenere la dimensione di un file remoto
function getFileSize(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { method: 'HEAD' }, (response) => {
            const { statusCode, headers } = response;

            if ([301, 302, 303, 307, 308].includes(statusCode)) {
                const redirectUrl = headers.location;
                if (redirectUrl) {
                    resolve(getFileSize(redirectUrl));
                } else {
                    reject('Reindirizzamento senza Location');
                }
            } else if (statusCode === 200) {
                const size = parseInt(headers['content-length'], 10);
                resolve({ size });
            } else {
                reject(`Errore ottenendo la dimensione del file: ${statusCode}`);
            }
        }).on('error', reject);
    });
}

// Avvia lo script
main();