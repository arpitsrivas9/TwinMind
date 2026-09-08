type LogLevel = 'info' | 'warn' | 'error';

const formatMessage = (level: LogLevel, message: string, meta?: Record<string, unknown>) => ({
  level,
  message,
  timestamp: new Date().toISOString(),
  ...(meta ? { meta } : {}),
});

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(JSON.stringify(formatMessage('info', message, meta)));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(JSON.stringify(formatMessage('warn', message, meta)));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(JSON.stringify(formatMessage('error', message, meta)));
  },
};
