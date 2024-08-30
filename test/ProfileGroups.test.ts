import { ProfileGroupExtractor } from '../src/profile_groups';
import { sdoh_clin_care_stu2, sushiConfig } from './testSetup';

/*
Note that support for groups only works with sushi-config.yaml, which isn't present in the bootstrapped
fixtures that come from a published IG (via package.tgz files). `sdoh-clinicalcare-stu2` contains groups,
and the information is in `ImplementationGuide-hl7.fhir.us.sdoh-clinicalcare.json`, but we have to manually
parse that file and recapitulate it as part of IgSummary.
 */

// TODO do the above and un-skip the test below

describe('ProfileGroupExtractor', () => {
    describe('#getGroups()', () => {
        test.skip('should produce the expected groups', async () => {
            // Make sure setup has run for the fixture since we aren't going to call `getElement()`, which is how
            // this is usually done.
            await sdoh_clin_care_stu2.setup();
            const conf = sdoh_clin_care_stu2.igSummary.sushiConfig;
            const groups = ProfileGroupExtractor.getGroups(conf);
            expect(groups).toHaveProperty(['mcode-cancer-patient'], 'Patient');
        });
    });
});
