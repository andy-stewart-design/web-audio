import type { SVGAttributes } from 'svelte/elements';

export interface IconProps extends SVGAttributes<SVGSVGElement> {
	size?: number;
	weight?: 'default' | 'thin';
}
