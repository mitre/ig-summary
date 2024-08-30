import fs from 'fs';
import { logger } from '../util/logger';
import Table from 'cli-table3';
import ExcelJS, { Row } from 'exceljs';
import {
    autosizeColumns,
    markdownToExcel,
    resizeLongColumns,
    setForColumn,
    setForColumnInTable
} from '../util/util';
import path from 'path';
import yaml from 'js-yaml';
import { DataElementInformationForSpreadsheet } from '../elements/ProfileElement';
import {
    DataDictionaryJson,
    DataDictionaryJsonSummaryRow
} from '../data-dictionary/DataDictionaryJson';
import _ from 'lodash';
import toTitleCase from 'titlecase';
import { ValueSetRow } from '../data-dictionary/ValueSet';

export type DiffSettings = {
    leftName?: string;
    rightName?: string;
    filename?: string;
    valueSets?: {
        renamed?: Array<{
            old: string;
            new: string;
        }>;
    };
    ignoreColumnsWhenComparing?: string[];
    remapValues?: Array<{
        column: string;
        old: string;
        new: string;
    }>;
    notes?: Array<{
        note: string;
        appearBy: Array<{ [id: string]: string }>;
    }>;
    suppressRows?: Array<{ [id: string]: string }>;
};

export interface ChangedElementsRow extends DataElementInformationForSpreadsheet {
    Note?: string;
}

export type IndexedProfileElements = {
    [id: string]: ChangedElementsRow;
};

export type IndexedProfiles = {
    [id: string]: DataDictionaryJsonSummaryRow;
};

export type IndexedValueSetValues = {
    [id: string]: ValueSetRow;
};

export class Differ {
    public leftFile: DataDictionaryJson;
    public rightFile: DataDictionaryJson;
    public settings: DiffSettings;

    // Profiles
    private readonly leftProfiles: IndexedProfiles;
    private readonly rightProfiles: IndexedProfiles;

    private _addedProfiles: IndexedProfiles;
    private _removedProfiles: IndexedProfiles;

    // Profile elements
    public leftElements: IndexedProfileElements;
    public rightElements: IndexedProfileElements;

    private _addedElements: IndexedProfileElements;
    private _removedElements: IndexedProfileElements;
    private _changedElements: { [id: string]: Set<any> };

    // Value sets
    private readonly leftValueSets: IndexedProfiles;
    private readonly rightValueSets: IndexedProfiles;

    private _addedValueSets: IndexedProfiles;
    private _removedValueSets: IndexedProfiles;

    // Value set values
    public leftValues: IndexedValueSetValues;
    public rightValues: IndexedValueSetValues;

    private _addedValueSetValues: IndexedValueSetValues;
    private _removedValueSetValues: IndexedValueSetValues;
    private _changedValueSetValues: { [id: string]: Set<any> };

    constructor(
        leftFile: DataDictionaryJson,
        rightFile: DataDictionaryJson,
        settings: DiffSettings
    ) {
        this.leftFile = leftFile;
        this.rightFile = rightFile;
        this.settings = settings;

        // Default filenames for output - `||=` are available in TypeScript 4
        this.settings.leftName = this.settings.leftName || 'Left';
        this.settings.rightName = this.settings.rightName || 'Right';

        // Index profiles by URL
        this.leftProfiles = {};
        for (const row of this.leftFile.profiles) {
            // If `Profile URI` has been remapped in settings, apply here
            const remappedProfileURIsForRow = _.filter(this.settings.remapValues, e => {
                return e.column == 'Source Profile URI' && e.old == row.url;
            });
            if (remappedProfileURIsForRow.length > 0) {
                row.url = remappedProfileURIsForRow[0].new;
            }
            this.leftProfiles[row.url] = row;
        }
        this.rightProfiles = {};
        for (const row of this.rightFile.profiles) {
            this.rightProfiles[row.url] = row;
        }

        // Index elements by profile URI + FHIR path, and perform remap to manually change contents per settings
        this.leftElements = {};
        for (let row of this.leftFile.profileElements) {
            row = row as ChangedElementsRow;
            row = this.remapCellValues(row) as ChangedElementsRow;
            if (this.suppressedRow(row)) continue;
            this.addNote(row);
            this.leftElements[
                `${row['Source Profile URI']}>${row['Element StructureDefinition URI']}>${row['FHIR Element (R4)']}`
            ] = row;
        }
        this.rightElements = {};
        for (let row of this.rightFile.profileElements) {
            row = row as ChangedElementsRow;
            row = this.remapCellValues(row) as ChangedElementsRow;
            if (this.suppressedRow(row)) continue;
            this.addNote(row);
            this.rightElements[
                `${row['Source Profile URI']}>${row['Element StructureDefinition URI']}>${row['FHIR Element (R4)']}`
            ] = row;
        }

        // Handle value sets renamed between the old and new data dictionary
        const followUriRemap = (uri: string) => {
            if (this.settings.valueSets?.renamed) {
                for (const remapping of this.settings.valueSets.renamed) {
                    if (remapping.old == uri) {
                        return remapping.new;
                    }
                }
            }
            return uri;
        };

        // Index value sets by URL
        this.leftValueSets = {};
        for (const row of this.leftFile.valueSets) {
            this.leftValueSets[followUriRemap(row.url)] = row;
        }
        this.rightValueSets = {};
        for (const row of this.rightFile.valueSets) {
            this.rightValueSets[row.url] = row;
        }

        // Index value set values by URL + code or logic
        const getValueSetValueKey = (v: ValueSetRow): string => {
            let key = followUriRemap(v['Value set URI']);
            if (v['Logical definition']) {
                key += `>logic=${v['Logical definition']}`;
            } else {
                let code = v.Code;
                // Normalize ICD-10 by removing the decimal when constructing keys
                if (['ICD-10 CM', 'http://hl7.org/fhir/sid/icd-10-cm'].includes(v['Code system'])) {
                    code = code.replace('.', '');
                }
                key += `>code=${code}`;
            }
            return key;
        };
        this.leftValues = {};
        for (const row of this.leftFile.valueSetElements) {
            this.leftValues[getValueSetValueKey(row)] = row;
        }
        this.rightValues = {};
        for (const row of this.rightFile.valueSetElements) {
            this.rightValues[getValueSetValueKey(row)] = row;
        }
    }

