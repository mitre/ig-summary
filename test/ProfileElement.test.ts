import { mcode_stu1, mcode_stu2, mcode_stu2_with_dependencies, mcode_stu3 } from './testSetup';
import { DataDictionaryMode } from '../src/DataDictionarySettings';
import {
    DataElementInformationForSpreadsheet,
    SpreadsheetColNames
} from '../src/elements/ProfileElement';

describe('ProfileElement', () => {
    describe('Element is a CodeableConcept', () => {
        test('should have a defined value set and binding', async () => {
            const elem = await mcode_stu1.getElement('CancerDiseaseStatus', 'Observation.value[x]');
            expect(elem.elem.valueSet.uri).toBe(
                'http://hl7.org/fhir/us/mcode/ValueSet/mcode-condition-status-trend-vs'
            );
            expect(elem.elem.valueSet.binding).toBe('required');
        });
    });

    describe('#elemName', () => {
        test('should be the slice name for sliced extensions', async () => {
            // Note: there's not a good way to get the extension name -- in some cases it will just be "Extension"
            const elem = await mcode_stu1.getElement(
                'CancerDiseaseStatus',
                'Observation.extension:evidenceType'
            );
            expect(elem.elem.elemName).toBe('Evidence Type');
        });

        test('should indicate slice in element name', async () => {
            const elem = await mcode_stu1.getElement(
                'CancerGenomicsReport',
                'DiagnosticReport.result:CancerGeneticVariant'
            );
            expect(elem.elem.elemName).toBe('Result > Cancer Genetic Variant');
        });

        test('should not include slice parents called "Extension"', async () => {
            const elem = await mcode_stu1.getElement(
                'CancerRelatedRadiationProcedure',
                'Procedure.bodySite.extension:laterality'
            );
            expect(elem.elem.elemName).not.toContain('Extension');
        });

        test('should put slice name in name of sub-element of slice', async () => {
            const elem = await mcode_stu1.getElement(
                'mcode-cancer-genetic-variant',
                'Observation.component:GenomicDNAChange.code'
            );
            expect(elem.elem.elemName.match('Genomic DNA')).toBeTruthy();
        });

        test('should put slice name in name of value[x] sub-element of slice', async () => {
            const elem = await mcode_stu1.getElement(
                'mcode-cancer-genetic-variant',
                'Observation.component:GenomicDNAChange.value[x]'
            );
            expect(elem.elem.elemName.match('Genomic DNA')).toBeTruthy();
        });
    });

    describe('#required', () => {
        test('should indicate conditional for nested requires', async () => {
            const elem = await mcode_stu1.getElement('CancerPatient', 'Patient.address.line');
            expect(elem.elem.required).toContain('(conditional');
        });
    });

    describe('#valueSet', () => {
        test('should get value set info for a CodeableConcept', async () => {
            const elem = await mcode_stu1.getElement('GeneticSpecimen', 'Specimen.type');
            expect(elem.elem.valueSet.uri).toBe(
                'http://hl7.org/fhir/us/mcode/ValueSet/mcode-genetic-specimen-type-vs'
            );
            expect(elem.elem.valueSet.binding).toBe('required');
        });

        test('should get value set info for a code', async () => {
            const elem = await mcode_stu1.getElement('GenomicRegionStudied', 'Observation.status');
            expect(elem.elem.valueSet.uri).toBe('http://hl7.org/fhir/ValueSet/observation-status');
            expect(elem.elem.valueSet.binding).toBe('required');
        });
    });

    describe('#elemType', () => {
        test('should include profile name in type for references', async () => {
            const elem = await mcode_stu2_with_dependencies.getElement(
                'mcode-genomics-report',
                'DiagnosticReport.result'
            );
            expect(elem.elem.elemType).toBe('Reference: USCoreLaboratoryResultObservationProfile');
        });
    });

    describe('#definition', () => {
        test('should include a custom description', async () => {
            const elem = await mcode_stu2.getElement(
                'ComorbiditiesElixhauser',
                'Observation.focus'
            );
            expect(elem.elem.definition).toContain(
                'A reference to the cancer condition that is the context for the current list of comorbid conditions'
            );
        });
    });

    test('should include category with fixed value slice in "all" mode', async () => {
        const elem = await mcode_stu1.getElement(
            'mcode-ecog-performance-status',
            'Observation.category',
            false
        );
        expect(elem.elem.toJSON().length).toBeGreaterThan(0);
    });

    test('should include category with fixed value slice in "MS" mode', async () => {
        const elem = await mcode_stu1.getElement(
            'mcode-ecog-performance-status',
            'Observation.category',
            true
        );
        expect(elem.elem.toJSON().length).toBeGreaterThan(0);
    });

    test('should exclude fixed value slice with suppressedFixedCodes setting == true', async () => {
        const elem = await mcode_stu1.getElement(
            'mcode-ecog-performance-status',
            'Observation.code',
            true,
            {
                mode: DataDictionaryMode.MustSupport,
                suppressFixedCodes: true
            }
        );
        expect(elem.elem.toJSON().length).toEqual(0);
    });

    test('should include fixed value slice with suppressedFixedCodes setting != true', async () => {
        // suppressedFixedCodes is off by default
        const elem = await mcode_stu1.getElement(
            'mcode-ecog-performance-status',
            'Observation.code',
            true
        );
        const j: Array<DataElementInformationForSpreadsheet> = elem.elem.toJSON();
        expect(j.length).toEqual(1);
        expect(j[0][SpreadsheetColNames.Required]).toContain(
            'Required [Fixed to http://loinc.org#89247-1]'
        );
    });

    test('should handle slicing pattern in mCODE STU1 for setting value[x] type', async () => {
        const elem = await mcode_stu1.getElement(
            'mcode-cancer-disease-status',
            'Observation.value[x]:valueCodeableConcept'
        );
        expect(elem.elem.elemName).toBe('Value');
        expect(elem.elem.toJSON()[0]['FHIR Element (R4)']).toBe('Observation.value[x]');
    });

    test('in MS mode, should suppress sliced element row in favor of displaying slices when all slices are MS', async () => {
        let elem = await mcode_stu2.getElement(
            'CancerRelatedMedicationAdministration',
            'MedicationAdministration.extension',
            true
        );
        expect(elem.elem.toJSON().length).toBe(0);

        // Make sure that the slices are in fact displayed
        elem = await mcode_stu2.getElement(
            'CancerRelatedMedicationAdministration',
            'MedicationAdministration.extension:treatmentIntent',
            true
        );
        expect(elem.elem.toJSON().length).toBe(1);
        elem = await mcode_stu2.getElement(
            'CancerRelatedMedicationAdministration',
            'MedicationAdministration.extension:terminationReason',
            true
        );
        expect(elem.elem.toJSON().length).toBe(1);
    });

    // TODO This test doesn't pass due to issues with handling polymoprhic elements
    test.skip('should not show `:someSlice` in favor of `:someSlice.value[x]`', async () => {
        const elem1 = await mcode_stu1.getElement(
            'mcode-cancer-genetic-variant',
            'Observation.component:GenomicDNAChange',
            true
        );
        const elem2 = await mcode_stu1.getElement(
            'mcode-cancer-genetic-variant',
            'Observation.component:GenomicDNAChange.value[x]',
            true
        );
        expect(elem1.elem.toJSON()).toEqual([]);
        expect(elem2.elem.toJSON().length).toBe(1);
    });

    describe('Polymorphic elements', () => {
        test('MS effective[x] and MS effective[x]:effectiveDateTime', async () => {
            const effective = await mcode_stu3.getElement(
                'mcode-genomic-variant',
                'Observation.effective[x]'
            );
            const effectiveDateTime = await mcode_stu3.getElement(
                'mcode-genomic-variant',
                'Observation.effective[x]:effectiveDateTime'
            );

            // These assertions are just to show how this works -- they should always pass
            expect(effective.elem.elem.id).toBe('Observation.effective[x]');
            expect(effective.elem.elem.path).toBe('Observation.effective[x]');

            expect(effectiveDateTime.elem.elem.id).toBe(
                'Observation.effective[x]:effectiveDateTime'
            );
            expect(effectiveDateTime.elem.elem.path).toBe('Observation.effective[x]');
            expect(effectiveDateTime.elem.elem.sliceName).toBe('effectiveDateTime');
        });
    });
});
