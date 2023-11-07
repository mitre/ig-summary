import { DataElementInformation, ProfileElement, ValueSetData } from './ProfileElement';
import { fhirdefs, fhirtypes } from 'fsh-sushi';
import { ProfileElementFactory } from './Factory';
import { DataDictionaryMode, DataDictionarySettings } from '../DataDictionarySettings';
import { logger } from '../util/logger';

export class ProfileExtensionElement extends ProfileElement {
    protected _valueSet: ValueSetData;
    readonly _elemType: string;

    constructor(
        elem: fhirtypes.ElementDefinition,
        metadata: DataElementInformation,
        defs: fhirdefs.FHIRDefinitions[],
        settings: DataDictionarySettings
    ) {
        super(elem, metadata, defs, settings);

        // Generate metadata used for creating ProfileElement objects for the elements inside the extension
        const metadataForExtensionElement: DataElementInformation = {
            profileTitle: this.dataElementInformation.profileTitle,
            profileGroup: this.dataElementInformation.profileGroup,
            baseResourceType: this.structureDefinition.snapshot.element[0].id,
            sourceProfileURI: this.dataElementInformation.sourceProfileURI,
            elementStructureDefinitionURI:
                this.extensionProfileURI || this.dataElementInformation.sourceProfileURI,
            subElementOf: this.elem
        };

        // Simple extension support
        if (!this.isComplex) {
            this._elemType = 'Extension (simple)';
            // If possible, bubble up extension elements to avoid multiple rows

            // Find a value set if one is defined
            const elementsWithBinding = [this.findSiblingById(`${this.nameRoot}.value[x]`)]
                .concat(
                    this.findSiblingsWithStartAndEnd(this.nameRoot, 'valueCoding'),
                    this.findSiblingsWithStartAndEnd(this.nameRoot, 'valueCode'),
                    this.findSiblingsWithStartAndEnd(this.nameRoot, 'valueCodeableConcept')
                )
                .filter(e => {
                    return e && e.binding;
                });

            // If there is just one value set binding, set the value set info for this element accordingly
            if (elementsWithBinding.length === 1) {
                const eObj = ProfileElementFactory.getElement(
                    elementsWithBinding[0],
                    metadataForExtensionElement,
                    [this.defs, this.externalDependencyDefs],
                    this.dataDictionarySettings
                );
                this._valueSet = {
                    uri: eObj.valueSet.uri,
                    binding: eObj.valueSet.binding
                };
            } else {
                // In mCODE STU1, the value set binding may be on a slice in the profile rather than on the extension.
                // Detect this and apply the value set binding from the slice if possible.

                const profileSnapshot = this.fishEverywhereForProfiles(
                    this.dataElementInformation.sourceProfileURI
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore - `snapshot` isn't part of the Profile type definition for some reason
                ).snapshot.element;

                const relevantElements = profileSnapshot.filter((e: any) => {
                    return e.id.startsWith(this.elem.id + '.value[x]') && e.binding;
                });
                if (relevantElements.length == 1) {
                    this._valueSet = {
                        uri: relevantElements[0].binding.valueSet,
                        binding: relevantElements[0].binding.strength
                    };
                }
            }

            // Look for elements in the extension with types that can be bubbled up.
            const elemTypes = this.findSiblingsWithStart(this.nameRoot)
                .filter(x => {
                    return x.id.match(/value\[x\]:value[A-Z][a-zA-Z0-9]+/);
                })
                .map(x => {
                    return x.type[0].code;
                });
            if (elemTypes.length > 0) {
                this._elemType = ProfileElement.joinArrayWithOr(elemTypes);
            }

            // See if a type is specified on `value[x]`
            else {
                const elemValueX = this.findSiblingById(`${this.nameRoot}.value[x]`);
                if (elemValueX && elemValueX.type?.length > 0) {
                    this._elemType = ProfileElementFactory.getElement(
                        elemValueX,
                        metadataForExtensionElement,
                        [this.defs, this.externalDependencyDefs],
                        this.dataDictionarySettings
                    ).elemType;
                }
            }
        }

        // Complex extension support
        else {
            this._elemType = 'Extension: ' + this.structureDefinition.title;
        }

        // Add any relevant elements in the extension as subelements to this object
        const subElements = this.findSiblingsWithStart(this.nameRoot)
            .filter(x => {
                // If in MS mode, only include MS elements
                if (this.dataDictionarySettings.mode == DataDictionaryMode.MustSupport) {
                    return x.mustSupport === true;
                }
                // When running in "All" mode including extension elements is appears to be redundant
                // with the elements from the source profile -- and is problematic when a slice in the source
                // profile defines the value set for the extension. In this case, the extension elements do
                // not have the value set information. So let's try the more conservative approach of only
                // returning required extension elements.
                return x.min > 0;
                // This is the old behavior that returns *everything* in the Extension:
                // Otherwise include all elements not set to 0..0
                // return x.max != '0';
            })
            .map(x => {
                const e = ProfileElementFactory.getElement(
                    x,
                    metadataForExtensionElement,
                    [this.defs, this.externalDependencyDefs],
                    this.dataDictionarySettings
                );

                // If the subelement name isn't already prefixed with the element name, add the prefix
                const prefix = `${this.elemName} > `;
                if (!e.elemName.startsWith(prefix)) e.elemName = `${prefix}${e.elemName}`;

                return e;
            });
        this.subElements = this.subElements.concat(subElements);

        // If there is only one subelement and it has a value set, bubble it up and don't display it as a separate row
        if (this.subElements.length == 1 && this.subElements[0].valueSet) {
            // Only set value set based on subelement if it's not null -- in some cases, the value set may be
            // set up above using a different heuristic, so without this conditional, the line below can
            // overwrite a non-null value set with a null one.
            if (this.subElements[0].valueSet.binding != '')
                this._valueSet = this.subElements[0].valueSet;
            this._elemType = this.subElements[0].elemType;
            this.subElements = [];
        }
    }

