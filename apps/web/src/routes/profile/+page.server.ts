import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session.did) {
		redirect(302, `/profile/${locals.session.did}`);
	}
	redirect(302, '/');
};
