import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  API_PREFIX,
  AUTH_SEGMENT,
  VERSION_REGEX,
  WRITE_METHODS,
} from '../constants';

@Injectable()
export class SelectiveThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (await super.shouldSkip(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (!request) {
      return false;
    }

    const method = (request.method ?? 'GET').toUpperCase();
    if (WRITE_METHODS.has(method)) {
      return false;
    }

    return !this.isAuthRoute(request);
  }

  private isAuthRoute(req: Request): boolean {
    const [firstSegment] = this.extractRelevantSegments(req);
    return firstSegment === AUTH_SEGMENT;
  }

  private extractRelevantSegments(req: Request): string[] {
    const rawPath = (req.originalUrl ?? req.url ?? '')
      .split('?')[0]
      .toLowerCase();
    const segments = rawPath.split('/').filter(Boolean);

    let start = 0;

    if (segments[start] === API_PREFIX) {
      start += 1;
    }

    if (segments[start] && VERSION_REGEX.test(segments[start])) {
      start += 1;
    }

    return segments.slice(start);
  }
}
