<script lang="ts">
	import ProfilePopover from './profile-popover.svelte';

	let loggedOut = $state(false);
	const session = {
		did: 'did:plc:test',
		handle: 'test.example',
		displayName: 'Test User',
		avatar: null
	};
</script>

<ProfilePopover
	{session}
	onlogout={async () => {
		loggedOut = true;
	}}
/>

<output data-testid="logged-out">{loggedOut}</output>
<button data-testid="outside" style="position: fixed; bottom: 0; left: 0;">Outside</button>
