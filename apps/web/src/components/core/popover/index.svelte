<script lang="ts">
	import { dev } from '$app/environment';
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

	let triggerElement: HTMLButtonElement | undefined;
	let popoverElement: HTMLElement | undefined;
	let initialFocusElement: HTMLElement | undefined;

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

		return {
			destroy() {
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
		void restoreFocus;
	}

	const triggerProps = $derived({
		'aria-expanded': open,
		'aria-controls': id,
		'aria-haspopup': role
	});

	const popoverProps = $derived({
		id,
		popover: 'auto' as const,
		role,
		'aria-label': ariaLabel,
		tabindex: -1 as const,
		'data-open': open,
		'data-placement': placement,
		'data-offset': offset,
		'data-collision-padding': collisionPadding,
		style: 'position: fixed; inset: unset; margin: 0;'
	});
</script>

{@render triggerSnippet({ trigger, props: triggerProps })}
{@render content({ popover, props: popoverProps, close, initialFocus })}
