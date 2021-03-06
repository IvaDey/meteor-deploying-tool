#! /usr/bin/env node
import { Command, Argument } from 'commander';
import deploy from './deploy';
import getProdData from './getProdData';

const program = new Command();

// eslint-disable-next-line @typescript-eslint/no-var-requires
program.version(require('../package.json').version);

program
  .command('deploy')
  .addArgument(new Argument('[deployType]', 'Specify bump type').choices(['prerelease', 'patch', 'minor', 'major']))
  .description('Run build and deploying app')
  .action(deploy);

program
  .command('getData')
  .description('Get productive mongo dump and restore to local')
  .action(getProdData);

program.parse(process.argv);
