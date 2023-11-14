# `ig-summary`: Automated summarization and comparison of FHIR® Implementation Guides in spreadsheet format

[![stability-beta](https://img.shields.io/badge/stability-beta-33bbff.svg)](https://github.com/mkenney/software-guides/blob/master/STABILITY-BADGES.md#beta)

This command line tool has two primary functions:

1. **Create a spreadsheet summarizing a FHIR IG**:

    Run `ig-summary create` to generate a spreadsheet in Excel format summarizing the contents of a FHIR Implementation Guide (IG).

    This command uses the output of the [FHIR IG Publisher](https://confluence.hl7.org/display/FHIR/IG+Publisher+Documentation) as its input. This can come either from the `package.tgz` file downloaded from a published IG, or from the `output/` folder created by the FHIR IG Publisher running locally on your system.

    It outputs a spreadsheet summarizing the IG contents including profiles, extensions, and value sets.

    It also outputs a JSON file that contains the same data as the spreadsheet, which can be used for `ig-summary diff` (see below).

2. **Create a comparison ("diff") spreadsheet**:

    Run `ig-summary diff` to generate a comparison between two IGs (or two versions of the same IG).

    This command uses the JSON output of `ig-summary create` as its input.

    It outputs a spreadsheet in Excel format containing the comparison.

These commands are described in detail below.

## Reporting Issues

This tool is currently at a "beta" level of maturity, and may have bugs or behave in unexpected ways. Please report any issues you have using this tool [on this GitHub project's Issues page](https://github.com/mitre/ig-summary/issues).

## Installing & Running

You will need to have [Node.js](https://nodejs.org/en/download) installed first.

Run the following command to install `ig-summary` globally on your system:

```text
git clone git@github.com:mitre/ig-summary.git
cd ig-summary
npm install -g
```

If this is successful, you should be able to run `ig-summary` and see the output below.

```text
$ ig-summary
Usage: ig-summary [command] [options]

Summarize and compare FHIR Implementation Guides.

See https://github.com/mitre/ig-summary for details.

Options:
  -V, --version     output the version number
  -h, --help        display help for command

Commands:
  create [options]  create a summary of the IG in Excel and JSON format
  diff [options]    create a comparison ("diff") of the output of two different runs of the "create" command
  help [command]    display help for command
```

As you can see, the output of running `ig-summary` is built-in documentation, which points to two commands: `ig-summary create` and `ig-summary diff`. Additional documentation is available for both with the `--help` flag, as shown below.

```text
$ ig-summary create --help
Usage: ig-summary create --input <path> --output <path> [options]

Create a summary of the IG in Excel and JSON format.

See https://github.com/mitre/ig-summary for details.

Options:
  --input <path>             path to FHIR Implementation Guide root folder
  --output <path>            path to folder where summary will be written
  --log-level <level>        specify the level of log messages (choices: "error", "warn", "info", "debug", default: "info")
  --mode <mode>              include all elements or MustSupport only with "ms" (choices: "ms", "all", default: "ms")
  --comparison <comparison>  path to JSON output from previous run to compare with
  --settings <settings>      path to settings .yaml file; see project README for details
  -h, --help                 display help for command


$ ig-summary diff --help
Usage: ig-summary diff --a /path/to/a.json --b /path/to/b.json --output /path/to/output/ [options]

Create a comparison ("diff") of the output of two different runs of the "create" command.

See https://github.com/mitre/ig-summary for details.

Options:
  --a <a>            path to file a
  --b <b>            path to file b
  --output <path>    output path
  --settings <path>  path to settings .yaml file; see project README for details
  -h, --help         display help for command
```

### Settings files

Both the `ig-summary create` and `ig-summary diff` commands support settings files via the `--settings` option. These are [.yaml](https://en.wikipedia.org/wiki/YAML)-formatted files with the following contents:

-   Annotated settings file example for the `ig-summary create` command:

    ```yaml
    title: Title that appears in the spreadsheet goes here
    filename: name-here # Produces `name-here.xlsx`

    # The spreadsheet's first tab can optionally include static text as defined
    # here. This is useful for background information or additional description
    # of the IG.
    #
    # You can see an example of this in <https://hl7.org/fhir/us/mcode/STU2/data-dictionary/mCODEDataDictionary-STU2.xlsx>,
    # which is defined by <https://github.com/HL7/fhir-mCODE-ig/blob/STU2/data-dictionary/settings.yaml#L3-L100>.
    #
    # Markdown syntax for bold text and hyperlinks are supported.
    informationTabContent:
        General notes: |+
            **Bold text example:** Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            Ut ut ex ut urna sodales ultricies et id lacus. In fringilla metus suscipit,
            blandit tellus et, venenatis nisl. Praesent gravida, nisl sed porta molestie,
            dolor sem mollis est, in scelerisque tortor purus eget nibh.

            Multiple paragraphs are supported tool. Links are like <https://mitre.org>.
        EMPTY-0BCakOkEFj: '' # For an empty space, use `EMPTY-some-random-string: ''`
        HEADINGS LIKE THIS: '' # Headings are all caps; they will be converted to Title Case automatically
        Other notes: |+
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut ut ex ut urna sodales
             ultricies et id lacus. In fringilla metus suscipit, blandit tellus et, venenatis
             nisl. Praesent gravida, nisl sed porta molestie, dolor sem mollis est, in
             scelerisque tortor purus eget nibh.

    # Provide human-readable names for code systems like below
    codeSystems:
        'http://snomed.info/sct': SNOMED CT
        'http://loinc.org': LOINC

    # Data element names may not have proper spaces and capitalization automatically;
    # these can be touched up like below.
    touchUpHumanizedElementNames:
        DNAChange: DNA Change
        DNARegion: DNA Region
    
    # When set to `true`, this will hide data element rows for CodeableConcepts with a fixed code.
    # If the primary audience for the IG summary are clinical SMEs, including all the fixed codes
    # may be unnecessarily noisy.
    suppressedFixedCodes: false
    ```

-   Annotated settings file example for the `ig-summary diff` command:

    ```yaml
    leftName: Name of the file in `--a` to appear in the spreadsheet
    rightName: Name of the file in `--b` to appear in the spreadsheet
    filename: output-filename-goes-here

    # Prevent the diff tool from showing ValueSets with IDs that changed as removed+added
    # by mapping old URIs to new URIs
    valueSets:
        renamed:
            - old: http://hl7.org/fhir/us/some-ig/ValueSet/somevalueset
              new: http://hl7.org/fhir/us/some-ig/ValueSet/some-value-set

    # If there are any columns you do not want to consider in comparisons, list them here.
    # The column name in this file must be an exact match for the column header in the
    # spreadsheet or it will be ignored.
    ignoreColumnsWhenComparing:
        - Group

    # If there are rows that should never be displayed in the diff, specify them here.
    # The keys (like `FHIR Element (R4)`) must be exact matches for the column headers in
    # the output spreadsheet. The values must be exact matches for the value(s) appearing
    # in the row you wish to suppress. Multiple key/value pairs can be provided for each row
    # you wish to suppress, which will only match rows with cells that exactly match **all**
    # key/value pairs.
    #
    # The example below has two sets of rows suppression criteria, each with two key/value pairs.
    # This will suppress all the rows with cells meeting both key/value pairs from a given set.
    suppressRows:
        - FHIR Element (R4): Condition.extension:someExtension.url
          Source Profile URI: http://hl7.org/fhir/us/some-ig/StructureDefinition/some-structure-definition

        - FHIR Element (R4): Condition.extension:someOtherExtension.url
          Source Profile URI: http://hl7.org/fhir/us/some-ig/StructureDefinition/some-structure-other-definition

    # This allows you to perform a "find and replace" to remove non-meaningful changes before the comparison. For example,
    # if you renamed a profile, you can replace the old `Profile URI` with the new one to avoid the elements appearing
    # as if they were removed and re-added.
    #
    # The `column` value must exactly match a column header in the output spreadsheet. The `old` value must
    # exactly match the value you want to replace. The `new` value is anything you want.
    remapValues:
        - column: Source Profile URI
          old: http://hl7.org/fhir/us/some-ig/StructureDefinition/old-name
          new: http://hl7.org/fhir/us/some-ig/StructureDefinition/new-name

    # You can use this to display custom text in the "Changed elements" tab under a pair of rows indicating
    # a change between the two IGs being compared.
    #
    # The example below shows an example of this feature from mCODE STU1 vs. STU2. Note that he same note can
    # appear under multiple rows.
    notes:
        - note: This element was not allowed in STU1, and this restriction was removed in STU2.
          appearBy:
              - Profile Title: Cancer Disease Status
                Data Element Name: Body Site
              - Source Profile URI: http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-tumor-marker-test
                Data Element Name: Has Member
              - Source Profile URI: http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-tumor-marker-test
                Data Element Name: Component
              - Source Profile URI: http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-tumor-marker-test
                Data Element Name: Body Site
    ```

## Developing

To work on the source code for this tool:

```shell
git clone git@github.com:mitre/ig-summary.git
cd ig-summary
npm install
```

You can then run `npm link` to create a symlink in `<prefix>/bin/` to `dist/ig-summary.js`. This will make the `ig-summary` command use your local build. If you're curious what `<prefix>` is, run `npm prefix -g`.

You can also run commands manually with `node` like:

```shell
node --require ts-node/register src/ig-summary.ts create ...
```

### Environment/Dependencies

We use the following development dependencies, which are installed automatically with `npm install` and are documented below for the sake of clarity:

-   Tests: [`jest`](https://jestjs.io) with [`ts-jest`](https://github.com/kulshekhar/ts-jest) to support TypeScript and [`jest-extended`](https://github.com/jest-community/jest-extended) to add more specific matchers.
-   Code auto-formatting: [`prettier`](https://prettier.io)
-   Linting: [`eslint`](https://eslint.org), with [`eslint-config-prettier`](https://github.com/prettier/eslint-config-prettier) to avoid conflicts with `prettier`.
-   Logging: `winston`

### Testing

The `test/` folder contains [`jest`](https://jestjs.io) unit tests. These tests are written against published versions of IGs, as defined in `test/testSetup.ts like:

```typescript
export const uscore_stu6 = new BootstrappedFixture(FixturePackageNames.USCORE_STU6, false);
```

These can be used in tests like this:

```typescript
test('some description', async () => {
    const elem = await uscore_stu6.getElement(
        'us-core-race',
        'Extension.extension:ombCategory'
    );
    expect(elem.elem.elemName.match('...')).toBeTruthy();
});
```

Calling `getElement()` on any `BootstrappedFixture` will take care of downloading the IG build (if it isn't already downloaded), and doing all the setup necessary to load in the IG and allow `getElement()` to return a given element that has been run through the `ig-summary` plumbing.

If a specific element in a specific IG is not behaving as expected, the best practice is to write a test against this using the approach described above, and then modify the `ig-summary` code to make the test pass. This will help prevent regressions in the future.

---

FHIR® is the registered trademark of Health Level Seven International (HL7). Use of the FHIR trademark does not constitute an HL7 endorsement of this software.

## License

Copyright 2023 The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

### Notice

This (software/technical data) was produced for the U. S. Government under Contract Number 75FCMC18D0047, and is subject to Federal Acquisition Regulation Clause 52.227-14, Rights in Data-General.  

No other use other than that granted to the U. S. Government, or to those acting on behalf of the U. S. Government under that Clause is authorized without the express written permission of The MITRE Corporation. 

For further information, please contact The MITRE Corporation, Contracts Management Office, 7515 Colshire Drive, McLean, VA  22102-7539, (703) 983-6000.  

(c) 2023 The MITRE Corporation.

----

MITRE: Approved for Public Release / Case #23-1404
