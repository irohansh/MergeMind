export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string | undefined;
  context?: Record<string, any> | undefined;
}

export class StructuredLogger {
  private correlationId?: string | undefined;

  constructor(correlationId?: string | undefined) {
    this.correlationId = correlationId;
  }

  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    const entry: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: this.correlationId,
      context,
    };
    const json = JSON.stringify(entry);

    if (level === 'error') {
      console.error(json);
    } else if (level === 'warn') {
      console.warn(json);
    } else {
      console.log(json);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, any>): void {
    this.log('error', message, context);
  }
}

export const logger = new StructuredLogger();
