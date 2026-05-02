interface Props {
	did: string | null;
	handle: string | null;
	displayName: string | null;
	avatar: string | null;
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

export { getOAuthURL, type Props };
