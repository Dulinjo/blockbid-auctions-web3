import { NextResponse } from "next/server";

const ADMIN_COOKIE = "lexvibe_admin";

export async function POST(): Promise<Response> {
  const response = NextResponse.json({ status: "ok" });
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
