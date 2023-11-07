import {
    mcode_stu1,
    mcode_stu1_with_dependencies,
    mcode_stu2,
    mcode_stu2_with_dependencies,
    uscore_stu6
} from './testSetup';
import {ProfileExtensionElement} from '../src/elements/ProfileExtensionElement';


describe('ProfileExtensionElement', () => {
    describe('Identify simple and complex extensions correctly', () => {
        test('simple extension', async () => {
            const elem = await mcode_stu1.getElement(
                'PrimaryCancerCondition',
                'Condition.extension:histologyMorphologyBehavior'
            );
            expect((elem.elem as ProfileExtensionElement).isComplex).toBe(false);
        });

        test('complex extension', async () => {
            const elem = await mcode_stu1_with_dependencies.getElement(
                'CancerPatient',
                'Patient.extension:race'
            );
            expect((elem.elem as ProfileExtensionElement).isComplex).toBe(true);
        });

        test('extension slice that has a required value[x] but does not set extension to 0..0', async () => {
            const elem = await uscore_stu6.getElement(
                'us-core-race',
                'Extension.extension:ombCategory'
            );
            expect((elem.elem as ProfileExtensionElement).isComplex).toBe(false);
        });
    });

    describe('Element is a simple Extension', () => {
        test('should bubble up value set for a simple Extension that contains a CodeableConcept', async () => {
            const elem = await mcode_stu2.getElement(
                'PrimaryCancerCondition',
                'Condition.extension:histologyMorphologyBehavior'
            );
            expect(elem.elem.valueSet.uri).toBe(
                'http://hl7.org/fhir/us/mcode/ValueSet/mcode-histology-morphology-behavior-vs'
            );
            expect(elem.elem.valueSet.binding).toBe('extensible');
            expect(elem.elem.elemType).toBe('CodeableConcept');
        });

        test('should bubble up CodeableConcept for a simple extension inside Observation.component', async () => {
            const elem = await mcode_stu2.getElement(
                'ComorbiditiesElixhauser',
                'Observation.component.extension:conditionCode'
            );
            expect(elem.elem.elemType).toBe('CodeableConcept');
        });

        test('should correctly name simple extension subelement', async () => {
            const elem = await mcode_stu2.getElement(
                'mcode-secondary-cancer-condition',
                'Condition.extension'
            );
            expect(elem.elem.subElements[1].elemName).toBe(
                'Extension > Related Primary Cancer Condition > Value'
            );
        });

        // TODO figure out if this is still relevant -- now that simple extension detection is improved, all simple extensions may end up being represented as values in the data dictionary.
        // test('name of simple extension', () => {
        //     const elem = const elem = await mcode_stu2.getElement(
        //         'CancerPatient',
        //         'Patient.extension:birthsex'
        //     );
        //     expect((elem.elem as ProfileExtensionElement).isComplex).toBe(false);
        //     expect(elem.elem.elemType).toBe('Extension (simple)');
        // });

        test('should get value set from STU1-style extension', async () => {
            const elem = await mcode_stu1.getElement(
                'mcode-cancer-related-surgical-procedure',
                'Procedure.extension:treatmentIntent'
            );
            expect(elem.elem.valueSet.uri).toBe(
                'http://hl7.org/fhir/us/mcode/ValueSet/mcode-treatment-intent-vs'
            );
        });

        test('should have a value set URI for `code` simple extensions', async () => {
            const elem = await mcode_stu2_with_dependencies.getElement(
                'mcode-cancer-patient',
                'Patient.extension:birthsex'
            );
            expect(elem.elem.valueSet.uri).toBe('http://hl7.org/fhir/us/core/ValueSet/birthsex');
        });

        test('should properly handle mCODE STU1 style slicing of extensions', async () => {
            const elem = await mcode_stu2.getElement(
                'mcode-cancer-disease-status',
                'Observation.extension:evidenceType'
            );
            expect(elem.elem.valueSet.uri).toBe(
                'http://hl7.org/fhir/us/mcode/ValueSet/mcode-cancer-disease-status-evidence-type-vs' +
                ''
            );
            expect(elem.elem.valueSet.binding).toBe('required');
        });
    });

    describe('Element is a complex Extension', () => {
        test('should properly parse an Extension that has two MS elements, one with a value set', async () => {
            const elem = await mcode_stu1_with_dependencies.getElement(
                'mcode-cancer-patient',
                'Patient.extension:race',
                true
            );
            expect(elem.elem.elemType).toBe('Extension: US Core Race Extension');

            // `Patient.extension:race` should have 3 rows, matching the MS defined in the extension:
            //   1. The parent extension (Patient.extension:race)
            //   2. Race category
            //   3. Race text
            //
            // This is because #2 and #3 are both MS in the extension.
            const rows = elem.elem.toJSON();
            expect(rows[0]['Data Element Name']).toBe('Race');
            expect(rows[0]['Value Set URI']).toBe('');

            expect(rows[1]['Data Element Name']).toBe('Race > Omb Category');
            expect(rows[1]['Value Set URI']).toBe(
                'http://hl7.org/fhir/us/core/ValueSet/omb-race-category'
            );

            expect(rows[2]['Data Element Name']).toBe('Race > Text');
            expect(rows[2]['Value Set URI']).toBe('');
            expect(rows[2]['Data Type']).toBe('string');
        });
    });
});
