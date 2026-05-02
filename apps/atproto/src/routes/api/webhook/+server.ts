import { json, error } from '@sveltejs/kit';
import { parseTapEvent, assureAdminAuth } from '@atproto/tap';
import { AtUri } from '@atproto/syntax';
import { upsertAccount, insertStatus, deleteStatus, deleteAccount } from '$lib/server/db/queries';
import * as xyz from '$lexicons/xyz';
import type { RequestHandler } from './$types';

const TAP_ADMIN_PASSWORD = process.env.TAP_ADMIN_PASSWORD;

export const POST: RequestHandler = async ({ request }) => {
	if (TAP_ADMIN_PASSWORD) {
		const authHeader = request.headers.get('Authorization');
		if (!authHeader) error(401, 'Unauthorized');
		try {
			assureAdminAuth(TAP_ADMIN_PASSWORD, authHeader);
		} catch {
			error(401, 'Unauthorized');
		}
	}

	const body = await request.json();
	const evt = parseTapEvent(body);

	if (evt.type === 'identity') {
		if (evt.status === 'deleted') {
			await deleteAccount(evt.did);
		} else {
			await upsertAccount({
				did: evt.did,
				handle: evt.handle,
				active: evt.isActive ? 1 : 0
			});
		}
	}

	if (evt.type === 'record') {
		const uri = AtUri.make(evt.did, evt.collection, evt.rkey);

		if (evt.action === 'create' || evt.action === 'update') {
			let record: xyz.statusphere.status.Main;
			try {
				record = xyz.statusphere.status.$parse(evt.record);
			} catch {
				return json({ success: false });
			}

			await insertStatus({
				uri: uri.toString(),
				authorDid: evt.did,
				status: record.status,
				createdAt: record.createdAt,
				indexedAt: new Date().toISOString(),
				current: 1
			});
		} else if (evt.action === 'delete') {
			await deleteStatus(uri);
		}
	}

	return json({ success: true });
};
