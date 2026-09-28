import { redirect } from "next/navigation";
import { currentAdmin, currentUser, pendingAdmin } from "./session";

/** For server components: send logged-out visitors to the login page. */
export async function userOrLogin() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function adminOrLogin(role: "ADMIN" | "SUPER_ADMIN" = "ADMIN") {
  const a = await currentAdmin();
  if (!a) {
    if (await pendingAdmin()) redirect("/admin/2fa");
    redirect("/admin/login");
  }
  if (role === "SUPER_ADMIN" && a.role !== "SUPER_ADMIN") redirect("/admin");
  return a;
}
