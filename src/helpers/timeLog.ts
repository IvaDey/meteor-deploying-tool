import chalk from 'chalk';
import moment from 'moment';

const getTimestamp = () => chalk.bold(`[${moment().format('YYYY-MM-DD HH:mm:ss')}]`);
export default (...args: unknown[]) => console.log(getTimestamp(), ...args);
