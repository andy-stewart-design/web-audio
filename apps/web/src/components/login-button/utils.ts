import type { Session } from '@/app';

interface ButtonProps {
	session: Session;
}

interface DialogProps {
	ref: HTMLDialogElement | undefined;
	handle: string;
	onsubmit: (e: SubmitEvent) => Promise<void>;
	loading: boolean;
	error: string | null;
}

type AuthenticatedSession = Extract<Session, { did: string }>;

interface PopoverProps {
	session: AuthenticatedSession;
	onlogout: () => Promise<void>;
}

async function getOAuthURL(handle: string) {
	const res = await fetch('/oauth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ handle })
	});

	if (!res.ok) {
		throw new Error('Invalid response returned from server');
	}

	const data = await res.json();
	const url = data.redirectUrl;

	if (typeof url !== 'string') {
		throw new Error(data.message || data.error || 'Login failed');
	}

	return url;
}

export { getOAuthURL, type ButtonProps, type DialogProps, type PopoverProps };
