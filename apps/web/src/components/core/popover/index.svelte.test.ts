import { page, userEvent } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MultiPopoverTest from './multi-popover-test.svelte';
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

		await expect.element(panel).toBeVisible();
		await expect.element(panel).toHaveAttribute('data-open', 'true');
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');

		const styles = getComputedStyle(panel.element());
		expect(styles.position).toBe('fixed');
		expect(panel.element().style.inset).toBe('unset');
		expect(styles.margin).toBe('0px');
	});

	test('positions the panel below and end-aligned by default', async () => {
		render(PopoverTest);

		const trigger = page.getByTestId('trigger');
		const panel = page.getByTestId('panel');
		await trigger.click();
		await expect.poll(() => panel.element().style.left).not.toBe('');

		const triggerRect = trigger.element().getBoundingClientRect();
		const panelRect = panel.element().getBoundingClientRect();
		expect(panelRect.top).toBeGreaterThanOrEqual(triggerRect.bottom + 7);
		expect(Math.abs(panelRect.right - triggerRect.right)).toBeLessThanOrEqual(1);
	});

	test('supports placement and offset configuration', async () => {
		render(PopoverTest, { placement: 'bottom-start', offset: 16 });

		const trigger = page.getByTestId('trigger');
		const panel = page.getByTestId('panel');
		await trigger.click();
		await expect.element(panel).toHaveAttribute('data-placement', 'bottom-start');

		const triggerRect = trigger.element().getBoundingClientRect();
		const panelRect = panel.element().getBoundingClientRect();
		expect(panelRect.top).toBeGreaterThanOrEqual(triggerRect.bottom + 15);
		expect(Math.abs(panelRect.left - triggerRect.left)).toBeLessThanOrEqual(1);
	});

	test('flips and shifts the panel within viewport collision padding', async () => {
		render(PopoverTest, { edge: true, collisionPadding: 10 });

		const panel = page.getByTestId('panel');
		await page.getByTestId('trigger').click();
		await expect.element(panel).toHaveAttribute('data-placement', 'top-end');

		const panelRect = panel.element().getBoundingClientRect();
		expect(panelRect.top).toBeGreaterThanOrEqual(9);
		expect(panelRect.right).toBeLessThanOrEqual(window.innerWidth - 9);
		expect(panelRect.bottom).toBeLessThanOrEqual(window.innerHeight - 9);
	});

	test('updates position when the reference layout changes', async () => {
		render(PopoverTest);

		const trigger = page.getByTestId('trigger');
		const panel = page.getByTestId('panel');
		await trigger.click();
		await expect.poll(() => panel.element().style.left).not.toBe('');
		const initialLeft = panel.element().getBoundingClientRect().left;

		const triggerElement = trigger.element();
		expect(triggerElement).toBeInstanceOf(HTMLButtonElement);
		if (triggerElement instanceof HTMLButtonElement) {
			triggerElement.style.transform = 'translateX(100px)';
		}
		window.dispatchEvent(new Event('resize'));

		await expect
			.poll(() => panel.element().getBoundingClientRect().left)
			.toBeGreaterThan(initialLeft + 99);
	});

	test('toggles native state from the trigger', async () => {
		render(PopoverTest);

		const trigger = page.getByTestId('trigger');
		const panel = page.getByTestId('panel');

		await trigger.click();
		await expect.element(panel).toBeVisible();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');
		await expect.element(page.getByTestId('open-state')).toHaveTextContent('true');

		const triggerElement = trigger.element();
		expect(triggerElement).toBeInstanceOf(HTMLButtonElement);
		if (triggerElement instanceof HTMLButtonElement) triggerElement.click();
		await expect.element(panel).not.toBeVisible();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
		await expect.element(page.getByTestId('open-state')).toHaveTextContent('false');
	});

	test('responds to externally bound open state', async () => {
		render(PopoverTest);

		const panel = page.getByTestId('panel');

		await page.getByTestId('open-externally').click();
		await expect.element(panel).toBeVisible();
		await expect.element(page.getByTestId('open-state')).toHaveTextContent('true');

		await page.getByTestId('close-externally').click();
		await expect.element(panel).not.toBeVisible();
		await expect.element(page.getByTestId('open-state')).toHaveTextContent('false');
	});

	test('closes through the content API', async () => {
		render(PopoverTest);

		await page.getByTestId('trigger').click();
		await page.getByText('Close', { exact: true }).click();

		await expect.element(page.getByTestId('panel')).not.toBeVisible();
		await expect.element(page.getByTestId('open-state')).toHaveTextContent('false');
	});

	test('tracks native Escape dismissal', async () => {
		render(PopoverTest);

		const trigger = page.getByTestId('trigger');
		await trigger.click();
		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByTestId('panel')).not.toBeVisible();
		await expect.element(page.getByTestId('open-state')).toHaveTextContent('false');
	});

	test('tracks native light dismissal', async () => {
		render(PopoverTest);

		await page.getByTestId('trigger').click();
		await page.getByTestId('outside').click();

		await expect.element(page.getByTestId('panel')).not.toBeVisible();
		await expect.element(page.getByTestId('open-state')).toHaveTextContent('false');
	});

	test('tracks native dismissal when another auto popover opens', async () => {
		render(MultiPopoverTest);

		await page.getByTestId('first-trigger').click();
		await expect.element(page.getByTestId('first-panel')).toBeVisible();

		const secondTrigger = page.getByTestId('second-trigger').element();
		expect(secondTrigger).toBeInstanceOf(HTMLButtonElement);
		if (secondTrigger instanceof HTMLButtonElement) secondTrigger.click();

		await expect.element(page.getByTestId('first-panel')).not.toBeVisible();
		await expect.element(page.getByTestId('second-panel')).toBeVisible();
		await expect.element(page.getByTestId('first-state')).toHaveTextContent('false');
		await expect.element(page.getByTestId('second-state')).toHaveTextContent('true');
	});
});
