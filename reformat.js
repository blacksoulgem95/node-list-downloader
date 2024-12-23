import fs from "fs"
import * as logger from "./logger.js"
import {from, mergeAll} from "rxjs";
import {map} from "rxjs/operators";
import {fromPromise} from "rxjs/internal/observable/innerFrom";
import path from "path";
import {config} from "dotenv";
config()

const basePath = path.join(process.env['DESTINATION_DIR'])

logger.warning("Renaming URL Encoded file names to non-URL Encoded in", basePath)

const files = fs.readdirSync(basePath)

from(files)
    .pipe(map(file => {
        const newFileName = decodeURI(file)
        logger.log("Converting", file, "to", newFileName)
        return fromPromise(new Promise((r, rj) => {
            fs.rename(path.join(basePath, file), path.join(basePath, newFileName), (err) => {
                if (err) {
                    return rj({file, newFileName, err})
                } else r({file, newFileName})
            })
        }))
    }), mergeAll()).subscribe({
    next: value => {
        const {file, newFileName} = value
        logger.log("converted", file, "to", newFileName)
    },
    error: error => {
        const {file, newFileName, err} = error
        logger.error("Error converting", file, "to", newFileName, err)
    }
});