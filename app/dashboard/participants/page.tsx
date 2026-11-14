import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { ParticipantsPanel } from "@/app/dashboard/participants/panel";

export const dynamic = "force-dynamic";

export default async function ParticipantsPage() {
  const cookieStore = await cookies();
  if (!verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET)) {
    redirect("/dashboard");
  }

  return <ParticipantsPanel />;
}