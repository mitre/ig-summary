import { DataElementInformation, ProfileElement } from './ProfileElement';
import { fhirtypes, fhirdefs } from 'fsh-sushi';
import { ProfileElementFactory } from './Factory';
import { DataDictionarySettings } from '../DataDictionarySettings';

export class ProfileBackboneElement extends ProfileElement {
    private polymorphicValueSubElement: ProfileElement;

    constructor(
        elem: fhirtypes.ElementDefinition,
        metadata: DataElementInformation,
        defs: fhirdefs.FHIRDefinitions[],
        settings: DataDictionarySettings
    ) {
        super(elem, metadata, defs, settings);

        // Find child elements that have a value set binding
        // TODO this should use this.elem.structDef.elements to get ElementDefinition resources rather than generic objects for each element
        const polymorphicValueSubElements = this.structureDefinition.snapshot.element.filter(
            (x: any) => {
                // TODO also this should detect any polymorphic element, not just `value[x]`
                // Looking at SUSHI source, it appears that `x.id.endsWith('value[x]')` is a reasonable way to
                // detect polymorphic elements
                return x.id.startsWith(this.elem.id) && x.id.endsWith('value[x]');
            }
        );
        if (polymorphicValueSubElements && polymorphicValueSubElements.length > 0) {
            this.polymorphicValueSubElement = ProfileElementFactory.getElement(
                polymorphicValueSubElements[0],
                this.dataElementInformation,
                defs,
                this.dataDictionarySettings
            );
        }
    }

    public static canBeCreatedFrom(elementDefinition: fhirtypes.ElementDefinition): boolean {
        if (!elementDefinition.type) return false;

        return elementDefinition.type
            .map(t => {
                return t.code;
            })
            .includes('BackboneElement');
    }

    get elemType(): string {
        if (this.polymorphicValueSubElement) {
            return this.polymorphicValueSubElement.elemType;
        } else {
            return super.elemType;
        }
    }

    get valueSet(): { uri: string; binding: string } {
        if (this.polymorphicValueSubElement !== undefined) {
            return this.polymorphicValueSubElement.valueSet;
        } else {
            return super.valueSet;
        }
    }
}
