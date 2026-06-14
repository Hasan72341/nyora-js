/**
 * Nyora SDK exceptions.
 *
 * Defines the error hierarchy thrown across the SDK. {@link NyoraError} is the
 * common base; runtime, helper-discovery, and helper HTTP failures each have a
 * dedicated subclass so callers can catch them selectively.
 *
 * @packageDocumentation
 */

/** Base error for Nyora SDK failures. */
export class NyoraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NyoraError";
  }
}

/** Thrown when the embedded parser runtime fails. */
export class ParserRuntimeError extends NyoraError {
  constructor(message: string) {
    super(message);
    this.name = "ParserRuntimeError";
  }
}

/** Thrown when no running helper can be discovered. */
export class HelperNotFoundError extends NyoraError {
  constructor(message: string) {
    super(message);
    this.name = "HelperNotFoundError";
  }
}

/**
 * Thrown when a helper returns a non-successful HTTP response.
 */
export class NyoraHTTPError extends NyoraError {
  /** The HTTP status code returned by the helper (>= 400). */
  readonly statusCode: number;
  /** The raw response body, when available. */
  readonly body: string;

  constructor(statusCode: number, message: string, body = "") {
    super(`Nyora helper returned HTTP ${statusCode}: ${message}`);
    this.name = "NyoraHTTPError";
    this.statusCode = statusCode;
    this.body = body;
  }
}
