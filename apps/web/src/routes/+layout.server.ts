import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		did: locals.did,
		handle: locals.handle,
		displayName: locals.displayName,
		avatar: locals.avatar
	};
};
