import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProfilePopoverTest from './profile-popover-test.svelte';

describe('ProfilePopover', () => {
	test('is hidden initially, opens from its trigger, and light-dismisses', async () => {
		render(ProfilePopoverTest);

		const trigger = page.getByRole('button', { name: /profile menu/ });
		const panel = page.getByRole('dialog', { name: 'Profile' });
		const panelElement = document.getElementById('profile-popover');

		expect(panelElement).toBeInstanceOf(HTMLDivElement);
		if (panelElement instanceof HTMLDivElement) {
			expect(getComputedStyle(panelElement).display).toBe('none');
		}
		await trigger.click();
		await expect.element(panel).toBeVisible();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');

		await page.getByTestId('outside').click();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
		if (panelElement instanceof HTMLDivElement) {
			expect(getComputedStyle(panelElement).display).toBe('none');
		}
	});

	test('positions the open panel relative to its trigger', async () => {
		render(ProfilePopoverTest);

		const trigger = page.getByRole('button', { name: /profile menu/ });
		const panel = page.getByRole('dialog', { name: 'Profile' });
		await trigger.click();
		await expect.poll(() => panel.element().style.left).not.toBe('');

		const triggerRect = trigger.element().getBoundingClientRect();
		const panelRect = panel.element().getBoundingClientRect();
		expect(panelRect.top).toBeGreaterThanOrEqual(triggerRect.bottom + 7);
	});
});