    get isComplex(): boolean {
        // Determine whether an extension should be treated as "complex" or not.
        // A "complex" extension means that the extension has more than one value.
        // Simple extensions store information in `value[x]`, which has 0..1 cardinality.
        // Complex extensions store information in "children", which are nested extensions.
        const valueX = this.findSiblingById(`${this.nameRoot}.value[x]`);
        const extensionElem = this.findSiblingById(`${this.nameRoot}.extension`);

        // The clearest way to identify a simple extension is if the cardinality of `Extension.extension` is 0..0.
        if (extensionElem && extensionElem.min === 0 && extensionElem.max == '0') {
            if (valueX && valueX.min === 0 && valueX.max == '0') {
                // Not sure if the IG Publisher will allow this or not, but if it happens we want to know about it because
                // it's probably an error in the IG.
                logger.error(
                    `${this.elem.id} in ${this.dataElementInformation.sourceProfileURI} is an extension with 0..0 extensions and 0..0 values. This is likely an error in the IG.`
                );
            }
            return false;
        }

        // Some extensions, like http://hl7.org/fhir/us/core/STU3.1/StructureDefinition-us-core-race.html, have
        // slices with `value[x]` set to 1..1, but do not have `extension` set to 0..0. For mCODE, it works to treat
        // these extension slices as non-complex extensions, but this may not be the correct behavior for all IGs.
        if (
            this.elem.sliceName &&
            // Check to see if there is a `value*` element with a minimum of >0
            this.findSiblingsWithStart(`${this.nameRoot}.value[x]`).filter(e => {
                return e.min > 0;
            }).length > 0
        ) {
            logger.warn(
                `${this.elem.id} is a slice with a required value[x], but child extensions are also allowed. The data dictionary will assume it is not complex.`
            );
            return false;
        }

        // Some extensions, like http://hl7.org/fhir/us/core/STU3.1/StructureDefinition-us-core-birthsex.html, don't
        // set the cardinality for either `extension` or `value[x]`. In this case, check the differential to see
        // if `Extension.extension` is modified at all by the profile. If it isn't *and* the parent is the base
        // Extension resource, then this is _probably_ not a complex extension. It would be much easier if IG authors
        // would just set `extension` to 0..0, but I guess this limits one's options.
        if (
            this.structureDefinition.parent === undefined &&
            this.structureDefinition.differential.element.filter((e: any) => {
                return e.id.startsWith(this.nameRoot + '.extension');
            }).length === 0
        ) {
            // TODO this warning comes up a lot more than it should. Likely because this code only checks for `1..1` for slices, but not for unsliced `value[x]`
            logger.warn(
                `${this.elem.id} is an extension that does not require .value[x] or .extension, but does not modify .extension in the differential. The data dictionary will assume it is not complex.`
            );
            return false;
        }
        return true;
    }

    get nameRoot(): string {
        // If this is a profiled extension, use `Extension` as the name to search for in the Structure Definition
        return this.extensionProfileURI ? 'Extension' : this.elem.id;
    }

    public static canBeCreatedFrom(elementDefinition: fhirtypes.ElementDefinition): boolean {
        if (!elementDefinition.type) return false;
        return elementDefinition.type
            .map(t => {
                return t.code;
            })
            .includes('Extension');
        // && elementDefinition.type[0].profile !== undefined
    }

    get extensionProfileURI(): string | undefined {
        if (this.elem.type[0].profile) return this.elem.type[0].profile[0];
        return undefined;
    }

    get valueSet(): ValueSetData {
        return this._valueSet || { uri: '', binding: '' };
    }

    get elemType(): string {
        return this._elemType;
    }

    get structureDefinition(): fhirtypes.Extension {
        if (this._structureDefinition) return this._structureDefinition;

        // If the extension is profiled, get that Structure Definition. Otherwise, use the URI from the metadata.
        this._structureDefinition = this.fishEverywhere(
            this.extensionProfileURI || this.dataElementInformation.elementStructureDefinitionURI
        );
        if (!this._structureDefinition) {
            throw `Could not find extension definition for ${this.elem.path} in ${this.dataElementInformation.profileTitle}`;
        }

        return this._structureDefinition;
    }
}
