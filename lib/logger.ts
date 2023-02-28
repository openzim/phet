import * as path from 'path'
import { createLogger, transports, format } from 'winston'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const logFormat = () => {
  const formatter = (info) => {
    const ts = info.timestamp.slice(0, 19).replace('T', ' ')
    return `${ts} [${info.level}]: ${info.message} ${info instanceof Error ? `\n\n${info.stack}\n` : ''}`
  }
  return format.combine(format.colorize(), format.timestamp(), format.align(), format.printf(formatter))
}

export const log = createLogger({
  format: logFormat(),
  transports: [
    new transports.Console({ level: 'debug' }),
    new transports.File({
      filename: path.join(__dirname, '../stderr.log'),
      format: format.combine(logFormat(), format.uncolorize()),
    }),
  ],
})
