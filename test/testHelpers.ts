import {DataElementInformation} from '../src/elements/ProfileElement';
import {ProfileElementFactory} from '../src/elements/Factory';
import {DataDictionaryMode, DataDictionarySettings} from '../src/DataDictionarySettings';
import {FixturePackageNames, fixturePackages} from './testSetup';
import {IgSummary} from '../src/data-dictionary/IgSummary';
import {StructureDefinition} from 'fsh-sushi/dist/fhirtypes';
import fs from 'fs-extra';
import got from 'got';
import tar from 'tar';

export class BootstrappedFixture {
    public igSummary: IgSummary;
    private loadDependencies: boolean;
    private fixtureEnum: FixturePackageNames;

    constructor(fixtureEnum: FixturePackageNames, loadDependencies: boolean) {
        this.loadDependencies = loadDependencies;
        this.fixtureEnum = fixtureEnum;
    }

    public async setup() {
        /**
         * Handles setup of this object because it requires async calls, which can't be in the constructor.
         *
         * Called as the first line in `getElement(...)` below.
         */
        if(this.igSummary === undefined) {
            // Check to see if the IG release in question has been cached locally yet
            const fixtureBootstrapPath = 'test/fixtures/bootstrap/';
            fs.mkdirSync(fixtureBootstrapPath, {recursive: true});
            const fixtureUrl = fixturePackages[this.fixtureEnum];
            const path = `${fixtureBootstrapPath}${this.fixtureEnum}`;
            if (!fs.existsSync(path)) {
                // If not, download it...
                console.log(`${path} does not exist; downloading from ${fixtureUrl}`);

                const response = await got.stream(fixtureUrl);
                const writeStream = fs.createWriteStream(path + '.tgz');
                response.pipe(writeStream);

                // Wait for the file to be saved
                await new Promise((resolve, reject) => {
                    writeStream.on('finish', resolve);
                    writeStream.on('error', reject);
                });

                // Unzip the file
                await tar.extract({file: path + '.tgz', cwd: fixtureBootstrapPath});
                fs.moveSync(`${fixtureBootstrapPath}package`, path);

                console.log('File downloaded and unzipped successfully');
            }

            // Load from package
            this.igSummary = new IgSummary({
                igDir: `${fixtureBootstrapPath}${this.fixtureEnum}`,
                outputDir: `${fixtureBootstrapPath}${this.fixtureEnum}`
            });

            // Load dependencies if needed
            if(this.loadDependencies === true && this.igSummary.externalDefs === undefined) {
                await this.igSummary.getExternalDefs();
                if(this.fixtureEnum === FixturePackageNames.MCODE_STU1 || this.fixtureEnum === FixturePackageNames.MCODE_STU2) {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    if(this.igSummary.externalDefs.fishForFHIR('http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex') === undefined) {
                        throw 'Could not find http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex';
                    }
                }
            }
            else if (this.loadDependencies === false) {
                this.igSummary.sushiConfig.dependencies = [];
            }
        }
    }

    public async getElement(profileIdentifier: string, elementId: string, mustSupport?: boolean, settings?: DataDictionarySettings) {
        await this.setup();

        const profile = this.igSummary.defs.fishForFHIR(profileIdentifier);

        if(profile === undefined) {
            throw `Could not find profile with identifier <${profileIdentifier}>`;
        }

        const sd = StructureDefinition.fromJSON(profile);
        const fhirElem = sd.findElement(elementId);
        if (fhirElem === undefined) {
            throw `Could not find element with path ${elementId} in ${profileIdentifier}.
            
            Valid paths: ${undefined}`;
        }

        const metadata: DataElementInformation = {
            profileTitle: profile.title,
            profileGroup: 'Default',
            baseResourceType: profile.type,
            sourceProfileURI: profile.url,
            elementStructureDefinitionURI: profile.url
        };

        // Make sure settings mode is consistent with settings boolean
        if(settings !== undefined && settings.mode != (mustSupport ? DataDictionaryMode.MustSupport : DataDictionaryMode.All)) {
            throw 'Settings mode and boolean don\'t match.';
        }

        const elem = ProfileElementFactory.getElement(
            fhirElem,
            metadata,
            [this.igSummary.defs, this.igSummary.externalDefs],
            settings === undefined ? { mode: mustSupport ? DataDictionaryMode.MustSupport : DataDictionaryMode.All } : settings
        );

        return {
            fhir: fhirElem,
            elem: elem,
            row: elem.toJSON()
        };

    }

}
