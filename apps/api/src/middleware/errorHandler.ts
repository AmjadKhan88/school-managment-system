import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

export const notFound = (_req: Request, _res: Response, next: NextFunction) =>
  next(ApiError.notFound("Route not found"));

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err.flatten().fieldErrors,
    });
  }
  if (err instanceof ApiError) {
    return res
      .status(err.statusCode)
      .json({ success: false, message: err.message, errors: err.details });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002")
      return res.status(409).json({
        success: false,
        message: "A record with these details already exists",
      });
    if (err.code === "P2003")
      return res.status(409).json({
        success: false,
        message: "This record is linked to other data",
      });
    if (err.code === "P2025")
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });
  }
  console.error(err);
  res.status(500).json({
    success: false,
    message: "Something went wrong on our side",
    ...(env.NODE_ENV !== "production" && {
      debug: err instanceof Error ? err.message : String(err),
    }),
  });
};
