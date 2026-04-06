import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UsersContent } from "./users-content";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Super admin tem acesso direto
  if (user.isSuperAdmin) {
    return <UsersContent isSuperAdmin currentUserId={user.id} />;
  }

  // Verificar se o usuario e company_admin em alguma empresa
  const adminMembership = await prisma.userCompanyMembership.findFirst({
    where: { userId: user.id, role: "company_admin", isActive: true },
  });

  if (!adminMembership) {
    redirect("/dashboard");
  }

  return <UsersContent isSuperAdmin={false} currentUserId={user.id} />;
}
