import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UsersContent } from "./users-content";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const platformRole = user.platformRole;

  // Apenas super_admin e admin têm acesso à página de usuários
  if (platformRole !== 'super_admin' && platformRole !== 'admin') {
    redirect("/dashboard");
  }

  return <UsersContent isSuperAdmin={platformRole === 'super_admin'} currentUserId={user.id} />;
}
