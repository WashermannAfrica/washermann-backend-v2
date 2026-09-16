import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { describeRequest, redact } from './audit-describe';

const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths that would be noise or recursive — never audited.
const SKIP_PATTERNS = [/^\/?audit-logs/, /^\/?notifications\/me/, /health/];

/**
 * Global interceptor that writes one audit row per mutating request from any
 * application. Runs after the handler (or on error), fire-and-forget, and never
 * affects the response. Rich, service-level events can also call
 * AuditService.record() directly for sharper wording.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const method: string = req.method;

    const routePath: string | undefined = req.route?.path;
    const rel = (routePath || req.originalUrl || '').replace(/^\/api\/v\d+/, '').split('?')[0];

    if (!AUDITED_METHODS.has(method) || SKIP_PATTERNS.some((re) => re.test(rel))) {
      return next.handle();
    }

    const res = context.switchToHttp().getResponse();

    const write = (statusCode: number, success: boolean) => {
      try {
        const user = req.user;
        const event = describeRequest({
          method,
          routePath,
          path: req.originalUrl ?? rel,
          params: req.params ?? {},
          body: req.body,
          actor: user ? { id: user.id ?? user.sub, name: user.fullName ?? null, roles: user.roles } : null,
          appHeader: req.headers?.['x-client-app'],
        });
        this.audit.record({
          ...event,
          method,
          path: (req.originalUrl ?? rel).slice(0, 500),
          statusCode,
          success,
          ip: (req.headers?.['x-forwarded-for']?.split(',')[0] ?? req.ip ?? '').slice(0, 64) || null,
          userAgent: (req.headers?.['user-agent'] ?? '').slice(0, 500) || null,
          metadata: this.safeMeta(req.body),
        });
      } catch (err) {
        this.logger.warn(`audit describe failed: ${(err as Error)?.message}`);
      }
    };

    return next.handle().pipe(
      tap(() => write(res.statusCode ?? 200, true)),
      catchError((err) => {
        const status = typeof err?.getStatus === 'function' ? err.getStatus() : err?.status ?? 500;
        write(status, false);
        return throwError(() => err);
      }),
    );
  }

  /** Redacted, size-bounded snapshot of the request body for the row's metadata. */
  private safeMeta(body: unknown): Record<string, unknown> | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return body != null && typeof body !== 'object' ? { value: redact(body) } : null;
    }
    const keys = Object.keys(body as Record<string, unknown>);
    if (keys.length === 0) return null;
    return redact(body) as Record<string, unknown>;
  }
}