    private suppressedRow(row: DataElementInformationForSpreadsheet): boolean {
        if (!this.settings.suppressRows) return false;
        for (const r of this.settings.suppressRows) {
            const cellValues = Object.keys(r).map(x => {
                return row[x];
            });
            if (_.isEqual(cellValues, Object.values(r))) {
                logger.warn(`Suppressing ${row['FHIR Element (R4)']}`);
                return true;
            }
        }
        return false;
    }

    private addNote(row: DataElementInformationForSpreadsheet): void {
        if (!this.settings.notes) return;
        for (const n of this.settings.notes) {
            let anyMatch = false;
            for (const appearByCriteria of n.appearBy) {
                let match = true;
                for (const [colName, value] of Object.entries(appearByCriteria)) {
                    if (row[colName] !== value) match = false;
                }
                if (match) {
                    anyMatch = true;
                    break;
                }
            }
            if (anyMatch) {
                row.Note = `**Note:** ${n.note}`;
            }
        }
    }

    /**
     * Helper to handle remapping from old to new values per user-specified settings
     * @param row - the row to perform the remapping on
     * @private
     */
    private remapCellValues(row: { [id: string]: any }): { [id: string]: any } {
        if (this.settings.remapValues) {
            for (const remap of this.settings.remapValues) {
                if (remap.column in row && row[remap.column] === remap.old) {
                    row[remap.column] = remap.new;
                }
            }
        }
        return row;
    }

    get addedElements(): IndexedProfileElements {
        if (this._addedElements) return this._addedElements;

        this._addedElements = {};
        for (const row of Object.keys(this.rightElements)) {
            if (!(row in this.leftElements)) {
                this._addedElements[row] = this.rightElements[row];

                // Put note into definition
                if (this._addedElements[row].Note) {
                    this._addedElements[row].Definition += `\n\n${this._addedElements[row].Note}`;
                    delete this._addedElements[row].Note;
                }
            }
        }
        return this._addedElements;
    }

    get removedElements(): IndexedProfileElements {
        if (this._removedElements) return this._removedElements;

        this._removedElements = {};
        for (const row of Object.keys(this.leftElements)) {
            if (!(row in this.rightElements)) {
                this._removedElements[row] = this.leftElements[row];

                // Put note into definition
                if (this.removedElements[row].Note) {
                    this.removedElements[row].Definition += `\n\n${this.removedElements[row].Note}`;
                    delete this.removedElements[row].Note;
                }
            }
        }
        return this._removedElements;
    }

    get changedElements(): { [id: string]: Set<any> } {
        if (this._changedElements) return this._changedElements;

        this._changedElements = {};
        for (const key of Object.keys(this.rightElements).filter((x: any) => {
            return !(x in this.addedElements);
        })) {
            const aElem = this.leftElements[key];
            const bElem = this.rightElements[key];
            this._changedElements[key] = new Set();

            let k: string, v: string;
            for ([k, v] of Object.entries(aElem)) {
                // Skip columns ignored by the user
                if (
                    this.settings.ignoreColumnsWhenComparing &&
                    this.settings.ignoreColumnsWhenComparing.includes(k)
                ) {
                    continue;
                }

                // Skip `Note` column
                if (k == 'Note') continue;

                if (v != bElem[k]) this._changedElements[key].add(k);
            }

            for ([k, v] of Object.entries(bElem)) {
                // Skip columns ignored by the user
                if (
                    this.settings.ignoreColumnsWhenComparing &&
                    this.settings.ignoreColumnsWhenComparing.includes(k)
                ) {
                    continue;
                }

                // Skip `Note` column
                if (k == 'Note') continue;

                if (v != aElem[k]) this._changedElements[key].add(k);
            }

            if (this._changedElements[key].size === 0) {
                delete this._changedElements[key];
            }
        }

        return this._changedElements;
    }

    get addedProfiles(): IndexedProfiles {
        if (this._addedProfiles) return this._addedProfiles;

        this._addedProfiles = {};
        for (const row of Object.keys(this.rightProfiles)) {
            if (!(row in this.leftProfiles)) {
                this._addedProfiles[row] = this.rightProfiles[row];
            }
        }
        return this._addedProfiles;
    }

    get removedProfiles(): IndexedProfiles {
        if (this._removedProfiles) return this._removedProfiles;

        this._removedProfiles = {};
        for (const row of Object.keys(this.leftProfiles)) {
            if (!(row in this.rightProfiles)) {
                this._removedProfiles[row] = this.leftProfiles[row];
            }
        }
        return this._removedProfiles;
    }

    get addedValueSets(): IndexedProfiles {
        if (this._addedValueSets) return this._addedValueSets;

        this._addedValueSets = {};
        for (const row of Object.keys(this.rightValueSets)) {
            if (!(row in this.leftValueSets)) {
                this._addedValueSets[row] = this.rightValueSets[row];
            }
        }
        return this._addedValueSets;
    }

    get removedValueSets(): IndexedProfiles {
        if (this._removedValueSets) return this._removedValueSets;

        this._removedValueSets = {};
        for (const row of Object.keys(this.leftValueSets)) {
            if (!(row in this.rightValueSets)) {
                this._removedValueSets[row] = this.leftValueSets[row];
            }
        }
        return this._removedValueSets;
    }

