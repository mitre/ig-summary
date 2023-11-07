import {mcode_stu1} from './testSetup';


describe('ProfileBackboneElement', () => {
    describe('Element is a BackboneElement', () => {
        test('should bubble up value set for a BackboneElement that contains a CodeableConcept', async () => {
            const elem = await mcode_stu1.getElement('mcode-cancer-genetic-variant',
                'Observation.component:GeneStudied'
            );
            expect(elem.elem.valueSet.uri).toBe(
                'http://hl7.org/fhir/us/mcode/ValueSet/mcode-hgnc-vs'
            );
            expect(elem.elem.valueSet.binding).toBe('extensible');
            expect(elem.elem.elemType).toBe('CodeableConcept');
        });

        test('should bubble up "Any" for element type for a BackboneElement that contains a polymorphic value', async () => {
            const elem = await mcode_stu1.getElement('mcode-cancer-genetic-variant',
                'Observation.component:CytogeneticLocation'
            );
            expect(elem.elem.elemType).toBe('Any');
        });
    });
});
