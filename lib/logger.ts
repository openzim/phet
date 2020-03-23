import * as path from 'path';
import {createLogger, transports, format} from 'winston';


export const log = createLogger({
  transports: [
    new transports.Console({
      level: 'debug',
      format: format.combine(
        format.colorize(),
        format.timestamp(),
        format.align(),
        format.printf((info) => {
          const {
            timestamp, level, message, ...args
          } = info;

          const ts = timestamp.slice(0, 19).replace('T', ' ');
          return `${ts} [${level}]: ${message} ${Object.keys(args).length ? JSON.stringify(args, null, 2) : ''}`;
        }),
      )
    }),
    new transports.File({
      filename: path.join(__dirname, '../stderr.log'),
      format: format.combine(
        format.cli(),
        format.timestamp(),
        format.uncolorize(),
        format.errors({ stack: true }),
        format.metadata(),
        format.align()
      )
    })
  ]
});