    get addedValueSetValues(): IndexedValueSetValues {
        if (this._addedValueSetValues) return this._addedValueSetValues;

        this._addedValueSetValues = {};
        for (const row of Object.keys(this.rightValues)) {
            if (!(row in this.leftValues)) {
                this._addedValueSetValues[row] = this.rightValues[row];
            }
        }
        return this._addedValueSetValues;
    }

    get removedValueSetValues(): IndexedValueSetValues {
        if (this._removedValueSetValues) return this._removedValueSetValues;

        this._removedValueSetValues = {};
        for (const row of Object.keys(this.leftValues)) {
            if (!(row in this.rightValues)) {
                this._removedValueSetValues[row] = this.leftValues[row];
            }
        }
        return this._removedValueSetValues;
    }

    get changedValueSetValues(): { [id: string]: Set<any> } {
        if (this._changedValueSetValues) return this._changedValueSetValues;

        this._changedValueSetValues = {};
        for (const key of Object.keys(this.rightValues).filter((x: any) => {
            return !(x in this.addedValueSetValues);
        })) {
            const aElem = this.remapCellValues(this.leftValues[key]);
            const bElem = this.remapCellValues(this.rightValues[key]);
            this._changedValueSetValues[key] = new Set();

            let k: string, v: string;
            for ([k, v] of Object.entries(aElem)) {
                if (v != bElem[k]) this._changedValueSetValues[key].add(k);
            }

            for ([k, v] of Object.entries(bElem)) {
                if (v != aElem[k]) this._changedValueSetValues[key].add(k);
            }

            if (this._changedValueSetValues[key].size === 0) {
                delete this._changedValueSetValues[key];
            }
        }

        return this._changedValueSetValues;
    }

    get addedElementsInExistingProfiles(): IndexedProfileElements {
        return _.pickBy(this.addedElements, e => {
            return !(e['Source Profile URI'] in this.addedProfiles);
        });
    }

    get removedElementsInExistingProfiles(): IndexedProfileElements {
        return _.pickBy(this.removedElements, e => {
            return !(e['Source Profile URI'] in this.removedProfiles);
        });
    }

    get numberOfAddedElements(): number {
        return Object.keys(this.addedElements).length;
    }

    get numberOfRemovedElements(): number {
        return Object.keys(this.removedElements).length;
    }

    get numberOfChangedElements(): number {
        return Object.keys(this.changedElements).length;
    }

    public logSummary(): void {
        if (this.numberOfAddedElements === 0) {
            logger.info('0 added elements');
        } else {
            logger.warn(`${this.numberOfAddedElements} added element(s)`);
        }
        if (this.numberOfRemovedElements === 0) {
            logger.info('0 removed elements');
        } else {
            logger.warn(`${this.numberOfRemovedElements} removed element(s)`);
        }
        if (this.numberOfChangedElements === 0) {
            logger.info('0 changed elements');
        } else {
            logger.warn(`${this.numberOfChangedElements} changed element(s)`);
        }
    }

    public logDetails(): void {
        // Print to console
        for (const elems of [this.addedElements, this.removedElements]) {
            const size = Object.keys(elems).length;
            const word = elems === this.addedElements ? 'added' : 'removed';
            if (size) {
                console.log('\n\n');
                logger.warn(`${size} ${word} element(s)`);
                for (const [k, v] of Object.entries(elems)) {
                    console.log(
                        `    ${v['Group']} > ${v['Profile Title']} ${v['Data Element Name']}`
                    );
                    console.log(`         ${k}`);
                    console.log('');
                }
            } else {
                logger.info(`0 ${word} elements`);
            }
        }

        const size = Object.keys(this.changedElements).length;
        if (size) {
            console.log('\n\n');
            logger.warn(`${size} changed element(s)`);
            for (const [k, changedCols] of Object.entries(this.changedElements)) {
                const v = this.leftElements[k];
                console.log(`${v['Group']} > ${v['Profile Title']} ${v['Data Element Name']}`);
                console.log(`${k}`);
                const table = new Table({
                    head: ['Field', 'Old', 'New']
                });
                for (const colName of changedCols) {
                    table.push([
                        colName,
                        _.truncate(this.leftElements[k][colName], { length: 30, separator: ' ' }),
                        _.truncate(this.rightElements[k][colName], { length: 30, separator: ' ' })
                    ]);
                }
                console.log(table.toString());
                console.log('');
            }
        } else {
            logger.info('0 changed elements');
        }
    }

