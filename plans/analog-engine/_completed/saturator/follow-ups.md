# Follow-ups from the minimal Step 1.2 redo

These observations are explicitly deferred and were not approved for this
integration slice:

- Existing MIDI subscriber/binding rollback behavior can be revisited if a
  real runtime issue is observed. The generic signal and Instrument changes
  from the prior attempt were removed; no new MIDI guarantee is claimed.
- Existing Synthesizer/Sampler constructor failure cleanup can be revisited if
  an observed constructor leak warrants a scoped fix. Constructor-local LFO
  rollback was not part of the minimal saturator integration.
- Existing native graph and general cleanup transactionality remain outside
  scope. Only saturator-owned resources acquired by this feature receive the
  narrow new bus cleanup boundary.

Injected failure cases used to discover a setup boundary are not evidence of an
observed production runtime issue. No ticket or broader hardening work is
created here; any follow-up needs explicit approval.
