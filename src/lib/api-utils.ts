import { NextResponse } from 'next/server';

/**
 * Create a standardized error response for API routes
 * 
 * @param error - The error object or unknown value
 * @param status - HTTP status code (default: 500)
 * @returns NextResponse with error message
 */
export function errorResponse(error: unknown, status: number = 500): NextResponse {
  const message = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json({ error: message }, { status });
}

/**
 * Create a standardized success response for API routes
 * 
 * @param data - The data to return
 * @param status - HTTP status code (default: 200)
 * @returns NextResponse with data
 */
export function successResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}
