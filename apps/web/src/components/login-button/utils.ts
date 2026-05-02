import { computePosition, flip, offset, shift } from '@floating-ui/dom';

// PROP TYPES --------------------------------------------------------------------

type ButtonProps =
	| { did: null; handle: null; displayName: null; avatar: null }
	| { did: string; handle: string; displayName: string | null; avatar: string | null };

interface DialogProps {
	ref: HTMLDialogElement | undefined;
	handle: string;
	onsubmit: (e: SubmitEvent) => Promise<void>;
	loading: boolean;
	error: string | null;
}

interface PopoverProps {
	ref?: HTMLDivElement;
	isOpen?: boolean;
	trigger: HTMLButtonElement | undefined;
	displayName: string | null;
	handle: string;
	onlogout: () => void;
}

// LOGIN BUTTON --------------------------------------------------------------------

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

// POPOVER --------------------------------------------------------------------

async function updatePosition(popover?: HTMLElement, trigger?: HTMLElement) {
	if (!trigger || !popover) return;
	const { x, y } = await computePosition(trigger, popover, {
		placement: 'bottom-end',
		strategy: 'fixed',
		middleware: [offset(8), flip(), shift({ padding: 8 })]
	});
	popover.style.left = `${x}px`;
	popover.style.top = `${y}px`;
}

const supportsPopover =
	typeof HTMLElement !== 'undefined' &&
	typeof (HTMLElement.prototype as unknown as { showPopover?: unknown }).showPopover === 'function';

export {
	getOAuthURL,
	supportsPopover,
	updatePosition,
	type ButtonProps,
	type DialogProps,
	type PopoverProps
};
