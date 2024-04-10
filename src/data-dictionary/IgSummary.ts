import path from 'path';
import fs from 'fs-extra';
import ExcelJS from 'exceljs';
import {fhirdefs, utils as fshutils} from 'fsh-sushi';
import * as _ from 'lodash';
import * as changeCase from 'change-case';

import {logger} from '../util/logger';
import {ProfileGroupExtractor, ProfileGroups} from '../profile_groups';
import {
    DataElementInformation,
    DataElementInformationForSpreadsheet,
    SpreadsheetColNames
} from '../elements/ProfileElement';
import {ProfileElementFactory} from '../elements/Factory';
import {
    DataDictionaryMode,
    DataDictionarySettings,
    loadSettingsFromYaml
} from '../DataDictionarySettings';
import {loadFromPath} from '../util/loadFromPath';
import {
    autosizeColumns,
    getVersion,
    markdownToExcel,
    resizeLongColumns,
    setForColumn,
    setProfileElementsView,
    setTableView
} from '../util/util';
import {Differ} from '../data-dictionary-diff/Differ';
import {ValueSet, ValueSetRow} from './ValueSet';
import toTitleCase from 'titlecase';
import {
    DataDictionaryJson,
    DataDictionaryJsonSummaryRow
} from './DataDictionaryJson';
import {Configuration} from 'fsh-sushi/dist/fshtypes';

interface IGSummaryConstructor {
    igDir: string;
    outputDir: string;
    logLevel?: string;
    comparisonPath?: string;
    mode?: string;
    settingsPath?: string;
}

/**
 * Defines the `ig-summary create` command.
 */
export class IgSummary {
    private igDir: string;
    private outputDir: string;
    private comparisonPath: string;
    private mode: DataDictionaryMode;
    private settingsPath: string;
    private profileGroups: ProfileGroups;

    private _settings: DataDictionarySettings;
    private _sushiConfig: Configuration;
    private _fhirDefFolder: string;
    private _hasSushiConfig: boolean;
    private _defs: fhirdefs.FHIRDefinitions;
    externalDefs: fhirdefs.FHIRDefinitions;

    /**
     *
     * @param igDir Input folder path
     * @param outputDir Output folder path
     * @param logLevel Log level
     * @param comparisonPath Path to .json file from previous run to automatically compare output of current run with
     * @param mode `ms` or `all` for "only MustSupport elements" or "all elements"
     * @param settingsPath Path to settings YAML file
     */
    constructor({igDir, outputDir, logLevel, comparisonPath, mode, settingsPath}: IGSummaryConstructor) {
        logger.info(`Starting ${getVersion()}`);

        this.comparisonPath = comparisonPath;
        this.settingsPath = settingsPath;

        // Make sure ig directory exists
        if (!fs.existsSync(igDir)) {
            logger.error(`Output directory '${igDir}' does not exist.`);
            process.exit();
        }
        this.igDir = igDir;

        // Make sure output directory exists
        if (!fs.existsSync(outputDir)) {
            logger.error(`Output directory '${outputDir}' does not exist.`);
            process.exit();
        }
        this.outputDir = outputDir;

        if (logLevel === 'debug' || logLevel === 'warn' || logLevel === 'error') {
            logger.level = logLevel; // ig-data-dictionary logger
            fshutils.logger.level = logLevel; // SUSHI logger
        }

        // Get data dictionary mode from command line arguments
        if (mode && mode.toLowerCase() == 'ms') {
            this.mode = DataDictionaryMode.MustSupport;
            logger.info('Running in MustSupport only mode.');
        } else if (mode && mode.toLowerCase() == 'all') {
            this.mode = DataDictionaryMode.All;
            logger.info('Running in ALL mode.');
        } else {
            // Default behavior
            this.mode = DataDictionaryMode.MustSupport;
            logger.info('Running in MustSupport only mode.');
        }
    }

    get settings(): DataDictionarySettings {
        if (this._settings !== undefined) return this._settings;

        let settings: DataDictionarySettings;
        if (this.settingsPath) {
            if (!fs.existsSync(this.settingsPath)) {
                logger.error(
                    `--settings '${this.settingsPath}' was specified, but this file does not exist.`
                );
                process.exit();
            }
            settings = loadSettingsFromYaml(this.settingsPath);
            settings.mode = this.mode;
        } else {
            settings = {
                mode: this.mode,
                filename: 'ig-summary-' + this.sushiConfig.id
            };
        }

        this._settings = settings;
        return settings;
    }

