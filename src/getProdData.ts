import chalk from 'chalk';
import path from 'path';
import * as fs from 'fs';
import cp from 'child_process';
import { NodeSSH } from 'node-ssh';
import cliProgress from 'cli-progress';
import { execRemote, timeLog } from './helpers';
import { IDeployConfig } from './deploy';

export default function getProdData(): void {
  const currentPath = process.env.PWD!;
  const configPath = path.resolve(currentPath, 'deploy.config.js');

  if (!fs.existsSync(configPath)) {
    console.log(chalk.red(`Error! Config file not found.`));
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require,import/no-dynamic-require
  const deployConfig: IDeployConfig = require(configPath);

  timeLog('Connect to the server...');
  const sshConnection = new NodeSSH();
  sshConnection.connect({
    host: deployConfig.host,
    port: deployConfig.port,
    username: deployConfig.username,
    privateKey: fs.readFileSync(deployConfig.privateKey).toString(),
  })
    .then(async () => {
      timeLog(chalk.green('Connection Successfully!'));

      timeLog('Make dump...');
      execRemote(
        sshConnection,
        `mongodump --uri="${deployConfig.env.MONGO_URL}" --out="./${deployConfig.appName}-db-dump"`,
        'Failed to make mongo dump. Check your deploy.config.js file',
      );
      timeLog(chalk.green('Dumping Successfully!'));

      timeLog('Download dump...');
      try {
        const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        let progressTotal = 100;
        progress.start(progressTotal, 0);

        await sshConnection.getDirectory(
          path.resolve(currentPath, 'prod-db-dump'),
          `./${deployConfig.appName}-db-dump`,
          {
            transferOptions: {
              step: (totalTransferred: number, chunk: unknown, total: number) => {
                if (total !== progressTotal) {
                  progress.setTotal(total);
                  progressTotal = total;
                }
                progress.update(totalTransferred);
              },
            },
          },
        );
        progress.stop();
      } catch (err) {
        console.log(chalk.red('Failed to download dump'));
        console.log(chalk.red(err));
      }
      timeLog(chalk.green('Downloading Successfully!'));

      timeLog('Restore dump...');
      // await execRemote(`tar -xvf ${bundleName} > /dev/null`, 'Failed to unzip bundle');
      timeLog(chalk.green('Restoring Successfully!'));

      timeLog('Clean junk');
      // await execRemote(sshConnection, `rm -rf ./${deployConfig.appName}-db-dump`, 'Failed to clean junk');
      // fs.rmdirSync(path.resolve(currentPath, 'prod-db-dump'), { recursive: true });
      timeLog(chalk.green('Clean junk Successfully'));

      sshConnection.dispose();
      process.exit(0);
    })
    .catch((err) => {
      console.log(chalk.red('Error! Failed to connect to server.'));
      console.log(chalk.red(err));
      process.exit(1);
    });
}
