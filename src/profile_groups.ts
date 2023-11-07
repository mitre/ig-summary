import { fshtypes } from 'fsh-sushi';

export type ProfileGroups = { [id: string]: string };

export abstract class ProfileGroupExtractor {
    public static getGroups(sushiConfig: fshtypes.Configuration): ProfileGroups {
        const resourceGroups: ProfileGroups = {};
        for (const group of sushiConfig.groups) {
            for (const resource of group['resources']) {
                const cleanedResourceName = resource.replace('StructureDefinition/', '');
                resourceGroups[cleanedResourceName] = group['name'].replace('Profiles: ', '');
            }
        }
        return resourceGroups;
    }
}
