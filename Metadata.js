import fs from "fs"
import * as logger from "./logger.js";

export default class Metadata {
    _url
    _filename;
    _fileSize = 0;
    _downloadedSize = 0;
    _prevDownloadedSize = 0;
    _metadataFileName;
    _lastUpdateTs = 0;
    _prevUpdateTs = 0;
    _completed;

    constructor(fullFileName, url) {
        this._url = url
        this._filename = fullFileName
        this._metadataFileName = fullFileName + ".nldmeta"
    }

    getUrl() {
        return this._url
    }

    getFilename() {
        return this._filename
    }

    getFileSize() {
        return this._fileSize
    }

    getDownloadedSize() {
        return this._downloadedSize
    }

    getPrevDownloadedSize() {
        return this._prevDownloadedSize
    }

    getMetadataFileName() {
        return this._metadataFileName
    }

    getLastUpdateTs() {
        return this._lastUpdateTs
    }

    getPrevUpdateTs() {
        return this._prevUpdateTs
    }

    getCompleted() {
        return this._completed
    }

    url(url) {
        this._url = url
        return this;
    }

    fileSize(fileSize) {
        this._fileSize = fileSize
        return this;
    }

    downloadedSize(downloadedSize) {
        this._downloadedSize = downloadedSize
        return this
    }

    prevDownloadedSize(prevDownloadedSize) {
        this._prevDownloadedSize = prevDownloadedSize
        return this
    }

    lastUpdateTs(lastUpdateTs) {
        this._lastUpdateTs = lastUpdateTs
        return this
    }

    prevUpdateTs(prevUpdateTs) {
        this._prevUpdateTs = prevUpdateTs
        return this
    }

    completed(completed) {
        this._completed = !!completed
        return this
    }

    flush() {
        fs.writeFile(this._metadataFileName, JSON.stringify(this), err => {
            if (err) logger.warning("Error saving metadata", err)
        })
        return this
    }

    load() {
        if (fs.existsSync(this._metadataFileName)) {
            try {
                let metaFile = fs.readFileSync(this._metadataFileName, {encoding: 'utf-8'})
                let meta = JSON.parse(metaFile)
                this.fileSize(meta._fileSize || 0)
                    .downloadedSize(meta._downloadedSize || 0)
                    .completed(!!meta._completed)
                    .lastUpdateTs(meta._lastUpdateTs || 0)
                    .prevUpdateTs(meta._prevUpdateTs || 0)
                    .prevDownloadedSize(meta._prevDownloadedSize)
                    .url(meta._url)
                logger.debug("loaded metadata", this, metaFile)
                return this
            } catch (error) {
                logger.warning("Cannot read meta", this._metadataFileName, error)
            }
        }
        this.downloadedSize(0)
        return this
    }

}