    public toExcel(outputPath: string) {
        // Figure if all groups are "Default", in which case the Group column can be left out of all sheets
        const allGroupsAreDefault = Object.values(this.leftProfiles)
            .concat(Object.values(this.rightProfiles))
            .every(x => {
                return x.group == 'Default';
            });

        // Write to Excel workbook
        const workbook = new ExcelJS.Workbook();

        const indexWorksheet = workbook.addWorksheet('IG information');
        indexWorksheet.addRow([]);
        indexWorksheet.addRow(['', 'Data Dictionary Diff']);
        indexWorksheet.getRow(indexWorksheet.rowCount).font = {
            name: 'Helvetica',
            bold: true,
            size: 16
        };
        [
            [''],
            ['', 'Implementation guide', this.rightFile.metadata.title],
            [''],
            [
                '',
                '"Old" data dictionary',
                `${this.settings.leftName} (${this.leftFile.metadata.version})`
            ],
            [
                '',
                '"New" data dictionary',
                `${this.settings.rightName} (${this.rightFile.metadata.version})`
            ],
            [''],
            [
                '',
                'Sheet descriptions',
                markdownToExcel(
                    [
                        'This Excel file shows the difference (or "diff") between two data dictionaries generated by the _ig-dd_ tool.',
                        '**Added profiles:** Shows profiles that were entirely absent from the "old" data dictionary, but appear in the "new" data dictionary. Note that the individual elements in these profiles are not part of the "diff"; instead, these can be viewed in the "new" data dictionary.',
                        '**Removed profiles:** Shows profiles that are entirely absent from the "new" data dictionary, but appeared int eh "old" data dictionary. Note that the individual elements in these profiles are not part of the "diff"; instead, these can be viewed in the "old" data dictionary.',
                        '**Added elements:** Shows elements that are in the "new" data dictionary, but do not appear in the "old" data dictionary.',
                        '**Removed elements:** Shows elements that are not in the "new" data dictionary, but do appear in the "old" data dictionary.',
                        '**Changed elements:** Shows elements that appear in both the "new" and "old" data dictionaries, but have at least one attribute that has changed. Changes are highlighted in yellow.'
                    ].join('\n\n')
                )
            ],
            [
                '',
                '',
                markdownToExcel(
                    [
                        '**Added value sets:** Shows value sets that were entirely absent from the "old" data dictionary, but appear in the "new" data dictionary. Note that the individual codes in these value sets are not part of the "diff"; instead, these can be viewed in the "new" data dictionary.',
                        '**Removed value sets:** Shows value sets that are entirely absent from the "new" data dictionary, but appeared int eh "old" data dictionary. Note that the individual codes in these value sets are not part of the "diff"; instead, these can be viewed in the "old" data dictionary.',
                        '**Value sets - added codes:** For value sets appearing in both the "old" and "new" data dictionaries, this sheet shows codes that are in the "new" data dictionary, but do not appear in the "old" data dictionary.',
                        '**Value sets - removed codes:** For value sets appearing in both the "old" and "new" data dictionaries, this sheet shows codes that not are in the "new" data dictionary, but do appear in the "old" data dictionary.',
                        '**Value sets - changed codes:** Shows changes to code descriptions between the "old" and "new" data dictionaries. Changes are highlighted in yellow.'
                    ].join('\n\n')
                )
            ]
        ].forEach(line => {
            indexWorksheet.addRow(line);
        });

        indexWorksheet.getRows(1, 1000).forEach(x => {
            x.font = { name: 'Helvetica' };
            x.fill = {
                fgColor: { argb: 'FFFFFFFF' },
                pattern: 'solid',
                type: 'pattern'
            };
        });
        indexWorksheet.getColumn(2).font = { name: 'Helvetica', bold: true };
        indexWorksheet.getRow(2).font = { name: 'Helvetica', bold: true, size: 16 };
        autosizeColumns(indexWorksheet);
        setForColumn(indexWorksheet, 3, 100);
        indexWorksheet.views = [
            {
                topLeftCell: 'A2',
                activeCell: 'A2',
                zoomScale: 130
            }
        ];

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const worksheetAddedProfiles = workbook.addWorksheet('Added profiles');
        worksheetAddedProfiles.addRow(['Added profiles']);
        worksheetAddedProfiles.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            size: 14,
            color: { argb: 'FF000000' }
        };
        let row = worksheetAddedProfiles.addRow([
            markdownToExcel(
                'This sheet lists profiles which appear in the "new" data dictionary and do not appear in the "old" data dictionary.'
            )
        ]);
        row.getCell(2).merge(row.getCell(1));
        row.getCell(3).merge(row.getCell(1));
        if (Object.keys(this.addedProfiles).length > 0) {
            worksheetAddedProfiles.addTable({
                name: 'added_profiles',
                ref: 'A3',
                headerRow: true,
                totalsRow: false,
                style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true
                },
                columns: Object.keys(Object.values(this.addedProfiles)[0])
                    .map(k => {
                        if (allGroupsAreDefault && k == 'group') return null;
                        return { name: toTitleCase(k), filterButton: true };
                    })
                    .filter(x => {
                        return x !== null;
                    }),
                rows: Object.values(this.addedProfiles).map(k => {
                    return allGroupsAreDefault ? Object.values(k).slice(1) : Object.values(k);
                })
            });

