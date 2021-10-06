import chalk from 'chalk';
import { NodeSSH, SSHExecCommandResponse } from 'node-ssh';

export default async (sshConn: NodeSSH, command: string, errMessage?: string): Promise<SSHExecCommandResponse> => {
  const execRes = await sshConn.execCommand(command);
  if (execRes.code) {
    console.log(chalk.red(`Error! ${errMessage || ''}`));
    console.log(chalk.red(execRes.stderr));
    process.exit(1);
  }
  return execRes;
};
