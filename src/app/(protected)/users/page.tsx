import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UsersContent } from "./users-content";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSuperAdmin) redirect("/dashboard");

  return <UsersContent />;
}
