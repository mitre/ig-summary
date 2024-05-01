import yaml from 'js-yaml';
import * as fs from 'fs';

export enum DataDictionaryMode {
    MustSupport,
    All
}

export type DataDictionarySettings = {
    title?: string;
    mode: DataDictionaryMode;
    filename?: string;
    codeSystems?: { [key: string]: string };
    informationTabContent?: { [key: string]: string };
    touchUpHumanizedElementNames?: { [key: string]: string };
    suppressFixedCodes?: boolean;
    extensionColumn?: string[];
    excludeElement?: string[];
};

export function loadSettingsFromYaml(settingsPath: string): DataDictionarySettings {
    return yaml.load(fs.readFileSync(settingsPath, 'utf8')) as DataDictionarySettings;
}
