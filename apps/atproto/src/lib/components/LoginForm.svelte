<script lang="ts">
  let handle = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    loading = true;
    error = null;

    try {
      const res = await fetch('/oauth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      window.location.href = data.redirectUrl;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Login failed';
      loading = false;
    }
  }
</script>

<form onsubmit={handleSubmit}>
  <div class="field">
    <label for="handle">Handle</label>
    <input
      id="handle"
      type="text"
      bind:value={handle}
      placeholder="user.bsky.social"
      disabled={loading}
    />
  </div>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <button type="submit" disabled={loading || !handle}>
    {loading ? 'Signing in...' : 'Sign in'}
  </button>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
  }

  input {
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 1rem;
  }

  input:disabled {
    opacity: 0.5;
  }

  .error {
    font-size: 0.875rem;
    color: #dc2626;
    margin: 0;
  }

  button {
    padding: 0.5rem 1rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #1d4ed8;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
