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
        const { data, message } =
          payload && typeof payload === 'object' && 'data' in payload
            ? payload
            : { data: payload, message: undefined };

        return {
          success: true,
          data: data !== undefined ? data : payload,
          ...(message && { message }),
        };
      }),
    );
  }
}
