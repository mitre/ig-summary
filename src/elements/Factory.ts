import { fhirtypes, fhirdefs } from 'fsh-sushi';
import { DataElementInformation, ProfileElement } from './ProfileElement';
import { ProfileBackboneElement } from './ProfileBackboneElement';
import { ProfileExtensionElement } from './ProfileExtensionElement';
import { DataDictionarySettings } from '../DataDictionarySettings';

export abstract class ProfileElementFactory {
    public static getElement(
        elementDefinition: fhirtypes.ElementDefinition,
        dataDictionaryElementMetadata: DataElementInformation,
        fhirDefinitions: fhirdefs.FHIRDefinitions[],
        settings: DataDictionarySettings
    ): ProfileElement {
        const args: [
            fhirtypes.ElementDefinition,
            DataElementInformation,
            fhirdefs.FHIRDefinitions[],
            DataDictionarySettings
        ] = [elementDefinition, dataDictionaryElementMetadata, fhirDefinitions, settings];

        const elementClasses = [ProfileExtensionElement, ProfileBackboneElement, ProfileElement];

        for (const klass of elementClasses) {
            if (klass.canBeCreatedFrom(elementDefinition)) {
                return new klass(...args);
            }
        }
        throw `Could not create ProfileElement for ${elementDefinition.id}`;
    }
}
