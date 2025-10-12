import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { Response } from 'express';

/**
 * Global exception filter for handling Prisma database errors
 *
 * @remarks
 * This filter catches PrismaClientKnownRequestError exceptions and transforms them into
 * appropriate HTTP responses with user-friendly error messages. It maps Prisma error codes
 * to corresponding HTTP status codes and provides meaningful error messages.
 *
 * @implements {ExceptionFilter}
 *
 * @example
 * // Basic usage in a NestJS application
 * @UseFilters(new PrismaExceptionFilter())
 * export class AppModule {}
 *
 * @example
 * // Using with a specific controller
 * @Controller('users')
 * @UseFilters(PrismaExceptionFilter)
 * export class UsersController {}
 */
@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  /**
   * Maps Prisma error codes to HTTP status codes
   * @private
   */
  private readonly errorStatusMap: Record<string, HttpStatus> = {
    P2000: HttpStatus.BAD_REQUEST, // Value too long for column
    P2001: HttpStatus.NOT_FOUND, // Record not found for where
    P2002: HttpStatus.CONFLICT, // Unique constraint violation
    P2003: HttpStatus.BAD_REQUEST, // Foreign key constraint failed
    P2004: HttpStatus.BAD_REQUEST, // Database constraint failed
    P2005: HttpStatus.BAD_REQUEST, // Invalid value for column
    P2006: HttpStatus.BAD_REQUEST, // Invalid type for column
    P2007: HttpStatus.BAD_REQUEST, // Data validation error
    P2008: HttpStatus.INTERNAL_SERVER_ERROR, // Query parsing error
    P2009: HttpStatus.INTERNAL_SERVER_ERROR, // Query validation error
    P2010: HttpStatus.INTERNAL_SERVER_ERROR, // Raw query failed
    P2011: HttpStatus.BAD_REQUEST, // Null constraint violation
    P2012: HttpStatus.BAD_REQUEST, // Missing required value
    P2013: HttpStatus.BAD_REQUEST, // Missing required argument
    P2014: HttpStatus.BAD_REQUEST, // Invalid relation
    P2015: HttpStatus.NOT_FOUND, // Related record not found
    P2016: HttpStatus.INTERNAL_SERVER_ERROR,
    P2017: HttpStatus.BAD_REQUEST,
    P2018: HttpStatus.BAD_REQUEST,
    P2019: HttpStatus.BAD_REQUEST,
    P2020: HttpStatus.BAD_REQUEST,
    P2021: HttpStatus.NOT_FOUND,
    P2022: HttpStatus.BAD_REQUEST,
    P2023: HttpStatus.BAD_REQUEST,
    P2024: HttpStatus.BAD_REQUEST,
    P2025: HttpStatus.NOT_FOUND, // Record to delete/update not found
  };

  /**
   * Maps Prisma error codes to human-readable error messages
   * @private
   */
  private readonly errorMessages: Record<
    string,
    (error: PrismaClientKnownRequestError) => string
  > = {
    P2000: () => 'Input value is too long for the field.',
    P2001: () => 'Record not found.',
    P2002: (error) => {
      const fields = Array.isArray(error.meta?.target)
        ? error.meta.target.join(', ')
        : (error.meta?.target ?? 'unknown');
      if (error.meta?.modelName === 'ProcessedStripeWebhook') {
        return `This Stripe session has already been processed (${fields}).`;
      }
      return `Duplicate value for field(s): ${fields}`;
    },
    P2003: (error) =>
      `Foreign key constraint failed on field: ${error.meta?.field_name ?? 'unknown'}`,
    P2004: () => 'A database constraint failed to execute.',
    P2005: (error) =>
      `Invalid value provided for field: ${error.meta?.field_name ?? 'unknown'}`,
    P2006: (error) =>
      `Invalid type provided for field: ${error.meta?.field_name ?? 'unknown'}`,
    P2007: () => 'Data validation error.',
    P2008: () => 'Query parsing error.',
    P2009: () => 'Query validation error.',
    P2010: () => 'Raw query execution failed.',
    P2011: (error) =>
      `Null constraint violation on field: ${error.meta?.field_name ?? 'unknown'}`,
    P2012: (error) =>
      `Missing required value for field: ${error.meta?.field_name ?? 'unknown'}`,
    P2013: () => 'Missing required argument.',
    P2014: (error) =>
      `Invalid relation in field: ${error.meta?.field_name ?? 'unknown'}`,
    P2015: () => 'Related record not found.',
    P2025: () => 'Record to update or delete does not exist.',
  };

  /**
   * Handles PrismaClientKnownRequestError exceptions
   *
   * @param {PrismaClientKnownRequestError} exception - The caught Prisma exception
   * @param {ArgumentsHost} host - The arguments host
   * @returns {void}
   *
   * @example
   * // This method is automatically called by NestJS when a Prisma error occurs
   */
  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getStatusCode(exception.code);
    const message = this.getErrorMessage(exception);

    if (!this.errorStatusMap[exception.code]) {
      this.logger.error(
        `⚠️ Unhandled Prisma error code: ${exception.code}`,
        exception,
      );
    }

    response.status(status).json({
      status: 'error',
      message,
      error: exception.name,
      statusCode: status,
      path: request.url,
    });
  }

  /**
   * Gets the appropriate HTTP status code for a given Prisma error code
   *
   * @private
   * @param {string} code - The Prisma error code (e.g., 'P2002')
   * @returns {HttpStatus} The corresponding HTTP status code
   */
  private getStatusCode(code: string): HttpStatus {
    return this.errorStatusMap[code] || HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /**
   * Gets a user-friendly error message for a given Prisma error
   *
   * @private
   * @param {PrismaClientKnownRequestError} error - The Prisma error
   * @returns {string} A human-readable error message
   */
  private getErrorMessage(error: PrismaClientKnownRequestError): string {
    const messageFn =
      this.errorMessages[error.code] ||
      (() => `Unexpected database error: ${error.message}`);
    return messageFn(error);
  }
}
