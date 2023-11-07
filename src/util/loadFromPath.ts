import fs from 'fs';
import path from 'path';
import { fhirdefs } from 'fsh-sushi';

export function loadFromPath(inputPath: string, defs: fhirdefs.FHIRDefinitions): void {
    const files = fs.readdirSync(inputPath);
    for (const file of files) {
        if (file.endsWith('.json')) {
            const def = JSON.parse(fs.readFileSync(path.join(inputPath, file), 'utf-8').trim());
            defs.add(def);
        }
    }
}
