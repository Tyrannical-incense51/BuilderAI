type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const IS_DEV = process.env.NODE_ENV !== 'production'
const MIN_LEVEL = IS_DEV ? 'debug' : 'warn'

interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>) => void
}

/**
 * Create a structured logger for a specific module.
 *
 * In dev: readable colored output
 * In prod: JSON lines
 */
export function createLogger(module: string): Logger {
  function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    if (LOG_LEVELS[level] < LOG_LEVELS[MIN_LEVEL]) return

    if (IS_DEV) {
      // Readable format for development
      const prefix = `[${level.toUpperCase()}] [${module}]`
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
      if (data && Object.keys(data).length > 0) {
        fn(prefix, message, data)
      } else {
        fn(prefix, message)
      }
    } else {
      // JSON format for production
      const entry = {
        ts: new Date().toISOString(),
        level,
        module,
        msg: message,
        ...(data || {}),
      }
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
      fn(JSON.stringify(entry))
    }
  }

  return {
    debug: (msg, data?) => log('debug', msg, data),
    info: (msg, data?) => log('info', msg, data),
    warn: (msg, data?) => log('warn', msg, data),
    error: (msg, data?) => log('error', msg, data),
  }
}