            autosizeColumns(worksheetAddedProfiles);
            setForColumnInTable(worksheetAddedProfiles, 'added_profiles', 'Description', 100);
            worksheetAddedProfiles.getRows(3, worksheetAddedProfiles.rowCount - 2).forEach(row => {
                row.font = { name: 'Helvetica' };
            });
            worksheetAddedProfiles.views = [
                {
                    topLeftCell: 'B4',
                    activeCell: 'A1',
                    zoomScale: 130,
                    state: 'frozen',
                    xSplit: 1,
                    ySplit: 3
                }
            ];
            worksheetAddedProfiles.getRow(3).font = {
                name: 'Helvetica',
                bold: true,
                color: { argb: 'FFFFFFFF' }
            };
            row.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const worksheetRemovedProfiles = workbook.addWorksheet('Removed profiles');
        worksheetRemovedProfiles.addRow(['Removed profiles']);
        worksheetRemovedProfiles.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            size: 14,
            color: { argb: 'FF000000' }
        };
        row = worksheetRemovedProfiles.addRow([
            markdownToExcel(
                'This sheet lists profiles which do not appear in the "new" data dictionary but do appear in the "old" data dictionary.'
            )
        ]);
        row.getCell(2).merge(row.getCell(1));
        row.getCell(3).merge(row.getCell(1));
        if (Object.keys(this.removedProfiles).length > 0) {
            worksheetRemovedProfiles.addTable({
                name: 'removed_profiles',
                ref: 'A3',
                headerRow: true,
                totalsRow: false,
                style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true
                },
                columns: Object.keys(Object.values(this.removedProfiles)[0])
                    .map(k => {
                        if (allGroupsAreDefault && k == 'group') return null;
                        return { name: toTitleCase(k), filterButton: true };
                    })
                    .filter(x => {
                        return x !== null;
                    }),
                rows: Object.values(this.removedProfiles).map(k => {
                    return allGroupsAreDefault ? Object.values(k).slice(1) : Object.values(k);
                })
            });
        }
        autosizeColumns(worksheetRemovedProfiles);
        setForColumnInTable(worksheetRemovedProfiles, 'removed_profiles', 'Description', 100);
        const rowsForFontChange = worksheetRemovedProfiles.getRows(
            3,
            worksheetRemovedProfiles.rowCount - 2
        );
        if (rowsForFontChange) {
            rowsForFontChange.forEach(row => {
                row.font = { name: 'Helvetica' };
            });
        }
        worksheetRemovedProfiles.views = [
            {
                topLeftCell: 'B4',
                activeCell: 'A1',
                zoomScale: 130,
                state: 'frozen',
                xSplit: 1,
                ySplit: 3
            }
        ];
        worksheetRemovedProfiles.getRow(3).font = {
            name: 'Helvetica',
            bold: true,
            color: { argb: 'FFFFFFFF' }
        };
        row.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const worksheetAdded = workbook.addWorksheet('Added elements');
        worksheetAdded.addRow(['Elements added to existing profiles']);
        worksheetAdded.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            size: 14,
            color: { argb: 'FF000000' }
        };
        row = worksheetAdded.addRow([
            markdownToExcel(
                'This sheet lists elements added to _existing_ profiles. It **does not** include elements appearing in entirely new profiles, which are not included in the "diff" output. These elements can be seen in the "Data elements" tab of the "new" data dictionary.'
            )
        ]);
        row.getCell(2).merge(row.getCell(1));
        row.getCell(3).merge(row.getCell(1));
        if (Object.keys(this.addedElementsInExistingProfiles).length > 0) {
            worksheetAdded.addTable({
                name: 'added_elements',
                ref: 'A3',
                headerRow: true,
                totalsRow: false,
                style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true
                },
                columns: Object.keys(Object.values(this.addedElementsInExistingProfiles)[0])
                    .map(k => {
                        if (allGroupsAreDefault && k == 'Group') return null;
                        return { name: k, filterButton: true };
                    })
                    .filter(x => {
                        return x !== null;
                    }),
                rows: Object.values(this.addedElementsInExistingProfiles).map(k => {
                    const values = allGroupsAreDefault
                        ? Object.values(k).slice(1)
                        : Object.values(k);

                    // Format Markdown in the definition
                    let keys = Object.keys(Object.values(this.addedElementsInExistingProfiles)[0]);
                    if (allGroupsAreDefault)
                        keys = keys.filter(x => {
                            return x != 'Group';
                        });
                    const definitionIndex = keys.indexOf('Definition');
                    values[definitionIndex] = markdownToExcel(values[definitionIndex]);

                    return values;
                })
            });

            autosizeColumns(worksheetAdded);
            resizeLongColumns(worksheetAdded, 'added_elements');
            worksheetAdded.getRows(3, worksheetAdded.rowCount - 2).forEach(row => {
                row.font = { name: 'Helvetica' };
            });
            worksheetAdded.views = [
                {
                    topLeftCell: allGroupsAreDefault ? 'C4' : 'D4',
                    activeCell: 'A1',
                    zoomScale: 130,
                    state: 'frozen',
                    xSplit: allGroupsAreDefault ? 2 : 3,
                    ySplit: 3
                }
            ];
            worksheetAdded.getRow(3).font = {
                name: 'Helvetica',
                bold: true,
                color: { argb: 'FFFFFFFF' }
            };
        } else {
            worksheetAdded.addRow([
                {
                    richText: [
                        {
                            font: {
                                name: 'Helvetica',
                                bold: true,
                                color: { argb: 'FFFF0000' }
                            },
                            text: 'No added elements'
                        }
                    ]
                }
            ]);
            worksheetAdded.getColumn(1).width = 100;
        }
        row.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        row.height = 40;

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const worksheetRemoved = workbook.addWorksheet('Removed elements');
        worksheetRemoved.addRow(['Elements removed from existing profiles']);
        worksheetRemoved.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            size: 14,
            color: { argb: 'FF000000' }
        };
        row = worksheetRemoved.addRow([
            markdownToExcel(
                'This sheet lists elements removed from _existing_ profiles. It **does not** include elements from profiles which were entirely removed, which are not included in the "diff" output. These elements can be seen in the "Data elements" tab of the "old" data dictionary.'
            )
        ]);
        row.getCell(2).merge(row.getCell(1));
        row.getCell(3).merge(row.getCell(1));

        if (Object.keys(this.removedElementsInExistingProfiles).length > 0) {
            worksheetRemoved.addTable({
                name: 'removed_elements',
                ref: 'A3',
                headerRow: true,
                totalsRow: false,
                style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true
                },
                columns: Object.keys(Object.values(this.removedElementsInExistingProfiles)[0])
                    .map(k => {
                        if (allGroupsAreDefault && k == 'Group') return null;
                        return { name: k, filterButton: true };
                    })
                    .filter(x => {
                        return x !== null;
                    }),
                rows: Object.values(this.removedElementsInExistingProfiles).map(k => {
                    const values = allGroupsAreDefault
                        ? Object.values(k).slice(1)
                        : Object.values(k);

                    // Format Markdown in the definition
                    let keys = Object.keys(
                        Object.values(this.removedElementsInExistingProfiles)[0]
                    );
                    if (allGroupsAreDefault)
                        keys = keys.filter(x => {
                            return x != 'Group';
                        });
                    const definitionIndex = keys.indexOf('Definition');
                    values[definitionIndex] = markdownToExcel(values[definitionIndex]);

                    return values;
                })
            });
            autosizeColumns(worksheetRemoved);
            resizeLongColumns(worksheetRemoved, 'removed_elements');
            worksheetRemoved.getRows(3, worksheetRemoved.rowCount - 2).forEach(row => {
                row.font = { name: 'Helvetica' };
            });
            worksheetRemoved.views = [
                {
                    topLeftCell: allGroupsAreDefault ? 'C4' : 'D4',
                    activeCell: 'A1',
                    zoomScale: 130,
                    state: 'frozen',
                    xSplit: allGroupsAreDefault ? 2 : 3,
                    ySplit: 3
                }
            ];
            worksheetRemoved.getRow(3).font = {
                name: 'Helvetica',
                bold: true,
                color: { argb: 'FFFFFFFF' }
            };
        } else {
            worksheetRemoved.addRow([
                {
                    richText: [
                        {
                            font: {
                                name: 'Helvetica',
                                bold: true,
                                color: { argb: 'FFFF0000' }
                            },
                            text: 'No removed elements'
                        }
                    ]
                }
            ]);
            worksheetRemoved.getColumn(1).width = 100;
        }
        row.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        row.height = 40;

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const worksheetChanged = workbook.addWorksheet('Changed elements');
        let cols = [
            {
                header: 'File',
                key: 'File'
            }
        ].concat(
            Object.keys(Object.values(this.leftElements)[0]).map((x: any) => {
                return {
                    header: x,
                    key: x
                };
            })
        );
        worksheetChanged.columns = cols;
        if (!_.isEmpty(this.changedElements)) {
            for (const [k, changedValues] of Object.entries(this.changedElements)) {
                this.leftElements[k]['File'] = this.settings.leftName;
                this.rightElements[k]['File'] = this.settings.rightName;

                const rowA = worksheetChanged.addRow(
                    _.pickBy(this.leftElements[k], key => {
                        return key != 'Note';
                    })
                );
                const rowB = worksheetChanged.addRow(
                    _.pickBy(this.rightElements[k], key => {
                        return key != 'Note';
                    })
                );

                for (const r of [rowA, rowB]) {
                    r.fill = {
                        fgColor: { argb: 'FFFFFFFF' },
                        pattern: 'solid',
                        type: 'pattern'
                    };

                    for (const name of changedValues) {
                        r.getCell(name).fill = {
                            fgColor: { argb: 'FFFFF601' },
                            pattern: 'solid',
                            type: 'pattern'
                        };
                    }
                }

                let emptyRow: Row;
                if (this.leftElements[k].Note) {
                    // Add note to empty row; will be the same in both left- and right-hand elements
                    emptyRow = worksheetChanged.addRow({
                        Definition: markdownToExcel(this.leftElements[k].Note)
                    });
                    emptyRow.height = 30;
                    const cell = emptyRow.getCell('Definition');
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore - TypeScript doesn't like `richText`
                    cell.value.richText[0].font = {
                        name: 'Helvetica',
                        bold: true,
                        color: { argb: 'FFFF0000' }
                    };
                } else {
                    emptyRow = worksheetChanged.addRow({});
                }

                emptyRow.fill = {
                    fgColor: { argb: 'FFFFFFFF' },
                    pattern: 'solid',
                    type: 'pattern'
                };
            }
        }
        autosizeColumns(worksheetChanged);
        worksheetChanged.getColumn('Definition').width = 75;
        worksheetChanged.getColumn('Data Type').width = 30;
        worksheetChanged.getColumn('Value Set URI').width = 30;
        worksheetChanged.getColumn('File').width = 15;
        worksheetChanged.getRows(1, worksheetChanged.rowCount + 1).forEach(row => {
            row.font = { name: 'Helvetica' };
        });
        worksheetChanged.views = [
            {
                topLeftCell: 'E2',
                activeCell: 'A1',
                zoomScale: 130,
                state: 'frozen',
                xSplit: 4,
                ySplit: 1
            }
        ];
        worksheetChanged.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            color: { argb: 'FFFFFFFF' }
        };
        worksheetChanged.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            color: { argb: 'FF000000' }
        };

        // Hide group column if it's all default
        if (allGroupsAreDefault) {
            const col = worksheetChanged.getColumn(2);
            col.hidden = true;
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const worksheetAddedValueSets = workbook.addWorksheet('Added value sets');
        worksheetAddedValueSets.addRow(['Added value sets']);
        worksheetAddedValueSets.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            size: 14,
            color: { argb: 'FF000000' }
        };
        row = worksheetAddedValueSets.addRow([
            markdownToExcel(
                'This sheet lists value sets which appear in the "new" data dictionary and do not appear in the "old" data dictionary.'
            )
        ]);
        row.getCell(2).merge(row.getCell(1));
        row.getCell(3).merge(row.getCell(1));
        if (Object.keys(this.addedValueSets).length > 0) {
            worksheetAddedValueSets.addTable({
                name: 'added_value_sets',
                ref: 'A3',
                headerRow: true,
                totalsRow: false,
                style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true
                },
                columns: Object.keys(Object.values(this.addedValueSets)[0]).map(k => {
                    return { name: toTitleCase(k), filterButton: true };
                }),
                rows: Object.values(this.addedValueSets).map(k => {
                    return Object.values(k);
                })
            });

            autosizeColumns(worksheetAddedValueSets);
            setForColumnInTable(worksheetAddedValueSets, 'added_value_sets', 'Description', 100);
            worksheetAddedValueSets
                .getRows(3, worksheetAddedValueSets.rowCount - 2)
                .forEach(row => {
                    row.font = { name: 'Helvetica' };
                });
            worksheetAddedValueSets.views = [
                {
                    topLeftCell: 'B4',
                    activeCell: 'A1',
                    zoomScale: 130,
                    state: 'frozen',
                    xSplit: 1,
                    ySplit: 3
                }
            ];
            worksheetAddedValueSets.getRow(3).font = {
                name: 'Helvetica',
                bold: true,
                color: { argb: 'FFFFFFFF' }
            };
            row.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const worksheetRemovedValueSets = workbook.addWorksheet('Removed value sets');
        worksheetRemovedValueSets.addRow(['Removed value sets']);
        worksheetRemovedValueSets.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            size: 14,
            color: { argb: 'FF000000' }
        };
        row = worksheetRemovedValueSets.addRow([
            markdownToExcel(
                'This sheet lists value sets which do not appear in the "new" data dictionary but do appear in the "old" data dictionary.'
            )
        ]);
        row.getCell(2).merge(row.getCell(1));
        row.getCell(3).merge(row.getCell(1));
        if (Object.keys(this.removedValueSets).length > 0) {
            worksheetRemovedValueSets.addTable({
                name: 'removed_value_sets',
                ref: 'A3',
                headerRow: true,
                totalsRow: false,
                style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true
                },
                columns: Object.keys(Object.values(this.removedValueSets)[0]).map(k => {
                    return { name: toTitleCase(k), filterButton: true };
                }),
                rows: Object.values(this.removedValueSets).map(k => {
                    return Object.values(k);
                })
            });
        }
        autosizeColumns(worksheetRemovedValueSets);
        setForColumnInTable(worksheetRemovedValueSets, 'removed_value_sets', 'Description', 100);
        const removedRows = worksheetRemovedValueSets.getRows(
            3,
            worksheetRemovedValueSets.rowCount - 2
        );

        if (removedRows) {
            removedRows.forEach(row => {
                row.font = { name: 'Helvetica' };
            });
        }
        worksheetRemovedValueSets.views = [
            {
                topLeftCell: 'B4',
                activeCell: 'A1',
                zoomScale: 130,
                state: 'frozen',
                xSplit: 1,
                ySplit: 3
            }
        ];
        worksheetRemovedValueSets.getRow(3).font = {
            name: 'Helvetica',
            bold: true,
            color: { argb: 'FFFFFFFF' }
        };
        row.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const worksheetAddedValueSetValues = workbook.addWorksheet('Value sets - added codes');
        worksheetAddedValueSetValues.addRow(['Codes added to existing value sets']);
        worksheetAddedValueSetValues.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            size: 14,
            color: { argb: 'FF000000' }
        };
        row = worksheetAddedValueSetValues.addRow([
            markdownToExcel(
                'This sheet lists codes added to _existing_ value sets. It **does not** include values appearing in entirely new value sets, which are not included in the "diff" output. These elements can be seen in the "Value set codes" tab of the "new" data dictionary.'
            )
        ]);
        row.getCell(2).merge(row.getCell(1));
        row.getCell(3).merge(row.getCell(1));

        const valueSetColNames = [
            'Value set name',
            'Code system',
            'Logical definition',
            'Code',
            'Code description'
        ];
        if (Object.keys(this.addedValueSetValues).length > 0) {
            worksheetAddedValueSetValues.addTable({
                name: 'added_value_set_codes',
                ref: 'A3',
                headerRow: true,
                totalsRow: false,
                style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true
                },
                columns: valueSetColNames.map((x: string) => {
                    return {
                        name: x,
                        filterButton: true
                    };
                }),
                rows: Object.values(
                    _.pickBy(this.addedValueSetValues, (_, key) => {
                        // The contents of `this.addedValueSetValues` is indexed by a string starting with the value set URI.
                        // Filter values from any value sets that are brand new for this IG.
                        return (
                            Object.keys(this.addedValueSets) // URLs of added value sets
                                .filter(addedValueSetURI => {
                                    // Remember, `key` starts with the value set URI
                                    return key.startsWith(addedValueSetURI);
                                }).length == 0 // if length > 0, then the value set URI for this added value is from a new value set
                        );
                    })
                )
                    // Value set rows may not have all columns in the Excel table, so use the column names to generate
                    // the row values.
                    .map(v => {
                        return valueSetColNames.map(key => {
                            return v[key];
                        });
                    })
            });

            autosizeColumns(worksheetAddedValueSetValues);
            setForColumn(worksheetAddedValueSetValues, 3, 50);

            worksheetAddedValueSetValues
                .getRows(3, worksheetAddedValueSetValues.rowCount - 2)
                .forEach(row => {
                    row.font = { name: 'Helvetica' };
                });
            worksheetAddedValueSetValues.views = [
                {
                    topLeftCell: 'A4',
                    activeCell: 'A1',
                    zoomScale: 130,
                    state: 'frozen',
                    xSplit: 0,
                    ySplit: 3
                }
            ];
            worksheetAddedValueSetValues.getRow(3).font = {
                name: 'Helvetica',
                bold: true,
                color: { argb: 'FFFFFFFF' }
            };
        } else {
            worksheetAddedValueSetValues.addRow([
                {
                    richText: [
                        {
                            font: {
                                name: 'Helvetica',
                                bold: true,
                                color: { argb: 'FFFF0000' }
                            },
                            text: 'No added values'
                        }
                    ]
                }
            ]);
            worksheetAddedValueSetValues.getColumn(1).width = 100;
        }
        row.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        row.height = 40;

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const worksheetRemovedValueSetValues = workbook.addWorksheet('Value sets - removed codes');
        worksheetRemovedValueSetValues.addRow(['Codes removed from existing value sets']);
        worksheetRemovedValueSetValues.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            size: 14,
            color: { argb: 'FF000000' }
        };
        row = worksheetRemovedValueSetValues.addRow([
            markdownToExcel(
                'This sheet lists codes removed from _existing_ value sets. It **does not** include values from value sets that were entirely removed; these elements can be seen in the "Value set codes" tab of the "old" data dictionary.'
            )
        ]);
        row.getCell(2).merge(row.getCell(1));
        row.getCell(3).merge(row.getCell(1));

        if (Object.keys(this.removedValueSetValues).length > 0) {
            worksheetRemovedValueSetValues.addTable({
                name: 'removed_value_set_codes',
                ref: 'A3',
                headerRow: true,
                totalsRow: false,
                style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true
                },
                columns: valueSetColNames.map((x: string) => {
                    return {
                        name: x,
                        filterButton: true
                    };
                }),
                rows: Object.values(
                    _.pickBy(this.removedValueSetValues, (_, key) => {
                        // The contents of `this.addedValueSetValues` is indexed by a string starting with the value set URI.
                        // Filter values from any value sets that are brand new for this IG.
                        return (
                            Object.keys(this.removedValueSets) // URLs of added value sets
                                .filter(removedValueSetURI => {
                                    // Remember, `key` starts with the value set URI
                                    return key.startsWith(removedValueSetURI);
                                }).length == 0 // if length > 0, then the value set URI for this added value is from a new value set
                        );
                    })
                )
                    // Value set rows may not have all columns in the Excel table, so use the column names to generate
                    // the row values.
                    .map(v => {
                        return valueSetColNames.map(key => {
                            return v[key];
                        });
                    })
            });

            autosizeColumns(worksheetRemovedValueSetValues);
            setForColumn(worksheetRemovedValueSetValues, 3, 50);

            worksheetRemovedValueSetValues
                .getRows(3, worksheetRemovedValueSetValues.rowCount - 2)
                .forEach(row => {
                    row.font = { name: 'Helvetica' };
                });
            worksheetRemovedValueSetValues.views = [
                {
                    topLeftCell: 'A4',
                    activeCell: 'A1',
                    zoomScale: 130,
                    state: 'frozen',
                    xSplit: 0,
                    ySplit: 3
                }
            ];
            worksheetRemovedValueSetValues.getRow(3).font = {
                name: 'Helvetica',
                bold: true,
                color: { argb: 'FFFFFFFF' }
            };
        } else {
            worksheetRemovedValueSetValues.addRow([
                {
                    richText: [
                        {
                            font: {
                                name: 'Helvetica',
                                bold: true,
                                color: { argb: 'FFFF0000' }
                            },
                            text: 'No removed values'
                        }
                    ]
                }
            ]);
            worksheetRemovedValueSetValues.getColumn(1).width = 100;
        }
        row.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        row.height = 40;
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const worksheetChangedValueSetValues = workbook.addWorksheet('Value sets - changed codes');
        cols = [
            'File',
            'Value set name',
            'Code system',
            'Logical definition',
            'Code',
            'Code description'
        ].map((x: any) => {
            return {
                header: x,
                key: x
            };
        });
        worksheetChangedValueSetValues.columns = cols;
        for (const [k, changedValues] of Object.entries(this.changedValueSetValues)) {
            this.leftValues[k]['File'] = this.settings.leftName;
            this.rightValues[k]['File'] = this.settings.rightName;

            const rowA = worksheetChangedValueSetValues.addRow(this.leftValues[k]);
            const rowB = worksheetChangedValueSetValues.addRow(this.rightValues[k]);

            for (const r of [rowA, rowB]) {
                r.fill = {
                    fgColor: { argb: 'FFFFFFFF' },
                    pattern: 'solid',
                    type: 'pattern'
                };

                for (const name of changedValues) {
                    r.getCell(name).fill = {
                        fgColor: { argb: 'FFFFF601' },
                        pattern: 'solid',
                        type: 'pattern'
                    };
                }
            }

            const emptyRow = worksheetChangedValueSetValues.addRow({});

            emptyRow.fill = {
                fgColor: { argb: 'FFFFFFFF' },
                pattern: 'solid',
                type: 'pattern'
            };
        }
        autosizeColumns(worksheetChangedValueSetValues);
        // worksheetChangedValueSetValues.getColumn('Definition').width = 75;
        // worksheetChangedValueSetValues.getColumn('Data Type').width = 30;
        // worksheetChangedValueSetValues.getColumn('Value Set URI').width = 30;
        worksheetChangedValueSetValues.getColumn('File').width = 15;
        worksheetChangedValueSetValues
            .getRows(1, worksheetChangedValueSetValues.rowCount + 1)
            .forEach(row => {
                row.font = { name: 'Helvetica' };
            });
        worksheetChangedValueSetValues.views = [
            {
                topLeftCell: 'C2',
                activeCell: 'A1',
                zoomScale: 130,
                state: 'frozen',
                xSplit: 2,
                ySplit: 1
            }
        ];
        worksheetChangedValueSetValues.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            color: { argb: 'FFFFFFFF' }
        };
        worksheetChangedValueSetValues.getRow(1).font = {
            name: 'Helvetica',
            bold: true,
            color: { argb: 'FF000000' }
        };

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const filenameRoot = this.settings.filename || 'diff';
        const excelPath = path.join(fs.realpathSync(outputPath), filenameRoot + '.xlsx');
        logger.info(`Writing Excel diff to ${excelPath}`);
        workbook.xlsx.writeFile(excelPath);
    }

    public static loadSettings(settingsPath: string): DiffSettings {
        return yaml.load(fs.readFileSync(settingsPath, 'utf8')) as DiffSettings;
    }

    public static loadDataDictionaryJson(path: string): DataDictionaryJson {
        return JSON.parse(fs.readFileSync(path, 'utf8'));
    }
}
