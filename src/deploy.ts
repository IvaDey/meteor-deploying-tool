import chalk from 'chalk';
import path from 'path';
import * as fs from 'fs';
import cp from 'child_process';
import { NodeSSH } from 'node-ssh';
import cliProgress from 'cli-progress';
import { timeLog, execRemote } from './helpers';

export enum DeployType {
  prerelease,
  patch,
  minor,
  major,
}

export interface IDeployConfig {
  host: string,
  username: string,
  port: number,
  privateKey: string,

  appName: string,
  logPath: string,

  buildLocation: string,

  env: {
    [key: string]: string | number | boolean,
  }
}

export default function deploy(deployType?: DeployType): void {
  if (deployType) cp.execSync(`npm version ${deployType}`);

  const currentPath = process.env.PWD!;
  const configPath = path.resolve(currentPath, 'deploy.config.js');
  const packageJsonPath = path.resolve(currentPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    console.log(chalk.red(`Error! package.json not found.`));
    process.exit(1);
  }

  if (!fs.existsSync(configPath)) {
    console.log(chalk.red(`Error! Config file not found.`));
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require,import/no-dynamic-require
  const packageJson = require(packageJsonPath);
  // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require,import/no-dynamic-require
  const deployConfig: IDeployConfig = require(configPath);

  if (!deployConfig.buildLocation) {
    console.log(chalk.red(`Error! Missing build location path.`));
    process.exit(1);
  }

  const buildLocation = path.resolve(currentPath, deployConfig.buildLocation, String(Date.now()));
  const bundleName = `${currentPath.split('/').pop()}.tar.gz`;
  const bundlePath = path.resolve(buildLocation, bundleName);

  timeLog('Starting Build...');
  cp.execSync(`meteor build ${buildLocation}`);
  timeLog(chalk.green('Build Successfully!'));

  timeLog('Generating config files...');
  const bundlePackage = {
    name: packageJson.name,
    version: packageJson.version,
  };
  fs.writeFileSync(`${buildLocation}/package.json`, JSON.stringify(bundlePackage));

  const pm2Config = {
    apps: [{
      name: deployConfig.appName,
      script: 'main.js',
      watch: '.',
      env: deployConfig.env,
      log_file: deployConfig.logPath,
      time: true,
    }],
  };
  fs.writeFileSync(`${buildLocation}/pm2.config.js`, `module.exports = ${JSON.stringify(pm2Config)}`);
  timeLog(chalk.green('Generating config files Successfully!'));

  const sshConnection = new NodeSSH();
  sshConnection.connect({
    host: deployConfig.host,
    port: deployConfig.port,
    username: deployConfig.username,
    privateKey: fs.readFileSync(deployConfig.privateKey).toString(),
  })
    .then(async () => {
      timeLog('Upload bundle files to the server...');
      try {
        const progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        let progressTotal = 100;
        progress.start(progressTotal, 0);

        await sshConnection.putFiles([
          { local: bundlePath, remote: bundleName },
          { local: `${buildLocation}/package.json`, remote: 'package.json' },
          { local: `${buildLocation}/pm2.config.js`, remote: 'pm2.config.js' },
        ], {
          transferOptions: {
            step: (totalTransferred: number, chunk: unknown, total: number) => {
              if (total !== progressTotal) {
                progress.setTotal(total);
                progressTotal = total;
              }
              progress.update(totalTransferred);
            },
          },
        });
        progress.stop();
      } catch (err) {
        console.log(chalk.red('Failed to upload bundle files'));
        console.log(chalk.red(err));
      }
      timeLog(chalk.green('Upload Successfully!'));

      timeLog('Unzip bundle...');
      await execRemote(sshConnection, `tar -xvf ${bundleName} > /dev/null`, 'Failed to unzip bundle');
      timeLog(chalk.green('Unzipping Successfully!'));

      timeLog('Install modules...');
      await execRemote(
        sshConnection,
        'cd bundle/programs/server && npm install > /dev/null && cd ../../',
        'Failed to install modules',
      );
      timeLog(chalk.green('Installation Successfully!'));

      timeLog('Rerun app...');
      await execRemote(sshConnection, 'mv package.json ./bundle', 'Failed to rerun app');
      await execRemote(sshConnection, 'mv pm2.config.js ./bundle', 'Failed to rerun app');
      await execRemote(sshConnection, `pm2 stop ${deployConfig.appName} && pm2 delete ${deployConfig.appName}`, 'Failed to rerun app');
      await execRemote(sshConnection, `mv ${deployConfig.appName}-app ___`, 'Failed to rerun app');
      await execRemote(sshConnection, `mv bundle ${deployConfig.appName}-app`, 'Failed to rerun app');
      await execRemote(sshConnection, `cd ${deployConfig.appName}-app && pm2 start pm2.config.js && cd ..`, 'Failed to rerun app');
      timeLog(chalk.green('App rerun Successfully'));

      timeLog('Clean junk');
      await execRemote(sshConnection, `rm ${bundleName} && rm -rf ___`, 'Failed to clean junk');
      fs.rmdirSync(buildLocation, { recursive: true });
      timeLog(chalk.green('Clean junk Successfully'));

      // todo: add info about deploying duration

      sshConnection.dispose();
      process.exit(0);
    })
    .catch((err) => {
      console.log(chalk.red('Error! Failed to connect to server.'));
      console.log(chalk.red(err));
      process.exit(1);
    });
}
