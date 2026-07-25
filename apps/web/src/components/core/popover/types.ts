import type { Placement } from '@floating-ui/dom';
import type { Snippet } from 'svelte';
import type { Action } from 'svelte/action';

type PopoverRole = 'dialog' | 'menu' | 'listbox' | 'tree' | 'grid';
type TriggerAction = Action<HTMLButtonElement>;
type PopoverAction = Action<HTMLElement>;

type TriggerContext = {
	trigger: TriggerAction;
	props: {
		'aria-expanded': boolean;
		'aria-controls': string;
		'aria-haspopup': PopoverRole;
		popovertarget: string;
		popovertargetaction: 'toggle';
	};
};

type ContentContext = {
	popover: PopoverAction;
	props: {
		id: string;
		popover: 'auto';
		role: PopoverRole;
		'aria-label': string;
		tabindex: -1;
		'data-open': boolean;
		'data-popover-panel': '';
		'data-placement': Placement;
		'data-offset': number;
		'data-collision-padding': number;
		style: string;
	};
	close: (restoreFocus?: boolean) => void;
	initialFocus: PopoverAction;
};

interface PositioningOptions {
	placement: Placement;
	offset: number;
	collisionPadding: number;
	onPlacementChange(placement: Placement): void;
}

interface Props {
	ariaLabel: string;
	id?: string;
	role?: PopoverRole;
	placement?: Placement;
	offset?: number;
	collisionPadding?: number;
	open?: boolean;
	trigger: Snippet<[TriggerContext]>;
	content: Snippet<[ContentContext]>;
}

export type { PopoverAction, PositioningOptions, Props, TriggerAction, TriggerContext };