    /**
     * Is there a `sushi-config.yaml` file in the root of the input folder?
     */
    get hasSushiConfig(): boolean {
        if (this._hasSushiConfig !== undefined) return this._hasSushiConfig;

        this._hasSushiConfig = fs.existsSync(path.join(fs.realpathSync(this.igDir), 'sushi-config.yaml'));
        return this._hasSushiConfig;
    }

    get fhirDefFolder(): string {
        if (this._fhirDefFolder !== undefined) return this._fhirDefFolder;
        // If there is a `sushi-config.yaml` file in the `igDir` folder, then assume this is a development clone
        // of the IG (vs. just downloading `package.tgz`).
        //
        // By default, assume that the `igDir` folder has all the FHIR def JSON in it
        let fhirDefFolder = this.igDir;
        // But if there's a sushi-config.yaml file in `igDir`, then the FHIR defs are likely going to be in `output/` instead
        if (this.hasSushiConfig) {
            fhirDefFolder = path.join(fs.realpathSync(this.igDir), 'output/');

            // Make sure this folder really exists
            if (!fs.existsSync(fhirDefFolder)) {
                logger.error(`${this.igDir}/sushi-config.yaml file found, but ${fhirDefFolder} does not exist. You may need to re-run the FHIR IG Publisher. You can also avoid this error by setting the --input option to the folder that contains ImplementationGuide-some-id.json.`);
                process.exit();
            }
        }

        if (!fs.existsSync(fhirDefFolder)) {
            logger.error(
                `The folder you specififed in --input (${fhirDefFolder}') does not exist.`
            );
            process.exit();
        }

        this._fhirDefFolder = fhirDefFolder;
        return fhirDefFolder;
    }

    get sushiConfig(): Configuration {
        if (this._sushiConfig !== undefined) return this._sushiConfig;

        let sushiConfig: Configuration;
        if (this.hasSushiConfig) {
            logger.info('Has SUSHI configuration file');
            sushiConfig = fshutils.readConfig(this.igDir);
        }
            // If there is no sushi config, construct a Configuration object manually with the required info from the ImplementationGuide
        // instance and package.json.
        else {
            logger.info('No SUSHI configuration file found; grabbing from package.json and the IG instance');
            const packagePath = path.join(this.fhirDefFolder, 'package.json');
            if (!fs.existsSync(packagePath)) {
                logger.error(`${packagePath} as not found. To resolve this error, make sure this file exists, or alternatively point --input to a folder with a sushi-config.yaml file and IG publisher output in output/.`);
                process.exit();
            }
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            // Verify expected keys are there
            const expected = ['canonical', 'fhirVersions', 'name'];
            if (!expected.map((m) => packageJson[m] !== undefined).every((x) => x === true)) {
                logger.error(`package.json must contain ${expected.join(', ')}`);
                process.exit();
            }

            // SUSHI has multiple copies of the same instance to index by id/canonical/name.
            // We want to de-duplicate and check to make sure there is only one instance of IG -- if there is more than
            // one, we won't know which to choose.
            if (_.uniqBy(this.defs.allImplementationGuides(), 'id').length > 1) {
                logger.error(`Multiple ImplementationGuide instances found in ${this.fhirDefFolder}. If this is not accidental, please log a bug with your specific use case so we can investigate.`);
                process.exit();
            }
            const ig = this.defs.allImplementationGuides()[0];

            // Construct Configuration contents from package.json + the IG instance
            sushiConfig = {
                canonical: packageJson['canonical'],
                fhirVersion: packageJson['fhirVersions'],
                dependencies: ig['dependsOn'],
                id: packageJson['name']
            };
        }

        // Load mapping of groups in SUSHI to resource IDs
        if (sushiConfig.groups) {
            this.profileGroups = ProfileGroupExtractor.getGroups(sushiConfig);
        }

        this._sushiConfig = sushiConfig;
        return sushiConfig;
    }

    get defs() {
        if (this._defs !== undefined) return this._defs;
        const defs = new fhirdefs.FHIRDefinitions();

        loadFromPath(this.fhirDefFolder, defs);

        if (defs.allImplementationGuides().length === 0) {
            logger.error(`An instance of ImplementationGuide could not be found in '${this.fhirDefFolder}'.`);
            process.exit();
        }

        this._defs = defs;
        return defs;
    }

