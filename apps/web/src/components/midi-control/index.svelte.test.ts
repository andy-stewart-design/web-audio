import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MidiControlTest from './midi-control-test.svelte';

describe('MidiControl', () => {
	test('opens, focuses its switch, and light-dismisses', async () => {
		render(MidiControlTest);

		const trigger = page.getByRole('button', { name: /settings/ });
		const panelElement = document.querySelector<HTMLElement>('[aria-label="MIDI settings"]');

		expect(panelElement).toBeInstanceOf(HTMLDivElement);
		if (panelElement) expect(getComputedStyle(panelElement).display).toBe('none');

		await trigger.click();
		const panel = page.getByRole('dialog', { name: 'MIDI settings' });
		await expect.element(panel).toBeVisible();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');
		expect(document.activeElement).toBe(panel.element().querySelector('input[type="checkbox"]'));

		await page.getByTestId('outside').click();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
		if (panelElement) expect(getComputedStyle(panelElement).display).toBe('none');
	});
});
