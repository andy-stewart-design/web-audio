import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PopoverTest from './popover-test.svelte';

describe('Popover', () => {
	test('renders its trigger and panel while closed', async () => {
		render(PopoverTest);

		await expect.element(page.getByTestId('trigger')).toBeInTheDocument();
		await expect.element(page.getByTestId('panel')).toBeInTheDocument();
		await expect.element(page.getByTestId('open-state')).toHaveTextContent('false');
	});

	test('provides default panel semantics and connected trigger attributes', async () => {
		render(PopoverTest);

		const trigger = page.getByTestId('trigger');
		const panel = page.getByTestId('panel');
		const panelId = panel.element().id;

		expect(panelId).toMatch(/^popover-/);
		await expect.element(panel).toHaveAttribute('role', 'dialog');
		await expect.element(panel).toHaveAttribute('aria-label', 'Test popover');
		await expect.element(panel).toHaveAttribute('popover', 'auto');
		await expect.element(panel).toHaveAttribute('tabindex', '-1');
		await expect.element(panel).toHaveAttribute('data-open', 'false');
		await expect.element(panel).toHaveAttribute('data-placement', 'bottom-end');
		await expect.element(panel).toHaveAttribute('data-offset', '8');
		await expect.element(panel).toHaveAttribute('data-collision-padding', '8');
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
		await expect.element(trigger).toHaveAttribute('aria-controls', panelId);
		await expect.element(trigger).toHaveAttribute('aria-haspopup', 'dialog');
	});

	test('respects explicit IDs and supported roles', async () => {
		render(PopoverTest, { id: 'settings-panel', role: 'menu' });

		await expect.element(page.getByTestId('panel')).toHaveAttribute('id', 'settings-panel');
		await expect.element(page.getByTestId('panel')).toHaveAttribute('role', 'menu');
		await expect
			.element(page.getByTestId('trigger'))
			.toHaveAttribute('aria-controls', 'settings-panel');
		await expect.element(page.getByTestId('trigger')).toHaveAttribute('aria-haspopup', 'menu');
	});

	test('reflects initial open state and structural positioning styles', async () => {
		render(PopoverTest, { open: true });

		const panel = page.getByTestId('panel');
		const trigger = page.getByTestId('trigger');

		await expect.element(panel).toHaveAttribute('data-open', 'true');
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');

		const styles = getComputedStyle(panel.element());
		expect(styles.position).toBe('fixed');
		expect(panel.element().style.inset).toBe('unset');
		expect(styles.margin).toBe('0px');
	});
});
