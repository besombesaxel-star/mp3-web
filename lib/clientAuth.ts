export function createAuthorizedHeaders(accessToken: string | null, init?: HeadersInit) {
  const headers = new Headers(init);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return headers;
}
