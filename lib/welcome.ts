import * as v8 from 'v8';
import {log} from './logger';

export default (stage) => {
    log.info(`Node ${process.version}`);
    log.info(`Heap size: ${Math.floor(v8.getHeapStatistics().total_available_size / 1024 / 1024)} Mb`);
    log.info(`RPS: ${process.env.PHET_RPS ? parseInt(process.env.PHET_RPS, 10) : 8}`);
    log.info(`Transform workers: ${process.env.PHET_WORKERS ? parseInt(process.env.PHET_WORKERS, 10) : 8}`);
    log.info(`Starting ${stage.toUpperCase()} stage...`);
};
