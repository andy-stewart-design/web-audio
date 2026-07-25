import {
	autoUpdate,
	computePosition,
	flip,
	offset as offsetMiddleware,
	shift
} from '@floating-ui/dom';
import type { PositioningOptions } from './types';

const focusableSelector = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

function isPopoverOpen(node: HTMLElement) {
	return node.matches(':popover-open');
}

function getFirstFocusable(node: HTMLElement) {
	return Array.from(node.querySelectorAll<HTMLElement>(focusableSelector)).find((candidate) => {
		const styles = getComputedStyle(candidate);
		return !candidate.hidden && styles.display !== 'none' && styles.visibility !== 'hidden';
	});
}

function setPopoverOpen(node: HTMLElement, open: boolean) {
	const nativeOpen = isPopoverOpen(node);
	if (open && !nativeOpen) node.showPopover();
	else if (!open && nativeOpen) node.hidePopover();
}

function startPositioning(
	reference: HTMLElement,
	floating: HTMLElement,
	{ placement, offset, collisionPadding, onPlacementChange }: PositioningOptions
) {
	let active = true;

	const updatePosition = async () => {
		const position = await computePosition(reference, floating, {
			placement,
			strategy: 'fixed',
			middleware: [offsetMiddleware(offset), flip(), shift({ padding: collisionPadding })]
		});
		if (!active) return;

		floating.style.left = `${position.x}px`;
		floating.style.top = `${position.y}px`;
		floating.style.opacity = '1';
		floating.style.pointerEvents = '';
		onPlacementChange(position.placement);
	};

	const cleanup = autoUpdate(reference, floating, updatePosition);

	return () => {
		active = false;
		cleanup();
	};
}

export { getFirstFocusable, isPopoverOpen, setPopoverOpen, startPositioning };