    public async getExternalDefs() {
        // Load external dependencies
        // MasterFisher could potentially help with this, but it wants a tank and fhirDefs. Won't take two fireDefs as arguments.
        this.externalDefs = new fhirdefs.FHIRDefinitions();
        await fshutils.loadExternalDependencies(this.externalDefs, this.sushiConfig);
    }

    public async generateSpreadsheet() {
        // Get external dependencies
        await this.getExternalDefs();
        
        // Store data for CSV here
        let profileElements: Array<DataElementInformationForSpreadsheet> = [];

        // Iterate through StructureDefinitions
        // Note that SUSHI creates duplicate objects for each Profile because it wants to index by URL, ID, and name.
        // `_.uniqBy()` cleans this up.
        if (this.defs.allProfiles().length == 0) {
            logger.error(`No profiles found in ${this.fhirDefFolder}.`);
            return;
        }

        let usedByMeasureMap = new Map<string, string>();
        let assoWithVSMap = new Map<string, string>();
        for (const sd of _.uniqBy(this.defs.allProfiles(), 'id')) {
            const snapshot = sd.snapshot;
            const profileTitle = sd.title || sd.name;
            // usedByMeasureMap and assoWithVSMap are temporary. Eventually extension flag can be included in DataElementInformation
            for (const elemJson of snapshot.element.slice(1)) {
                let extension_flg:boolean = false;
                elemJson.extension?.forEach((ext: any) => {
                    if (ext.url.includes('/StructureDefinition/used-by-measure')) extension_flg = true;
                })
                if (extension_flg) usedByMeasureMap.set(profileTitle+elemJson.id, 'true');
            }
        }
        
        for (const sd of _.uniqBy(this.defs.allProfiles(), 'id')) {
            const snapshot = sd.snapshot;
    
            // Skip abstract profiles
            if (sd.abstract === true) {
                continue;
            }

            // `title` is not a required element, but it is usually what we want in the human-readable output.
            // If it doesn't exist, fall back to `name`.
            const profileTitle = sd.title || sd.name;

            // The `slice(1)` skips the first item in the array, which is information about the StructureDefinition
            // that isn't needed.
            for (const elemJson of snapshot.element.slice(1)) {
                if (this.settings.excludeElement?.includes(elemJson.id)) {
                    logger.warn(`${elemJson.id} wasn't included in the output summary report`);
                    continue;
                }

                if (
                    this.settings.mode == DataDictionaryMode.MustSupport &&
                    !(
                        // In MS mode, elements must be MS
                        // TODO: Consider minimum cardinality mode
                        // elemJson.mustSupport == true || elemJson.min === 1
                        (elemJson.mustSupport == true)
                    )
                ) {
                    continue;
                }
                const profileGroup = this.profileGroups && this.profileGroups[sd.id] ? this.profileGroups[sd.id] : '';
                const metadata: DataElementInformation = {
                    profileTitle: profileTitle,
                    profileGroup: profileGroup || 'Default',
                    baseResourceType: sd.type,
                    sourceProfileURI: sd.url,
                    elementStructureDefinitionURI: sd.url
                };
                const elem = ProfileElementFactory.getElement(
                    elemJson,
                    metadata,
                    [this.defs, this.externalDefs],
                    this.settings
                );
                
                const elemToJson = elem.toJSON();
                // Filter down to unique elements -- there may be duplicates because extension ProfileElement objects
                // automatically add sub-elements.
                const existingElements = profileElements.map(x => {
                    return {
                        profile: x['Source Profile URI'],
                        sd: x['Element StructureDefinition URI'],
                        elem: x['FHIR Element (R4)']
                    };
                });
                const deduplicatedElemToJson = elemToJson.filter(x => {
                    return !_.find(existingElements, {
                        profile: x['Source Profile URI'],
                        sd: x['Element StructureDefinition URI'],
                        elem: x['FHIR Element (R4)']
                    });
                });

                if (deduplicatedElemToJson) profileElements = profileElements.concat(deduplicatedElemToJson);
            }

        }

        profileElements.forEach(pe => {
            pe[SpreadsheetColNames.UsedByMeasure] = usedByMeasureMap.get(pe[SpreadsheetColNames.ProfileTitle]+pe[SpreadsheetColNames.FHIRElement]);
        //   pe[SpreadsheetColNames.AssociatedWithValueSet] = assoWithVSMap.get(pe[SpreadsheetColNames.ProfileTitle]+pe[SpreadsheetColNames.FHIRElement]);
        });

        // Get list of profiles, extensions, and value sets
        const allExtensions: DataDictionaryJsonSummaryRow[] = _.uniqBy(this.defs.allExtensions(), x => {
            return x.url;
        }).map(x => {
            return {
                title: x.title,
                url: x.url,
                description: x.description
            };
        });
        const allProfiles: DataDictionaryJsonSummaryRow[] = _.sortBy(
            _.uniqBy(this.defs.allProfiles(), x => {
                return x.url;
            }).map(x => {
                return {
                    group: this.profileGroups && this.profileGroups[x.id] ? this.profileGroups[x.id] : 'Default',
                    // `title` is not required but is probably preferable for human readability
                    // `name` is a fallback if `title` is not available
                    title: x.title || x.name,
                    url: x.url,
                    description: x.description
                };
            }),
            ['group', 'title']
        );
        const allValueSets: DataDictionaryJsonSummaryRow[] = _.uniqBy(this.defs.allValueSets(), x => {
            return x.url;
        }).map(x => {
            return {
                title: x.title,
                url: x.url,
                description: x.description
            };
        });
        const allCodeSystems: DataDictionaryJsonSummaryRow[] = _.uniqBy(this.defs.allCodeSystems(), x => {
            return x.url;
        }).map(x => {
            return {
                title: x.title,
                url: x.url,
                description: x.description
            };
        });

        // Get all value set elements in a format that can be displayed by ExcelJS
        const valueSets: { [key: string]: ValueSet } = this.defs.allValueSets().reduce((map, valueSet) => {
            const vs = new ValueSet(valueSet, this.settings);
            map[vs.def.url] = vs;
            return map;
        }, {});
        const valueSetElements: ValueSetRow[] = _.flatten(
            Object.values(valueSets).map(valueSet => {
                return valueSet.toJSON(valueSets);
            })
        );

        const jsonOutput: DataDictionaryJson = {
            profiles: allProfiles,
            profileElements: profileElements,
            valueSets: allValueSets,
            valueSetElements: valueSetElements,
            extensions: allExtensions,
            codeSystems: allCodeSystems,
            metadata: {
                title: this.sushiConfig.title,
                version: this.sushiConfig.version
            }
        };

        const dataDictionaryPath = path.join(fs.realpathSync(this.outputDir), this.settings.filename + '.json');
        fs.writeFileSync(dataDictionaryPath, JSON.stringify(jsonOutput, null, 2));
        logger.info(`Data dictionary JSON written to ${dataDictionaryPath}`);

        // Write to Excel workbook
        const workbook = new ExcelJS.Workbook();

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const indexWorksheet = workbook.addWorksheet('IG information');
        indexWorksheet.addRow([]);
        indexWorksheet.addRow(['', this.settings.title || 'IG Summary']);
        indexWorksheet.addRow([]);
        indexWorksheet.getRow(indexWorksheet.rowCount).font = {
            name: 'Helvetica',
            bold: true,
            size: 16
        };
        [
            ['', 'IG name', this.sushiConfig.name],
            ['', 'IG URL', this.sushiConfig.url],
            ['', 'IG version', this.sushiConfig.version],
            ['', 'IG status', this.sushiConfig.status],
            ['', 'Base FHIR version', this.sushiConfig.fhirVersion.join(', ')],
            [''],
            ['', '# Profiles', allProfiles.length],
            ['', '# Extensions', allExtensions.length],
            ['', '# Value Sets', allValueSets.length],
            ['', '# Code Systems', allCodeSystems.length],
            [''],
            ['', 'Data dictionary generated date', new Date().toLocaleString('en-US')]
        ].forEach(line => {
            indexWorksheet.addRow(line);
        });

        const titleRows = [];
        if (this.settings.informationTabContent) {
            // eslint gets upset because `a` needs to be mutable but `b` does not:
            // eslint-disable-next-line prefer-const
            for (let [a, b] of Object.entries(this.settings.informationTabContent)) {
                let heading = false;
                if (a.startsWith('EMPTY-')) {
                    a = '';
                } else if (a.match(/^[A-Z ]*$/)) {
                    a = toTitleCase(a.toLowerCase());
                    heading = true;
                }
                const row = indexWorksheet.addRow(['', a, markdownToExcel(b)]);
                if (heading) {
                    titleRows.push(row);
                }
            }
        }

        indexWorksheet.getRows(1, 1000).forEach(x => {
            x.font = {name: 'Helvetica'};
            x.fill = {
                fgColor: {argb: 'FFFFFFFF'},
                pattern: 'solid',
                type: 'pattern'
            };
        });
        indexWorksheet.getColumn(2).font = {name: 'Helvetica', bold: true};
        indexWorksheet.getRow(2).font = {name: 'Helvetica', bold: true, size: 16};
        autosizeColumns(indexWorksheet);
        setForColumn(indexWorksheet, 3, 100);
        indexWorksheet.views = [
            {
                topLeftCell: 'A2',
                activeCell: 'A2',
                zoomScale: 130
            }
        ];

        for (const row of titleRows) {
            row.font = {name: 'Helvetica', bold: true, size: 14};
            row.getCell(3).merge(row.getCell(2));
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const profilesWorksheet = workbook.addWorksheet('Profiles');
        // Add table
        profilesWorksheet.addTable({
            name: 'profiles',
            ref: 'A1',
            headerRow: true,
            totalsRow: false,
            style: {
                theme: 'TableStyleMedium2',
                showRowStripes: true
            },
            columns: Object.keys(allProfiles[0]).map(k => {
                return {name: changeCase.capitalCase(k), key: k, filterButton: true};
            }),
            rows: allProfiles.map(k => {
                return Object.values(k);
            })
        });
        autosizeColumns(profilesWorksheet);
        setForColumn(profilesWorksheet, 4, 100);
        setTableView(profilesWorksheet);

        // Hide group column if it's all default
        let hiddenCol = profilesWorksheet.getColumn(1);
        if (
            hiddenCol.values.filter(x => {
                return x != 'Default' && x != 'Group';
            }).length == 0
        ) {
            hiddenCol.hidden = true;
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const profileElementsWorksheet = workbook.addWorksheet('Data elements');
        // Add table
        profileElementsWorksheet.addTable({
            name: 'profile_data_elements',
            ref: 'A1',
            headerRow: true,
            totalsRow: false,
            style: {
                theme: 'TableStyleMedium2',
                showRowStripes: true
            },
            columns: Object.keys(profileElements[0]).map(k => {
                return {name: k, key: k, filterButton: true};
            }),
            rows: profileElements.map(k => {
                return Object.values(k);
            })
        });
        setProfileElementsView(profileElementsWorksheet);
        autosizeColumns(profileElementsWorksheet);
        profileElementsWorksheet.getColumn(1).width = 20;
        profileElementsWorksheet.getColumn(2).width = 20;
        profileElementsWorksheet.getColumn(3).width = 20;
        resizeLongColumns(profileElementsWorksheet, 'profile_data_elements');

        // Hide profile URI and structure def URI columns
        hiddenCol = profileElementsWorksheet.getColumn(11);
        hiddenCol.hidden = true;
        hiddenCol = profileElementsWorksheet.getColumn(12);
        hiddenCol.hidden = true;

        // Hide group column if it's all default
        hiddenCol = profileElementsWorksheet.getColumn(1);
        if (
            hiddenCol.values.filter(x => {
                return x != 'Default' && x != 'Group';
            }).length == 0
        ) {
            hiddenCol.hidden = true;
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        if (allValueSets.length > 0) {
            const valueSetsWorksheet = workbook.addWorksheet('Value sets');

            valueSetsWorksheet.addTable({
                name: 'value_sets',
                ref: 'A1',
                headerRow: true,
                totalsRow: false,
                style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true
                },
                columns: Object.keys(allValueSets[0]).map(k => {
                    return {name: changeCase.capitalCase(k), filterButton: true};
                }),
                rows: allValueSets.map(k => {
                    return Object.values(k);
                })
            });
            autosizeColumns(valueSetsWorksheet);
            setForColumn(valueSetsWorksheet, 3, 100);
            setTableView(valueSetsWorksheet);
        } else {
            logger.warn('No value set found. Skipped creating tab for value set');
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        if (allValueSets.length > 0) {
            const valueSetCodesWorkbook = workbook.addWorksheet('Value set codes');

            // Simple way to get names of headers for table since some are optional
            // There's no good way I can find to get the key names directly from ValueSetRow
            const valueSetCodesHeaders = Object.keys({
                'Value set name': '',
                'Code system': '',
                'Logical definition': '',
                Code: '',
                'Code description': ''
            } as ValueSetRow);

            const valueSetRows: Array<Array<any>> = [];
            const valueSetSectionStarts: number[] = [];
            for (const row of valueSetElements) {
                const valueSetName = row['Value set name'];
                if (
                    valueSetRows.length == 0 ||
                    valueSetRows[valueSetRows.length - 1][0] != valueSetName
                ) {
                    valueSetRows.push([valueSetName]);
                    valueSetSectionStarts.push(valueSetRows.length + 1);
                }
                const rowValues = [];
                for (const n of valueSetCodesHeaders) {
                    rowValues.push(row[n] || '');
                }
                valueSetRows.push(rowValues);
            }

            // Necessary to make Excel folding work -- otherwise, the last VS is hidden and can't be unhidden
            valueSetRows.push([]);
            valueSetSectionStarts.push(valueSetRows.length + 1);

            // Add table
            valueSetCodesWorkbook.addTable({
                name: 'value_set_codes',
                ref: 'A1',
                headerRow: true,
                totalsRow: false,
                style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true
                },
                columns: valueSetCodesHeaders.map(k => {
                    return {name: changeCase.capitalCase(k), key: k, filterButton: true};
                }),
                rows: valueSetRows
            });
            autosizeColumns(valueSetCodesWorkbook);
            setForColumn(
                valueSetCodesWorkbook,
                valueSetCodesHeaders.indexOf('Logical definition') + 1,
                50
            );
            setForColumn(
                valueSetCodesWorkbook,
                valueSetCodesHeaders.indexOf('Code description') + 1,
                100
            );
            setTableView(valueSetCodesWorkbook);

            // Expand/collapse
            for (let i = 0; i < valueSetSectionStarts.length; i++) {
                let row = valueSetCodesWorkbook.getRow(valueSetSectionStarts[i]);
                row.font = {name: 'Helvetica', bold: true};
                row.outlineLevel = 1;

                let nextSectionStart: number;
                if (i + 1 == valueSetSectionStarts.length) {
                    nextSectionStart = valueSetRows.length + 1;
                } else {
                    nextSectionStart = valueSetSectionStarts[i + 1];
                }
                for (let j = valueSetSectionStarts[i] + 1; j < nextSectionStart; j++) {
                    row = valueSetCodesWorkbook.getRow(j);
                    row.outlineLevel = 2;
                    row.hidden = false;
                }
            }
        } else {
            logger.warn('No value set code found. Skipped creating tab for value set code');
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        // Add table
        if (allExtensions.length > 0) {
            const extensionsWorksheet = workbook.addWorksheet('Extensions');
            extensionsWorksheet.addTable({
                name: 'extensions',
                ref: 'A1',
                headerRow: true,
                totalsRow: false,
                style: {
                    theme: 'TableStyleMedium2',
                    showRowStripes: true
                },
                columns: Object.keys(allExtensions[0]).map(k => {
                    return {name: changeCase.capitalCase(k), filterButton: true};
                }),
                rows: allExtensions.map(k => {
                    return Object.values(k);
                })
            });
            autosizeColumns(extensionsWorksheet);
            setForColumn(extensionsWorksheet, 3, 100);
            setTableView(extensionsWorksheet);
        } else {
            logger.warn('No Extension found. Skipped creating tab for extension');
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const filenameRoot = this.settings.filename || 'data_dictionary';
        const excelPath = path.join(fs.realpathSync(this.outputDir), filenameRoot + '.xlsx');
        fs.writeFileSync(excelPath, JSON.stringify(profileElements));
        workbook.xlsx.writeFile(excelPath);
        logger.info(`Excel file written to ${excelPath}`);

        if (this.comparisonPath) {
            const left = Differ.loadDataDictionaryJson(this.comparisonPath);
            const right = Differ.loadDataDictionaryJson(
                path.join(fs.realpathSync(this.outputDir), filenameRoot + '.json')
            );
            const differ = new Differ(left, right, {});
            differ.logDetails();
            differ.logSummary();
        }
    }
}
