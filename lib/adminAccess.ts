export const ADMIN_USER_ID = "b793a3a7-45f8-4711-90b9-a1f0ac5fb8b9";

export function isAdminUser(userId: string | null | undefined): boolean {
  return userId === ADMIN_USER_ID;
}
