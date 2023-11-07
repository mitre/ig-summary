import { DataElementInformationForSpreadsheet } from '../elements/ProfileElement';
import { ValueSetRow } from './ValueSet';

export type DataDictionaryJsonSummaryRow = {
    group?: string;
    title: string;
    url: string;
    description: string;
};

export type DataDictionaryJson = {
    profiles: DataDictionaryJsonSummaryRow[];
    profileElements: DataElementInformationForSpreadsheet[];
    valueSets: DataDictionaryJsonSummaryRow[];
    valueSetElements: ValueSetRow[];
    extensions: DataDictionaryJsonSummaryRow[];
    codeSystems: DataDictionaryJsonSummaryRow[];
    metadata: {
        title: string;
        version: string;
    };
};
