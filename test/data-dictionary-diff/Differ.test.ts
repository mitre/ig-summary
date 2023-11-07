import { DataElementInformationForSpreadsheet } from '../../src/elements/ProfileElement';
import { Differ, DiffSettings } from '../../src/data-dictionary-diff/Differ';
import {
    DataDictionaryJson,
    DataDictionaryJsonSummaryRow
} from '../../src/data-dictionary/DataDictionaryJson';

interface ColumnNames {
    group?: string;
    profileTitle?: string;
    dataElementName?: string;
    definition?: string;
    required?: string;
    occurrencesAllowed?: string;
    dataType?: string;
    valueSetUri?: string;
    valueSetBinding?: string;
    fhirElement?: string;
    profileUri?: string;
    structureDefinitionUri?: string;
}

function getRow(args: ColumnNames): DataElementInformationForSpreadsheet {
    return {
        Group: args.group || 'group',
        'Profile Title': args.profileTitle || 'profileTitle',
        'Data Element Name': args.dataElementName || 'dataElementName',
        Definition: args.definition || 'definition',
        'Required?': args.required || 'required',
        'Occurrences Allowed': args.occurrencesAllowed || 'occurrencesAllowed',
        'Data Type': args.dataType || 'dataType',
        'Value Set URI': args.valueSetUri || 'valueSetUri',
        'Value Set Binding': args.valueSetBinding || 'valueSetBinding',
        'FHIR Element (R4)': args.fhirElement || 'fhirElement',
        'Source Profile URI': args.profileUri || 'profileUri',
        'Element StructureDefinition URI': args.structureDefinitionUri || 'structureDefinitionUri'
    };
}

function h(rows: DataElementInformationForSpreadsheet[]): DataDictionaryJson {
    const profiles: Set<DataDictionaryJsonSummaryRow> = new Set();
    rows.forEach(r => {
        profiles.add({
            group: r.Group,
            title: '',
            url: r['Source Profile URI'],
            description: ''
        });
    });
    return {
        profiles: Array.from(profiles),
        profileElements: rows,
        valueSets: [],
        valueSetElements: [],
        extensions: [],
        codeSystems: [],
        metadata: {
            title: 'title',
            version: 'version'
        }
    };
}

describe('Differ', () => {
    test('should identify added element', () => {
        const row1 = getRow({ fhirElement: '1' });
        const row2 = getRow({ fhirElement: '2' });

        const differ = new Differ(h([row1]), h([row1, row2]), {});
        expect(differ.numberOfAddedElements).toBe(1);
        expect(differ.numberOfRemovedElements).toBe(0);
        expect(differ.numberOfChangedElements).toBe(0);
        expect(Object.values(differ.addedElements)[0]).toStrictEqual(row2);
    });

    test('should identify removed element', () => {
        const row1 = getRow({ fhirElement: '1' });
        const row2 = getRow({ fhirElement: '2' });

        const differ = new Differ(h([row1, row2]), h([row1]), {});
        expect(differ.numberOfRemovedElements).toBe(1);
        expect(differ.numberOfAddedElements).toBe(0);
        expect(differ.numberOfChangedElements).toBe(0);
        expect(Object.values(differ.removedElements)[0]).toStrictEqual(row2);
    });

    test('should identify changed element', () => {
        const row1 = getRow({ dataType: '1' });
        const row2 = getRow({ dataType: '2' });

        const differ = new Differ(h([row1]), h([row2]), {});
        expect(differ.numberOfRemovedElements).toBe(0);
        expect(differ.numberOfAddedElements).toBe(0);
        expect(differ.numberOfChangedElements).toBe(1);
        expect(Object.values(differ.changedElements)[0].has('Data Type')).toBeTruthy();
    });

    test('should rename values', () => {
        const row1 = getRow({ dataType: '1' });
        const row2 = getRow({ dataType: '2' });
        const settings: DiffSettings = {
            remapValues: [
                {
                    column: 'Data Type',
                    old: '1',
                    new: '2'
                }
            ]
        };

        const differ = new Differ(h([row1]), h([row2]), settings);
        expect(differ.numberOfRemovedElements).toBe(0);
        expect(differ.numberOfAddedElements).toBe(0);
        expect(differ.numberOfChangedElements).toBe(0);
    });

    test('should profile uri', () => {
        const row1 = getRow({ profileUri: '1' });
        const row2 = getRow({ profileUri: '2', dataType: '3' });
        const settings: DiffSettings = {
            remapValues: [
                {
                    column: 'Source Profile URI',
                    old: '1',
                    new: '2'
                }
            ]
        };

        const differ = new Differ(h([row1]), h([row2]), settings);
        expect(differ.numberOfRemovedElements).toBe(0);
        expect(differ.numberOfAddedElements).toBe(0);
        expect(differ.numberOfChangedElements).toBe(1);
    });

    test('should ignore columns specified in settings', () => {
        const row1 = getRow({ group: '1' });
        const row2 = getRow({ group: '2' });
        const settings: DiffSettings = {
            ignoreColumnsWhenComparing: ['Group']
        };

        const differ = new Differ(h([row1]), h([row2]), settings);
        expect(differ.numberOfRemovedElements).toBe(0);
        expect(differ.numberOfAddedElements).toBe(0);
        expect(differ.numberOfChangedElements).toBe(0);
    });

    test('should identify added and removed profiles', () => {
        const row1 = getRow({ profileUri: '1' });
        const row2 = getRow({ profileUri: '2' });
        const row3 = getRow({ profileUri: '3' });

        const differ = new Differ(h([row1, row3]), h([row1, row2]), {});
        expect(Object.keys(differ.addedProfiles).length).toBe(1);
        expect(Object.keys(differ.removedProfiles).length).toBe(1);
        expect('2' in differ.addedProfiles).toBeTruthy();
        expect('3' in differ.removedProfiles).toBeTruthy();
    });
});
