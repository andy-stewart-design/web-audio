import { getSession } from '$lib/server/auth/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
  const session = await getSession(cookies);
  return { did: session?.did ?? null };
};
