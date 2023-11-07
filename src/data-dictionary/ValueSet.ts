import { fhirtypes } from 'fsh-sushi';
import { DataDictionarySettings } from '../DataDictionarySettings';
import _ from 'lodash';
import { logger } from '../util/logger';

export type ValueSetRow = {
    'Value set name': string;
    'Value set URI': string;
    'Code system': string;
    'Logical definition'?: string;
    Code?: string;
    'Code description'?: string;
    [key: string]: string; // Adds an index signature to the type
};

export type CodeSystems = Array<{ [url: string]: string }>;

export class ValueSet {
    public def: fhirtypes.ValueSet;
    public settings: DataDictionarySettings;

    public opMap: { [key: string]: string } = {
        '=': ' = ',
        'is-a': ' is ',
        'descendent-of': ' is a descendent of ',
        'is-not-a': ' is not ',
        regex: ' matches pattern ',
        in: ' in ',
        'not-in': ' not in ',
        generalizes: ' generalizes ',
        exists: ' exists '
    };

    constructor(valueSet: fhirtypes.ValueSet, settings: DataDictionarySettings) {
        this.def = valueSet;
        this.settings = settings;
    }

    /**
     * Converts ValueSet to JSON format
     * @param allValueSets Allows for expansions
     */
    public toJSON(allValueSets: { [key: string]: ValueSet }): ValueSetRow[] {
        let codes: ValueSetRow[] = [];
        const filters: { [url: string]: string[] } = {};

        // Return empty array if nothing is included in the value set
        if (!this.def.compose.include) return codes;

        for (const include of this.def.compose.include) {
            // If `concept` is set, then it's a list of codes that should be added individually to the elements list
            if (include.concept) {
                for (const concept of include.concept) {
                    codes.push({
                        // Some mCODE STU1 value sets use name rather than title
                        'Value set name': this.def.title || this.def.name,
                        'Value set URI': this.def.url,
                        'Code system': this.codeSystemUriToName(include.system),
                        Code: concept.code,
                        'Code description': concept.display
                    });
                }
            }
            // Expand included value sets
            else if (include.valueSet) {
                for (const valueSet of include.valueSet) {
                    if (!allValueSets[valueSet]) {
                        logger.error(`Value set expansion ${valueSet} could not be found.`);
                        break;
                    }

                    // Two possible behaviors for included value sets: (1) display a reference to the included
                    // value set; (2) expand the included value set.
                    const behavior = 'REFERENCE';
                    if (behavior == 'REFERENCE') {
                        codes.push({
                            'Value set name': this.def.title || this.def.name,
                            'Value set URI': this.def.url,
                            'Code system': 'n/a',
                            'Logical definition': `Include codes from ${
                                allValueSets[valueSet].def.title || allValueSets[valueSet].def.name
                            }`
                        });
                    }
                    // Expand behavior:
                    else {
                        const expansion = allValueSets[valueSet]
                            .toJSON(allValueSets)
                            // Rewrite value set name and URI to match this VS, rather than the source VS
                            .map(x => {
                                x['Value set name'] = this.def.title || this.def.name;
                                x['Value set URI'] = this.def.url;
                                return x;
                            });

                        codes = codes.concat(expansion);
                    }
                }
            }
            // If `filter` is set then it's logic
            else if (include.filter) {
                for (const filter of include.filter) {
                    filters[include.system] = filters[include.system] || [];
                    filters[include.system].push(
                        `${filter.property}${this.opMap[filter.op] || ' '}${filter.value}`
                    );
                }
            }
        }

        const filtersAsRows: ValueSetRow[] = [];
        for (const [url, f] of Object.entries(filters)) {
            filtersAsRows.push({
                'Value set name': this.def.title,
                'Value set URI': this.def.url,
                'Code system': this.codeSystemUriToName(url),
                'Logical definition': f.join(' OR ')
            });
        }

        return _.orderBy(codes.concat(filtersAsRows), ['Code system', 'Code'], ['asc', 'asc']);
    }

    public codeSystemUriToName(uri: string): string {
        if (this.settings.codeSystems && uri in this.settings.codeSystems) {
            return this.settings.codeSystems[uri];
        }
        return uri;
    }
}
