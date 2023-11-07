import { ValueSet } from '../../src/data-dictionary/ValueSet';
import _ from 'lodash';

import {mcode_stu1} from './../testSetup';

describe('ValueSet', () => {
    test('should get codes in value set', async () => {
        mcode_stu1.setup(); // Manually run this since we don't call `mcode_stu1.getElement()`
        const def = mcode_stu1.igSummary.defs.fishForFHIR(
            'http://hl7.org/fhir/us/mcode/ValueSet/mcode-primary-or-uncertain-behavior-cancer-disorder-vs'
        );
        const vs = new ValueSet(def, {
            mode: 0,
            codeSystems: { 'http://hl7.org/fhir/sid/icd-10-cm': 'ICD-10CM' }
        });

        const j = vs.toJSON({ 'ICD-10CM': vs });
        expect(j[0]['Code system']).toBe('ICD-10CM');
        expect(j[0].Code).not.toBeNull();
        expect([...new Set(j.map(x => x['Code system']))].length).toBe(2);
        expect(
            j.filter(x => {
                return x['Code system'] == 'http://snomed.info/sct';
            })[0]['Logical definition']
        ).not.toBeNull();
    });
});
