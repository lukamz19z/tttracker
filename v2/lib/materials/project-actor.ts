export function materialActorUserId(context: unknown): string | null {
  const value = context as {
    user?: { id?: string | null } | null;
    authUser?: { id?: string | null } | null;
    userId?: string | null;
    authUserId?: string | null;
    workspace?: {
      user?: { id?: string | null } | null;
      authUser?: { id?: string | null } | null;
      userId?: string | null;
      authUserId?: string | null;
    } | null;
  };

  return (
    value.user?.id ??
    value.authUser?.id ??
    value.userId ??
    value.authUserId ??
    value.workspace?.user?.id ??
    value.workspace?.authUser?.id ??
    value.workspace?.userId ??
    value.workspace?.authUserId ??
    null
  );
}

export function requireReturnedId(
  row: { id?: string | null } | null | undefined,
  operation: string,
): string {
  const id = row?.id;
  if (!id) {
    throw new Error(`${operation} succeeded without returning an ID.`);
  }
  return id;
}
