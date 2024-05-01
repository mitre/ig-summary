import { mcode_stu2 } from './../testSetup';

describe('ProfileElement', () => {
    test('example value set binding assertions', async () => {
        await mcode_stu2
            .getElement('mcode-cancer-disease-status', 'Observation.code', false)
            .then(function (e) {
                expect(e.row[0]['Value Set Binding']).toBe('example');
                expect(e.row[0]['Value Set URI']).not.toBe('');
            });
    });
});
