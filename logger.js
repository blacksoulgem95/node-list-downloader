import moment from "moment";
import chalk from "chalk";
import fs from "fs";
import path, {dirname} from "path";
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);


const levelMapper = {
    log: {title: "INFO", chalkFn: chalk.reset},
    debug: {title: "DEBUG", chalkFn: chalk.blue},
    error: {title: "ERROR", chalkFn: chalk.redBright},
    warn: {title: "WARNING", chalkFn: chalk.yellow},
}

const stream = fs.createWriteStream(process.env['LOGFILE'] || path.join(dirname(__filename), 'nodelistdownloader.log'), {flags: 'a'});

const print = (level, data) => {
    if (level === "debug" && process.env['DEBUG'] !== "true") {
        return
    }

    const message = [`[${moment().format("YYYY-MM-DD HH:mm:ss.SSSS ZZ")}]`, `[${levelMapper[level]['title']}]`, ...data]

    const consoleOutput = levelMapper[level].chalkFn(...message)

    console[level](consoleOutput)

    stream.write(consoleOutput + chalk.reset('\n'))
}

export const log = (...data) => {
    print("log", data)
}
export const debug = (...data) => {
    print("debug", data)
}
export const error = (...data) => {
    print("error", data)
}
export const warning = (...data) => {
    print("warn", data)
}
