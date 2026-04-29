import { json } from '@sveltejs/kit';
import { getOAuthClient } from '$lib/server/auth/client';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
  const did = cookies.get('did');

  try {
    if (did) {
      const client = await getOAuthClient();
      await client.revoke(did);
    }
  } catch (e) {
    console.error('Logout error:', e);
  } finally {
    cookies.delete('did', { path: '/' });
  }

  return json({ success: true });
};
