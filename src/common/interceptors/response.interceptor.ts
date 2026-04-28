import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, StandardResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardResponse<T>> {
    return next.handle().pipe(
      map((payload) => {
        // If the handler already returns a structured response, pass it through
        if (
          payload &&
          typeof payload === 'object' &&
          'success' in payload &&
          'data' in payload
        ) {
          return payload;
        }

        // Wrap in standard envelope
        if (payload && typeof payload === 'object' && 'data' in payload) {
          // Destructure known keys; spread the rest (e.g. meta, total, page) so
          // paginated responses like { data: [...], meta: {...} } are preserved.
          const { data, message, ...rest } = payload as Record<string, unknown>;
          return {
            success: true,
            data: data !== undefined ? data : payload,
            ...(message && { message }),
            ...rest,
          };
        }

        return {
          success: true,
          data: payload,
        };
      }),
    );
  }
}
