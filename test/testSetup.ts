import {fhirdefs, fshtypes, utils as fshutils} from 'fsh-sushi';
import {BootstrappedFixture} from './testHelpers';
import {DataElementInformation} from '../src/elements/ProfileElement';

export let sushiConfig: fshtypes.Configuration;
export let defs: fhirdefs.FHIRDefinitions;
export let externalDependencyDefs: fhirdefs.FHIRDefinitions;
export let metadata: DataElementInformation;

export const enum FixturePackageNames {
    MCODE_STU2 = 'mcode-stu2.1',
    MCODE_STU3 = 'mcode-stu3',
    USCORE_STU6 = 'uscore-stu6.1',
    MCODE_STU1 = 'mcode-stu1',
    QICORE_STU5 = 'qicore-stu5',
    QICORE_STU6 = 'qicore-stu6',
    SDOH_CLIN_CARE_STU2 = 'sdoh-clinicalcare-stu2'
}
export const fixturePackages: { [key in FixturePackageNames]: string } = {
    [FixturePackageNames.MCODE_STU2]: 'http://hl7.org/fhir/us/mcode/STU2.1/package.tgz',
    [FixturePackageNames.MCODE_STU3]: 'http://hl7.org/fhir/us/mcode/STU3/package.tgz',
    [FixturePackageNames.USCORE_STU6]: 'http://hl7.org/fhir/us/core/STU6.1/package.tgz',
    [FixturePackageNames.QICORE_STU5]: 'https://hl7.org/fhir/us/qicore/package.tgz',
    [FixturePackageNames.QICORE_STU6]: 'https://hl7.org/fhir/us/qicore/2023Sep/package.tgz',
    [FixturePackageNames.MCODE_STU1]: 'https://hl7.org/fhir/us/mcode/STU1/package.tgz',
    [FixturePackageNames.SDOH_CLIN_CARE_STU2]: 'https://hl7.org/fhir/us/sdoh-clinicalcare/STU2.1/package.tgz'
};
// Loading dependencies for US Core takes 25 seconds, so provide an option without dependencies
// mCODE dependencies take 2-3 seconds
// Only use the fixtures with dependencies if the test actually needs them
export const uscore_stu6_with_dependencies = new BootstrappedFixture(FixturePackageNames.USCORE_STU6, true);
export const uscore_stu6 = new BootstrappedFixture(FixturePackageNames.USCORE_STU6, false);
export const mcode_stu1_with_dependencies = new BootstrappedFixture(FixturePackageNames.MCODE_STU1, true);
export const mcode_stu1 = new BootstrappedFixture(FixturePackageNames.MCODE_STU1, false);
export const mcode_stu2_with_dependencies = new BootstrappedFixture(FixturePackageNames.MCODE_STU2, true);
export const mcode_stu2 = new BootstrappedFixture(FixturePackageNames.MCODE_STU2, false);
export const mcode_stu3 = new BootstrappedFixture(FixturePackageNames.MCODE_STU3, false);
export const sdoh_clin_care_stu2 = new BootstrappedFixture(FixturePackageNames.SDOH_CLIN_CARE_STU2, false);
export const qicore_stu5 = new BootstrappedFixture(FixturePackageNames.QICORE_STU5, false);
export const qicore_stu6 = new BootstrappedFixture(FixturePackageNames.QICORE_STU6, false);

beforeEach(async () => {
    metadata = {
        profileTitle: 'Cancer Patient',
        profileGroup: 'Patient',
        baseResourceType: 'Patient',
        sourceProfileURI: undefined,
        elementStructureDefinitionURI: undefined
    };
});

beforeAll(async () => {
    // Silence the SUSHI logger
    fshutils.logger.transports[0].silent = true;
});
