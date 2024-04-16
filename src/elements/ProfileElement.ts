import toTitleCase from 'titlecase';
import { fhirdefs, fhirtypes, fshtypes, utils as fshutils } from 'fsh-sushi';
import { logger } from '../util/logger';
import { DataDictionaryMode, DataDictionarySettings } from '../DataDictionarySettings';
import {StructureDefinition} from 'fsh-sushi/dist/fhirtypes';

export type ValueSetData = { uri: string; binding: string };

export type DataElementInformation = {
    baseResourceType: string;
    profileGroup: string;
    profileTitle: string;
    sourceProfileURI: string;
    elementStructureDefinitionURI: string;
    subElementOf?: fhirtypes.ElementDefinition;
};

/**
 * Define the column names for the data elements sheet in the spreadsheet output
 */
export enum SpreadsheetColNames {
    Group = 'Group',
    ProfileTitle = 'Profile Title',
    DataElementName = 'Data Element Name',
    Definition = 'Definition',
    Required = 'Required?',
    OccurrencesAllowed = 'Occurrences Allowed',
    DataType = 'Data Type',
    ValueSetURI = 'Value Set URI',
    ValueSetBinding = 'Value Set Binding',
    FHIRElement = 'FHIR Element (R4)',
    SourceProfileURI = 'Source Profile URI',
    ElementStructureDefinitionURI = 'Element StructureDefinition URI',
    Extension = 'Extension?'
}

// Non-optional version of DataElementInformation, with proper row names
export type DataElementInformationForSpreadsheet = {
    [SpreadsheetColNames.Group]: string;
    [SpreadsheetColNames.ProfileTitle]: string;
    [SpreadsheetColNames.DataElementName]: string;
    [SpreadsheetColNames.Definition]: string;
    [SpreadsheetColNames.Required]: string;
    [SpreadsheetColNames.OccurrencesAllowed]: string;
    [SpreadsheetColNames.DataType]: string;
    [SpreadsheetColNames.ValueSetURI]: string;
    [SpreadsheetColNames.ValueSetBinding]: string;
    [SpreadsheetColNames.FHIRElement]: string;
    [SpreadsheetColNames.SourceProfileURI]: string;
    [SpreadsheetColNames.ElementStructureDefinitionURI]: string;
    [SpreadsheetColNames.Extension]: string;
    [key: string]: string; // Adds an index signature to the type
};

// This class is used to represent a single data element defined by a FHIR Profile.
export class ProfileElement {
    public elem: fhirtypes.ElementDefinition;
    public dataElementInformation: DataElementInformation;
    protected defs: fhirdefs.FHIRDefinitions;
    protected externalDependencyDefs: fhirdefs.FHIRDefinitions;
    // eslint-disable-next-line no-use-before-define
    public subElements: Array<ProfileElement>;
    public dataDictionarySettings: DataDictionarySettings;

    // Properties used in the Excel row
    public group: string;
    public definition: string;
    public fhirPath: string;
    public profileTitle: string;

    private _elemName: string;
    protected _valueSet: ValueSetData;

    // TODO this should not be `fhirtypes.Extension` -- this is the wrong type (even though it works)
    protected _structureDefinition: fhirtypes.Extension;
    public usedByMeasure: string;

