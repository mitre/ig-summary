import { logger } from './util/logger';

import { Differ } from './data-dictionary-diff/Differ';
import fs from 'fs';

export function diff(pathToA: string, pathToB: string, outputPath: string, settingsPath: string) {
    const msg = ' (this should be the .json output of the `ig-summary create` command)';
    logger.info('File A: ' + pathToA + msg);
    logger.info('File B: ' + pathToB + msg);
    logger.info(`Writing to folder ${outputPath}`);

    const filePaths = [pathToA, pathToB];
    const folderPaths = [outputPath];

    if (settingsPath) {
        logger.info(`Settings read from ${settingsPath}`);
        filePaths.push(settingsPath);
    }

    // Check to make sure file exist
    let filesExist = true;
    for (const f of filePaths.concat(folderPaths)) {
        if (!fs.existsSync(f)) {
            filesExist = false;
            logger.error(`${f} does not exist`);
            continue;
        }
        if (filePaths.includes(f) && !fs.lstatSync(f).isFile()) {
            logger.error(`${f} is not a file`);
            filesExist = false;
        }
        if (folderPaths.includes(f) && !fs.lstatSync(f).isDirectory()) {
            logger.error(`${f} is not a folder`);
            filesExist = false;
        }
    }
    if (!filesExist) throw 'Path error.';

    const left = Differ.loadDataDictionaryJson(pathToA);
    const right = Differ.loadDataDictionaryJson(pathToB);
    const settings = settingsPath ? Differ.loadSettings(settingsPath) : {};

    const differ = new Differ(left, right, settings);
    // differ.logDetails();
    differ.toExcel(outputPath);
    differ.logSummary();
}
