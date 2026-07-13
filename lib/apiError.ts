import { NextResponse } from "next/server";

export function errorResponse(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export function unexpectedErrorResponse() {
  return errorResponse(500, "Une erreur inattendue est survenue.");
}