    constructor(
        elem: fhirtypes.ElementDefinition,
        metadata: DataElementInformation,
        defs: fhirdefs.FHIRDefinitions[],
        settings: DataDictionarySettings
    ) {
        logger.debug(`Processing ${elem.id}`);

        // Assign instance variables
        this.elem = elem;
        this.dataElementInformation = metadata;
        this.defs = defs[0];
        this.externalDependencyDefs = defs[1];
        this.dataDictionarySettings = settings;
        this.subElements = [];

        // Populate row values that can be set directly from the FHIR definition
        this.group = this.dataElementInformation.profileGroup;
        this.definition = this.elem.definition;
        this.fhirPath = this.elem.id;
        this.profileTitle = this.dataElementInformation.profileTitle;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public static canBeCreatedFrom(elementDefinition: fhirtypes.ElementDefinition): boolean {
        return true;
    }

    /**
     * Gets a human-friendly element name from the FHIR element definition
     *
     * @returns the name as a string
     */
    get elemName(): string {
        if (this._elemName) {
            return this._elemName;
        }

        let name = this.elem.path
            // TODO verify we really need to drop `profileTitle` from the element path, and explain what cases this comes up in with a better comment.
            // TODO it's possible that this could be replaced with a regex: `this.elem.path.replace(/[^.]+\./, '')`
            .replace(`${this.dataElementInformation.profileTitle}.`, '') // Remove profile name from path
            .replace(`${this.dataElementInformation.baseResourceType}.`, ''); // Remove base resource from path

        // For slices, display as "Element Name > Slice Name", unless Element Name is an extension
        if (this.elem.sliceName) {
            if (name == 'extension') name = this.elem.sliceName;
            else if (this.isCollapsableValueXSlice) name = name;
            // No-op
            else name += ` > ${this.elem.sliceName}`;

            // Strip "Extension" out of element names?
            // TODO explain why we want to strip "Extension" out of element names
            if (this.elem.path.endsWith('extension')) name = name.replace('.extension', '');
        } else {
            // Sub-elements on a slice don't have `this.elem.sliceName` set, so infer they are slices from the path
            // TODO this needs to be better explained.
            // `this.elem.path` does not include (all?) slice info
            // `this.elem.id` includes **all** the slice info: `Foo.bar:slice1.baz:slice2`
            // A better approach may be to split `id` by `.`, then search the array items for `:` to identify slices
            const lastPathItem = this.elem.path.replace(/.*\.([a-zA-Z]+(\[x\])?)/, '$1');
            const pattern = new RegExp(`:([a-zA-Z]+)\.${lastPathItem.replace('[x]', '\\[x\\]')}`);
            const sliceName = this.elem.id.match(pattern);
            if (sliceName) {
                name = name.replace(lastPathItem, `${sliceName[1]}.${lastPathItem}`);
            }
        }

        this._elemName = this.humanizeElemName(name);
        return this._elemName;
    }

    set elemName(n: string) {
        this._elemName = n;
    }

    public humanizeElemName(name: string): string {
        let humanizedName = toTitleCase(
            name
                .replace(/\./g, ' > ') // Convert . separators to >
                .replace('[x]', '') // Remove polymorphism indicator
                .replace(/([a-z])([A-Z])/g, '$1 $2')
        );

        // Touch ups defined in settings
        if (this.dataDictionarySettings.touchUpHumanizedElementNames) {
            for (const [toFind, toReplace] of Object.entries(
                this.dataDictionarySettings.touchUpHumanizedElementNames
            )) {
                humanizedName = humanizedName.replace(toFind, toReplace);
            }
        }

        return humanizedName;
    }

    /**
     * Gets a human-friendly element type from the FHIR definition
     *
     * @returns string
     */
    get elemType(): string {
        // Some elements, like searchParams, don't have types
        if (!this.elem.type) {
            return 'n/a';
        }
        // Get string representation of each type
        const typeStrings = this.elem.type.map(t => {
            // If `Reference` is one of the options for a polymorphic type, get the names of the profiles/resource
            // types that can be referenced
            // TODO also support `canonical` and `CodeableReference`
            if (t['code'] == 'Reference') {
                return this.generateReferenceTypeString(t);
            }

            // TODO consider detecting associated profiles
            return t['code'];
        });

        if (typeStrings.length == 1) {
            return typeStrings[0];
        } else if (
            // The FHIR IG calls an element with these value types "Any", so do the same here
            [
                'Quantity',
                'CodeableConcept',
                'string',
                'boolean',
                'integer',
                'Range',
                'Ratio',
                'SampledData',
                'time',
                'dateTime',
                'Period'
            ].filter(x => {
                // TODO this is sub-optimal because it may behave unexpectedly if new types are introduced
                return !typeStrings.includes(x);
            }).length === 0
        ) {
            // TODO needs better documentation for why these are considered `Any` vs. just using the type name
            // or maybe this is not the right approach
            return 'Any';
        } else if (typeStrings.length > 1) {
            return ProfileElement.joinArrayWithOr(typeStrings);
        }
        return 'Polymorphic with no defined types';
    }

    get required(): string {
        // Detect nested element
        let conditional = '';
        if (this.elem.path.match(/[A-Za-z]+\.[A-Za-z\.]+\.[A-Za-z]+/)) {
            const parent = this.elem.path.replace(/[A-Za-z]+\.([A-Za-z\.]+)\.[A-Za-z]+/, '$1');
            conditional = ` (conditional on ${this.humanizeElemName(parent)})`;
        }
        if (this.elem.min == 1) {
            return `Required${conditional}`;
        } else if (this.elem.mustSupport === true && this.elem.min == 0) {
            return `Required if known${conditional}`;
        } else {
            return '';
        }
    }

    get occurrences(): string {
        if (this.elem.max == '1') {
            return 'Single';
        } else if (this.elem.min === 0 && this.elem.max == '0') {
            return 'None';
        } else if (this.elem.max == '*') {
            return 'Multiple';
        } else if (this.elem.max != '0') {
            return this.elem.max;
        }
    }

    get valueSet(): ValueSetData {
        if (this._valueSet) return this._valueSet;

        // If this is `value[x]` and there is a slice binding the value set, get that.
        // This is the result of FSH like:
        //   * value[x] only CodeableConcept
        //   * valueCodeableConcept from ConditionStatusTrendVS (required)
        //
        // Rather than `value[x] from ConditionStatusTrendVS (required)`
        if (this.elem.path.endsWith('value[x]') && !this.elem.binding) {
            // Since no binding is set on this element, look for a slice that does have a binding set
            const slices = this.findSiblingsWithStart(this.elem.id).filter(x => {
                return x.binding;
            });
            // Assume there is just one value set binding on the slices
            if (slices.length > 0) {
                this._valueSet = {
                    uri: slices[0].binding.valueSet,
                    binding: slices[0].binding.strength
                };
                return this._valueSet;
            }
        }

        // If there is a binding, and the element has a type of CodeableConcept or code, then set the valueSet accordingly
        if (
            this.elem.binding?.valueSet &&
            this.elem.type
                .map(t => {
                    return t.code;
                })
                .filter(t => {
                    // TODO account for the fact that fechnically, FHIR also allows for string to be bound to a VS. We see this
                    // most often with address.state.
                    // TODO In R4B / R5 also account for CodeableReference
                    return ['codeableconcept', 'code', 'coding'].includes(t.toLowerCase());
                }).length > 0
        ) {
            this._valueSet = {
                uri: this.elem.binding.valueSet,
                binding: this.elem.binding.strength
            };
            return this._valueSet;
        }

        this._valueSet = { uri: '', binding: '' };
        return this._valueSet;
    }

    // TODO Extension is the wrong type; fix this
    get structureDefinition(): fhirtypes.Extension {
        if (this._structureDefinition) return this._structureDefinition;
        this._structureDefinition = this.fishEverywhere(this.dataElementInformation.sourceProfileURI);
        if (this._structureDefinition === undefined) {
            throw `Could not find extension definition for ${this.dataElementInformation.sourceProfileURI} in ${this.dataElementInformation.profileTitle}`;
        }
        return this._structureDefinition;
    }

    /**
     * Determines if element is a slice on value[x] that can be collapsed down to specifying the type on value[x]
     *
     * This is to handle a pattern used in mCODE STU1 where there is an extraneous slice on `value[x]` that
     * is functionally equivalent to not setting the slice. For the purposes of avoiding leaking this
     * implementation detail to the user, we will detect and mitigate.
     *
     */
    get isCollapsableValueXSlice(): boolean {
        if (!this.elem.path.endsWith('value[x]')) return false;
        if (!this.elem.sliceName) return false;

        // Is this the only slice on value[x]?
        const idWithoutSliceName = this.elem.id.replace(
            // For example, converts `Observation.value[x]:valueCodeableConcept` to `Observation.value[x]`
            new RegExp(`(.*):${this.elem.sliceName}$`),
            '$1'
        );
        if (this.findSiblingsWithStart(idWithoutSliceName + ':').length != 1){
            return false;
        }

        return true;
    }

    fishEverywhereForProfiles(target: string): fshtypes.Profile | undefined {
        let found = this.defs.fishForFHIR(target, fshutils.Type.Profile);
        if (!found) {
            // Don't limit to `Profile` type to allow for base FHIR types
            found = this.externalDependencyDefs.fishForFHIR(target);
        }
        return found;
    }

    fishEverywhere(target: string): fhirtypes.Extension | undefined {
        let found = this.defs.fishForFHIR(target);
        if (found === undefined) {
            found = this.externalDependencyDefs.fishForFHIR(target);
        }
        return found;
    }

    /**
     * Generates a reference type string that includes the possible reference types, e.g., `Reference: Patient, or Organization`
     *
     * @param referenceType
     *
     * @returns string of reference with types
     */
    generateReferenceTypeString(referenceType: fhirtypes.ElementDefinitionType): string {
        const code = referenceType.code;
        if (code != 'Reference') {
            throw `Code = ${code}, not Reference`;
        }

        if (!referenceType.targetProfile) {
            return 'Reference: Any';
        }

        const names = referenceType.targetProfile.map(t => {
            const sd = this.fishEverywhereForProfiles(t);
            return sd.name || 'Unknown';
        });

        return `Reference: ${ProfileElement.joinArrayWithOr(names)}`;
    }

    /**
     * Utility function to display an array like "a, b, or c".
     *
     *   `[1, 2]` --> `1 or 2`
     *   `[1, 2, 3]` --> `1, 2, or 3`
     *
     * Yes, Oxford commas are the **only** way to go.
     *
     * @param list - Array of objects to stringify and or-ify
     *
     * @returns comma/or-separated string
     */
    static joinArrayWithOr(list: Array<any>): string {
        if (list.length < 3) {
            return list.join(' or ');
        } else {
            return list.join(', ').replace(/(.*), (.*)/, '$1, or $2');
        }
    }

    /**
     * Creates a version of the element object that's appropriate for converting into JSON or can be directly input
     * into ExcelJS.
     *
     * @returns An array of DataDictionaryJson objects, each of which is a row in the Excel file.
     */
    toJSON(): Array<DataElementInformationForSpreadsheet> {
        // Check if row should be suppressed
        //
        // Fixed codes
        let required = this.required;
        if (this.elem.patternCodeableConcept?.coding) {
            const coding = this.elem.patternCodeableConcept?.coding;
            if (
                Array.isArray(coding) &&
                coding.length == 1 &&
                'system' in coding[0] &&
                'code' in coding[0]
            ) {
                // If suppressFixedCodes setting is on, then suppress
                if(this.dataDictionarySettings.suppressFixedCodes === true) return [];

                // Otherwise, add string onto the `Required` column indicating a fixed value
                required += `${required ? ' ' : ''}[Fixed to ${coding[0].system}#${coding[0].code}]`;
            }
        }

        // Suppress rows in MustSupport mode
        if (this.dataDictionarySettings.mode == DataDictionaryMode.MustSupport) {
            // For slices where all named slices are MS, don't display the sliced element. (All the slices will be displayed instead.)
            if (this.elem.slicing) {
                // Look at Structure Definition to see if slices are MS
                const slices = this.findSiblingsWithStart(this.elem.path + ':');
                if (slices.length > 0 && slices.every(x => x.mustSupport === true)) {
                    return [];
                }
            }
            // Collapse polymorphic elements that are `value[x] only CodeableConcept` and `value[x] 1..1`
            //
            // In this case, rather than displaying separate rows for `value[x]` and `value[x].valueCodeableConcept`,
            // just display one row called `valueCodeableConcept`.
            if (
                this.elem.sliceName &&
                this.elem.type[0].code == 'BackboneElement' &&
                this.valueSet.binding // ProfileBackboneElement.valueSet automatically bubbles up ValueSet from :value[x]
            ) {
                // Check to see if there is a `value[x]` that is MS and has a binding
                const valueX = this.findSiblingsWithStartAndEnd(this.elem.id + '.', 'value[x]');
                if (valueX && valueX[0].binding && valueX[0].mustSupport) {
                    return [];
                }
            }
        }

        // Handle isCollapsableValueXSlice -
        let fhirPath = this.fhirPath;
        if (this.isCollapsableValueXSlice) {
            fhirPath = fhirPath.replace(`:${this.elem.sliceName}`, '');
        }

        let out = [
            {
                [SpreadsheetColNames.Group]: this.group,
                [SpreadsheetColNames.ProfileTitle]: this.profileTitle,
                [SpreadsheetColNames.DataElementName]: this.elemName,
                [SpreadsheetColNames.Definition]: this.definition,
                [SpreadsheetColNames.Required]: required,
                [SpreadsheetColNames.OccurrencesAllowed]: this.occurrences,
                [SpreadsheetColNames.DataType]: this.elemType,
                [SpreadsheetColNames.ValueSetURI]: this.valueSet.uri,
                [SpreadsheetColNames.ValueSetBinding]: this.valueSet.binding,
                [SpreadsheetColNames.FHIRElement]: fhirPath,
                [SpreadsheetColNames.SourceProfileURI]: this.dataElementInformation.sourceProfileURI,
                [SpreadsheetColNames.ElementStructureDefinitionURI]: this.dataElementInformation.elementStructureDefinitionURI,
                [SpreadsheetColNames.Extension]: this.usedByMeasure
            //    [SpreadsheetColNames.AssociatedWithValueSet]: this.associatedWithValueSet
            }
        ];

        for (const e of this.subElements) {
            // Rewrite Profile URI field so that it always contains the URI of the primary profile, rather
            // than the profile for e.g., an extension.
            e.dataElementInformation.sourceProfileURI = this.dataElementInformation.sourceProfileURI;
            out = out.concat(e.toJSON());
        }

        return out;
    }

    // TODO switch to using ElementDefinition - this is a more proven approach that avoids potential sharp edges with the
    // roll your own approach here.
    public findSiblingById(id: string): fhirtypes.ElementDefinition {
        return this.structureDefinition.snapshot.element.filter((x: any) => {
            return x.id == id;
        })[0];
    }

    public findSiblingsWithStartAndEnd(start: string, end: string): fhirtypes.ElementDefinition[] {
        return this.structureDefinition.snapshot.element.filter((x: any) => {
            return x.id.startsWith(start) && x.id.endsWith(end);
        });
    }

    public findSiblingWithStartAndEnd(start: string, end: string): fhirtypes.ElementDefinition {
        const out = this.findSiblingsWithStartAndEnd(start, end);
        if (out.length > 1) {
            throw `Multiple siblings with start ${start} and end ${end}`;
        }
        return out[0];
    }

    public findSiblingsWithStart(start: string): fhirtypes.ElementDefinition[] {
        return this.structureDefinition.snapshot.element.filter((x: any) => {
            return x.id.startsWith(start) && x.id != start;
        });
    }

    /**
     * Finds all sibling slices, including the current element
     *
     * @returns {fhirtypes.ElementDefinition[]} Array of SUSHI ElementDefinitions
     */
    public findAllSiblingSlices(): fhirtypes.ElementDefinition[] {
        // Raise an exception if this is not a slice
        if(this.elem.sliceName == undefined) throw `${this.elem.path} is not a slice`;

        // slicedElement() finds the "parent" of the current slice
        return this.elem.slicedElement().getSlices();
    }
}
