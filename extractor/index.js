import {config} from "dotenv"
config()

import archiveOrg from "./archiveOrg.js";

const url = process.env['EXTRACTOR_URL']

switch (process.env['EXTRACTOR_TYPE']) {
    case 'ARCHIVE_ORG':
        archiveOrg(url)
        break;
}
