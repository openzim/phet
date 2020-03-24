import * as v8 from "v8"
import {log} from "./logger"
import * as config from "../config"

export default (stage) => {
    log.info(`Node ${process.version}`);
    log.info(`Heap size: ${Math.floor(v8.getHeapStatistics().total_available_size / 1024 / 1024)} Mb`);
    log.info(`Worker threads: ${config.workers}`);
    log.info(`RPS: ${config.rps}`);
    log.info(`Starting ${stage.toUpperCase()} stage...`);
};
