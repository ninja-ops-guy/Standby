import { inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import { userRoles } from "@/db/schema";
import { getCurrentUser, type SafeUser } from "@/lib/auth";

export class OperatorAuthorizationError extends Error {
  constructor(message = "Operator authorization required.") {
    super(message);
    this.name = "OperatorAuthorizationError";
  }
}

export async function hasOperatorRole(userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      inArray(
        userRoles.role,
        ["operator", "admin"],
      ),
    );

  return rows.some((row) => row.id > 0) &&
    Boolean(
      await db
        .select({ id: userRoles.id })
        .from(userRoles)
        .where(eq(userRoles.userId, userId))
        .then((all) => all.some((r) => r.id > 0)),
    );
}

export async function requireOperatorUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new OperatorAuthorizationError("Authentication required.");

  const [role] = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id))
    .limit(10);

  if (!role || !["operator", "admin"].includes(role.role)) {
    throw new OperatorAuthorizationError();
  }

  return user;
}
