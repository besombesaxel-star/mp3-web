export async function broadcastToChannel(topic: string, event: string, payload: unknown): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({
      messages: [{ topic, event, payload }],
    }),
  }).catch(() => {});
}

export async function broadcastToUser(userId: string, event: string, payload: unknown): Promise<void> {
  return broadcastToChannel(`user:${userId}`, event, payload);
}
