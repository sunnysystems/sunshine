/**
 * Error handling utilities for Cost Guard
 */

export class ServiceMappingError extends Error {
  constructor(message: string, public serviceKey?: string) {
    super(message);
    this.name = 'ServiceMappingError';
  }
}

export class DataExtractionError extends Error {
  constructor(message: string, public serviceKey?: string, public cause?: Error) {
    super(message);
    this.name = 'DataExtractionError';
    if (cause) {
      this.cause = cause;
    }
  }
}

export class ServiceProcessingError extends Error {
  constructor(message: string, public serviceKey?: string, public cause?: Error) {
    super(message);
    this.name = 'ServiceProcessingError';
    if (cause) {
      this.cause = cause;
    }
  }
}

