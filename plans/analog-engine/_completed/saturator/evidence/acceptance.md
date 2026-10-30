# Step 2.2 acceptance evidence

## Status

Step 2.2 is **Verified** and final feature acceptance is **Delivered**. The
approved candidate is registered as the `saturator` case and its named reference
pair was generated. The user then approved the saved WAV with the exact quote:
**“Looks good.”** This completes the saved-reference listening gate and Phase 2
exit.

## Candidate and reference checks

- Candidate: ignored `packages/audio-regression/artifacts/saturator/candidate-48000.wav` and JSON sidecar; 48 kHz, stereo, 196,417 frames, 128 BPM, two bars, 4,417-frame offset, 0.25-second tail.
- Registered case: `packages/audio-regression/cases/saturator/{metadata.json,sketch.js}` with the same sketch/settings and `../sample-tone/samples/tone.wav` resource mapping.
- Candidate versus the registered render: raw Float32 comparison passed; both channels had max error `7.450581e-9` and RMS error `5.976964e-11`, within max `1e-6` / RMS `1e-7`.
- Named reference: `packages/audio-regression/references/saturator/{render.wav,metadata.json}`. Candidate versus saved reference passed with zero sample differences; fresh `audio:verify --case saturator` passed 1/1.
- The 15 pre-existing reference files were hash-identical before and after registration. The candidate WAV/JSON remained hash-identical (`b7f84a82046efd69d6b4199bc6b652ef7c984b08150a94a6e42791afaaadc382` / `952b590566786acda5b0a4702c7454cb60d71b45edc975026d3f00eaaaee19a8`).

## Approval and limits

The user explicitly approved the candidate with the exact quote: **“yes, sounds fine”**.
The later saved-reference approval, **“Looks good.”**, completes the manual gate.
Final checks used revision
`2dedd626c12d771c8cd0d84d6a4d70360ebeaa19`, Chromium `147.0.7727.15`, and the
existing raw fixed tolerances above. The historical intermittent `bends`
limitation remains unresolved; no source fix, tolerance change, or reference
change was made for it.

Final existing gates passed from the repository root: forced source build
`6/6`; `pnpm test` `19/19` Turbo tasks with `16/16` audio-regression cases;
`pnpm check` `14/14`; `pnpm lint` `14/14`; audio-regression `format:check`; and
`git diff --check`. Documentation-only updates after the checked revision do
not change code, case inputs, or references; final feature acceptance is
complete.
