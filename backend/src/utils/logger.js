/**
 * @module logger
 * @description Structured Winston logger with console and file transports.
 */

const winston = require('winston');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '../../logs');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'nudgeops-backend' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: logFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'audit.log'),
      level: 'info',
      format: logFormat,
      maxsize: 50 * 1024 * 1024,
      maxFiles: 20,
    }),
  ],
});

module.exports = logger;
