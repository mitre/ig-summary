#!/usr/bin/env node

import commander from 'commander';
import { getVersion } from './util/util';
import { diff } from './ig-summary-diff';
import { IgSummary } from './data-dictionary/IgSummary';
import path from 'path';

const program = new commander.Command();

program
    .name('ig-summary')
    .summary('summarize and compare FHIR Implementation Guides with the commands below')
    .description(
        `Summarize and compare FHIR Implementation Guides.
    
See https://github.com/mitre/ig-summary for details.`
    )
    .usage('[command] [options]')
    .version(getVersion());

program
    .command('create')
    .summary('create a summary of the IG in Excel and JSON format')
    .description(
        `Create a summary of the IG in Excel and JSON format.
    
See https://github.com/mitre/ig-summary for details.`
    )
    .usage('--input <path> --output <path> [options]')
    .requiredOption('--input <path>', 'path to FHIR Implementation Guide root folder')
    .requiredOption('--output <path>', 'path to folder where summary will be written')
    .addOption(
        new commander.Option('--log-level <level>', 'specify the level of log messages')
            .choices(['error', 'warn', 'info', 'debug'])
            .default('info')
    )
    .addOption(
        new commander.Option('--mode <mode>', 'include all elements or MustSupport only with "ms"')
            .choices(['ms', 'all'])
            .default('ms')
    )
    .option('--comparison <comparison>', 'path to JSON output from previous run to compare with')
    .option('--settings <settings>', 'path to settings .yaml file; see project README for details')
    .action((options, command) => {
        console.log(command.opts());
        const igSummary = new IgSummary({
            igDir: options.input,
            outputDir: options.output,
            logLevel: options.logLevel,
            comparisonPath: options.comparison,
            settingsPath: options.settings,
            mode: options.mode
        });
        igSummary.generateSpreadsheet();
    });

program
    .command('diff')
    .summary(
        'create a comparison ("diff") of the output of two different runs of the "create" command'
    )
    .description(
        `Create a comparison ("diff") of the output of two different runs of the "create" command.
    
See https://github.com/mitre/ig-summary for details.`
    )
    .usage('--a /path/to/a.json --b /path/to/b.json --output /path/to/output/ [options]')
    .requiredOption('--a <a>', 'path to file a')
    .requiredOption('--b <b>', 'path to file b')
    .requiredOption('--output <path>', 'output path')
    .option('--settings <path>', 'path to settings .yaml file; see project README for details')
    .action((options, command) => {
        console.log(command.opts());
        diff(
            path.resolve(options.a),
            path.resolve(options.b),
            path.resolve(options.output),
            path.resolve(options.settings)
        );
    });

program.parse();
