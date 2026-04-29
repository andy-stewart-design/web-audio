<script lang="ts">
  import LoginForm from '$lib/components/LoginForm.svelte';
  import LogoutButton from '$lib/components/LogoutButton.svelte';

  let { data } = $props();
</script>

<div class="container">
  <main>
    <div class="header">
      <h1>AT Protocol OAuth</h1>
      <p>Sign in with your AT Protocol account</p>
    </div>

    <div class="card">
      {#if data.did}
        <div class="session">
          <p>Signed in as <code>{data.did}</code></p>
          <LogoutButton />
        </div>
        <p class="success">Authentication working!</p>
      {:else}
        <LoginForm />
      {/if}
    </div>
  </main>
</div>

<style>
  .container {
    display: flex;
    min-height: 100vh;
    align-items: center;
    justify-content: center;
    background: #fafafa;
  }

  main {
    width: 100%;
    max-width: 28rem;
    padding: 2rem;
  }

  .header {
    text-align: center;
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 1.875rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
  }

  .header p {
    color: #6b7280;
    margin: 0;
  }

  .card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.5rem;
  }

  .session {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .session p {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
  }

  .success {
    color: #16a34a;
    margin: 0;
  }
</style>
