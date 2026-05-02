import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type LoginPayload = {
  password?: string;
};

const ADMIN_COOKIE = "lexvibe_admin";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as LoginPayload;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD nije konfigurisan." },
      { status: 500 },
    );
  }

  if (!body.password || body.password !== expectedPassword) {
    return NextResponse.json({ error: "Pogresna lozinka." }, { status: 401 });
  }

  cookies().set({
    name: ADMIN_COOKIE,
    value: expectedPassword,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ ok: true });
}
