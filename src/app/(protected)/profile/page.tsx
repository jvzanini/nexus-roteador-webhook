import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ProfileContent } from "./profile-content";

export const metadata = {
  title: "Perfil | Nexus Roteador Webhook",
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <ProfileContent />;
}
