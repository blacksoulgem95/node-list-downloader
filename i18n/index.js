import path, {dirname} from "path";
import { fileURLToPath } from 'url';
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default class i18n {
    constructor(language) {
        this.defaultLanguage = 'en';
        this.language = language;
        this.languageFile = path.join(__dirname, `translations`, `${this.language}.json`);
        this.defaultLanguageFile = path.join(__dirname, `translations`, `${this.defaultLanguage}.json`);

        if (fs.existsSync(this.languageFile)) {
            this.translations = JSON.parse(fs.readFileSync(this.languageFile, { encoding: 'utf-8' }));
        } else {
            this.translations = JSON.parse(fs.readFileSync(this.defaultLanguageFile, { encoding: 'utf-8' }));
        }
    }

    translate(key, variables = {}) {
        let translation = this.translations[key] || key;

        // Replace variables in the translation string
        for (const [varKey, value] of Object.entries(variables)) {
            const placeholder = `{{${varKey}}}`;
            translation = translation.replace(new RegExp(placeholder, 'g'), value);
        }

        return translation;
    }
}
