import { and, eq, inArray } from "drizzle-orm";
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
      and(
        eq(userRoles.userId, userId),
        inArray(userRoles.role, ["operator", "admin"]),
      ),
    )
    .limit(1);

  return Boolean(rows[0]);
}

export async function requireOperatorUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new OperatorAuthorizationError("Authentication required.");

  if (!(await hasOperatorRole(user.id))) {
    throw new OperatorAuthorizationError();
  }

  return user;
}
