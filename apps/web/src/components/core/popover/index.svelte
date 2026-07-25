<script lang="ts">
	import { dev } from '$app/environment';
	import { getFirstFocusable, isPopoverOpen, setPopoverOpen, startPositioning } from './utils';
	import type { Placement } from '@floating-ui/dom';
	import type { PopoverAction, Props, TriggerAction } from './types';

	const uid = $props.id();
	const generatedId = `popover-${uid}`;

	let {
		ariaLabel,
		id = generatedId,
		role = 'dialog',
		placement = 'bottom-end',
		offset = 8,
		collisionPadding = 8,
		open = $bindable(false),
		trigger: triggerSnippet,
		content
	}: Props = $props();

	let triggerElement = $state<HTMLButtonElement>();
	let popoverElement = $state<HTMLElement>();
	let initialFocusElement: HTMLElement | undefined;
	let restoreFocusOnClose = false;
	let resolvedPlacement = $state<Placement>();

	function focusPopover(node: HTMLElement) {
		const explicitTarget =
			initialFocusElement && node.contains(initialFocusElement) ? initialFocusElement : undefined;
		const target = explicitTarget ?? getFirstFocusable(node) ?? node;
		target.focus();
	}

	function restoreTriggerFocus() {
		if (restoreFocusOnClose && triggerElement?.isConnected) triggerElement.focus();
		restoreFocusOnClose = false;
	}

	const trigger: TriggerAction = (node) => {
		if (dev && triggerElement && triggerElement !== node) {
			console.warn('Popover received more than one live trigger element.');
		}
		triggerElement = node;

		return {
			destroy() {
				if (triggerElement === node) triggerElement = undefined;
			}
		};
	};

	const popover: PopoverAction = (node) => {
		if (dev && popoverElement && popoverElement !== node) {
			console.warn('Popover received more than one live panel element.');
		}
		popoverElement = node;

		const handleToggle = (event: ToggleEvent) => {
			const isOpen = event.newState === 'open';
			open = isOpen;

			if (isOpen) {
				restoreFocusOnClose = false;
				focusPopover(node);
			} else {
				restoreTriggerFocus();
			}
		};
		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && isPopoverOpen(node)) restoreFocusOnClose = true;
		};
		node.addEventListener('toggle', handleToggle);
		document.addEventListener('keydown', handleKeydown, { capture: true });

		return {
			destroy() {
				node.removeEventListener('toggle', handleToggle);
				document.removeEventListener('keydown', handleKeydown, { capture: true });
				if (popoverElement === node) popoverElement = undefined;
			}
		};
	};

	const initialFocus: PopoverAction = (node) => {
		initialFocusElement = node;

		return {
			destroy() {
				if (initialFocusElement === node) initialFocusElement = undefined;
			}
		};
	};

	function close(restoreFocus = true) {
		restoreFocusOnClose = restoreFocus;

		if (popoverElement && isPopoverOpen(popoverElement)) {
			popoverElement.hidePopover();
		} else {
			open = false;
		}
	}

	$effect(() => {
		if (!popoverElement) return;
		setPopoverOpen(popoverElement, open);
	});

	$effect(() => {
		if (!open || !triggerElement || !popoverElement) return;

		return startPositioning(triggerElement, popoverElement, {
			placement,
			offset,
			collisionPadding,
			onPlacementChange: (nextPlacement) => (resolvedPlacement = nextPlacement)
		});
	});

	const triggerProps = $derived({
		'aria-expanded': open,
		'aria-controls': id,
		'aria-haspopup': role,
		popovertarget: id,
		popovertargetaction: 'toggle' as const
	});

	const popoverProps = $derived({
		id,
		popover: 'auto' as const,
		role,
		'aria-label': ariaLabel,
		tabindex: -1 as const,
		'data-open': open,
		'data-placement': resolvedPlacement ?? placement,
		'data-offset': offset,
		'data-collision-padding': collisionPadding,
		style: 'position: fixed; inset: unset; margin: 0;'
	});
</script>

{@render triggerSnippet({ trigger, props: triggerProps })}
{@render content({ popover, props: popoverProps, close, initialFocus })}
