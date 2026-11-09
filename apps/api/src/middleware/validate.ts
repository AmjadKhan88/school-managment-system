import { NextFunction, Request, Response } from 'express';
import { AnyZodObject } from 'zod';

type Source = 'body' | 'query' | 'params';
export const validate = (schema: AnyZodObject, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    (req as any)[source] = result.data;
    next();
  };
