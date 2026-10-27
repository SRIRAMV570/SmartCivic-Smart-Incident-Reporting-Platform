import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/auth/session";

export const instant = false;

export default async function HomePage() {
  const cookieStore = await cookies();
  const session =
    process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32
      ? await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)
      : null;

  if (!session) {
    redirect("/login");
  }

  redirect(session.role === "admin" ? "/admin" : "/civic");
}
