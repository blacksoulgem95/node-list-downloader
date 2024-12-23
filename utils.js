import https from "https";

export function getProgressBar(completed, total) {
    const percent = ((completed / total) * 100).toFixed(2);
    const barLength = 20; // Lunghezza della barra di progresso
    const completedLength = Math.round((completed / total) * barLength);
    const bar = '█'.repeat(completedLength) + '-'.repeat(barLength - completedLength);
    return `[${bar}] ${percent}%`
}

export function printProgress(completed, total) {
    process.stdout.write(`\r${getProgressBar(completed, total)}`);
}

export function newLine() {
    process.stdout.write(`\n`);
}

// Funzione per scaricare l'HTML di una pagina
export function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            let data = '';

            // Accumula i dati ricevuti
            response.on('data', (chunk) => {
                data += chunk;
            });

            // Risolvi la promessa quando i dati sono completi
            response.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}