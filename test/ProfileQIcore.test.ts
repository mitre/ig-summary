import {qicore_stu6} from './testSetup';

describe('ProfileElement', () => {
    describe('Element exists', () => {
        test('should have an official URL', async () => {
            const elem = await qicore_stu6.getElement(
                'QICoreNutritionIntake',
                'Basic.implicitRules'
            );
            expect(elem.elem.structureDefinition.url).toBe(
                'http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-nutritionintake'
            );
        });

        test('should have an official URL', async () => {
            const elem = await qicore_stu6.getElement(
                'QICoreObservationClinicalResult',
                'Observation.implicitRules'
            );
            expect(elem.elem.structureDefinition.url).toBe(
                'http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-observation-clinical-result'
            );
        });

        test('should have an official URL', async () => {
            const elem = await qicore_stu6.getElement(
                'QICoreObservationScreeningAssessment',
                'Observation.implicitRules'
            );
            expect(elem.elem.structureDefinition.url).toBe(
                'http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-observation-screening-assessment'
            );
        });

        test('should have an official URL', async () => {
            const elem = await qicore_stu6.getElement(
                'QICoreSimpleObservation',
                'Observation.implicitRules'
            );
            expect(elem.elem.structureDefinition.url).toBe(
                'http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-simple-observation'
            );
        });

    });
});
