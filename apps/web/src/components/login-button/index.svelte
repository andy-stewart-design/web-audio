<script lang="ts">
	let dialog: HTMLDialogElement;
</script>

<button
	onclick={() => {
		dialog.showModal();
	}}>Login</button
>

<dialog bind:this={dialog}>
	<h2>Login</h2>
	<form>
		<label>
			Handle
			<input />
		</label>
		<div class="button-container"><button type="submit">Login</button></div>
	</form>
</dialog>

<style>
	dialog {
		gap: 1rem;
		inline-size: 100%;
		max-inline-size: 480px;

		&[open] {
			display: grid;
		}
	}

	form {
		display: grid;
		gap: 1rem;
	}

	label {
		display: grid;
		gap: 0.5rem;
	}

	.button-container {
		display: flex;
		justify-content: flex-end;
	}
</style>
