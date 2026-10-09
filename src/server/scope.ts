import type { Admin, Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { prisma } from "./db";
import { AppError } from "./errors";

/**
 * Who sees which customer. Super admins see everyone. An admin sees only the
 * customers tagged to them (their invite code, or moved to them); customers
 * without an admin are the house's and only super admins see them.
 * Anything outside an admin's reach answers "not found", never "forbidden",
 * so nobody can tell whether it exists.
 */
export type Viewer = Pick<Admin, "id" | "role">;

export const isSuper = (v: Viewer) => v.role === "SUPER_ADMIN";

/** For queries on users. */
export const userScope = (v: Viewer): Prisma.UserWhereInput => (isSuper(v) ? {} : { adminId: v.id });

/** For queries on anything that belongs to a customer (orders, KYC, payout methods, wallets, support). */
export const ownedScope = (v: Viewer): { user?: Prisma.UserWhereInput } => (isSuper(v) ? {} : { user: { adminId: v.id } });

export const NOT_FOUND = () => new AppError("Not found", 404, "NOT_FOUND");

export async function canSeeUser(v: Viewer, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return isSuper(v);
  if (isSuper(v)) return true;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { adminId: true } });
  return !!u && u.adminId === v.id;
}

/** API routes: throws 404 unless the viewer may see this customer. */
export async function assertUser(v: Viewer, userId: string | null | undefined) {
  if (!(await canSeeUser(v, userId))) throw NOT_FOUND();
}

async function ownerOf(model: "order" | "kycSubmission" | "payoutMethod" | "supportMessage", id: string): Promise<string | null | undefined> {
  const args = { where: { id }, select: { userId: true } } as const;
  const row =
    model === "order" ? await prisma.order.findUnique(args)
    : model === "kycSubmission" ? await prisma.kycSubmission.findUnique(args)
    : model === "payoutMethod" ? await prisma.payoutMethod.findUnique(args)
    : await prisma.supportMessage.findUnique(args);
  return row === null ? undefined : row.userId;
}

/** API routes: throws 404 unless the record exists and belongs to a customer the viewer may see. */
export async function assertOwned(v: Viewer, model: Parameters<typeof ownerOf>[0], id: string) {
  const userId = await ownerOf(model, id);
  if (userId === undefined) throw NOT_FOUND();
  await assertUser(v, userId);
}

/** Pages: shows the 404 page unless the viewer may see this customer. */
export async function pageUser(v: Viewer, userId: string | null | undefined) {
  if (!(await canSeeUser(v, userId))) notFound();
}

/** Super-admin-only pages and routes that admins shouldn't even know about. */
export function superOnly(v: Viewer) {
  if (!isSuper(v)) throw NOT_FOUND();
}
