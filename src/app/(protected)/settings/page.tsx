import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SettingsContent } from "./settings-content";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== 'super_admin') redirect("/dashboard");

  return <SettingsContent />;
}
