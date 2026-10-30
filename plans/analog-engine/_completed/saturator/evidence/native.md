# Step 2.1 native evidence

## Status

Step 2.1 is **Verified for the scoped native implementation, focused tests, and
parent review**. Parent review is complete, and no assertion or oracle defect
requiring a source change was identified. The initial significant `bends`
mismatch did not reproduce in three fresh focused reruns or the subsequent full
15/15 verification, but it remains an unexplained intermittent result. This is
an unresolved intermittent `bends` evidence limitation, not a claim that the
failure was fixed, caused by a preexisting issue, waived, or unconditionally
green; no reference update was made. This is native render evidence, not
listening approval, real-time characterization, or final feature acceptance.
Final acceptance remains pending, and no user listening approval is claimed.

## Coverage and result

The focused native verification covered three files and 14 tests total;
`packages/audio-regression/src/__tests__/saturator.test.ts` contributes 11 of
them. Coverage includes the independent ADAA oracle, 44.1/48 kHz synth and
sampler renders, envelope boundaries, sampler postgain, stereo isolation,
unison/source layers, effect order, named-bus sums, signed/zero controls, a
drive/postgain relation, and processor-error cleanup/recovery. The independent
oracle is a separate native test worklet; production DSP and approved
references were not changed.

The bends case exercises saw-synth LFO detune, envelope/LFO filter automation,
a square synth, and local BD/HH samples. No causal link from any of those
features to the mismatch is established.

## Follow-up verification

Environment/provenance: revision `1e144b64c4436aef7c2202ad7c9ee6bc9c13cc33`,
Chromium `147.0.7727.15`, 48 kHz stereo, 400,800 frames, 120 BPM, 4,800-frame
offset. Reference and sample SHA-256 values were captured before reruns:

- bends reference WAV: `364045f31d97c6dbced818e4c1fe9efc386f672126e76769107647c548e7a70c`
- BD sample: `27fbacc2dce3eb1cfcce0bfb7a77f23c6e7cb0aec4897400bf648c11454ed9c5`
- HH sample: `6b737acdd4e9db504dc8225c613ae72fb9b67c2e493b011c50750e16c708e9bd`
- approved-reference manifest (all 15 cases): `1902d68cbcee242263818fb0e6070cc94a176160e8553f2a3dd6d2022ced5ac6`

The initial ignored `artifacts/verify/bends/` WAV/JSON pair was preserved before
rerunning at `/tmp/web-audio-step2.1-bends-20261029-064643/initial-artifacts/`.
It recorded the earlier failure on both channels: max `1.801982522e-3`, RMS
`2.129217945e-5` (ch0) / `2.129216319e-5` (ch1), worst frame `373591`
(`7.783145833 s`), with reference/current ch0 values
`0.19755718111991882` / `0.19575519859790802`. The >`1e-4` differences were 49
short ranges in the late window `373321..379199`; >`1e-6` extended through
`379756`, with the largest concentrated activity around
`373248..379789` (both channels). Initial current/difference WAV hashes are
`297af41dba17689c82f66d3a6ac7474207a7a28d215a6d4b4573bd1955ad9c43` and
`e420deb75ff1b009b3f9ab8492bcb73ddbb9a5c2502b068475f6f78b61ee985e`.

Three sequential fresh focused commands all passed without source or reference
changes:

1. ch0/ch1 max `1.192093e-7`; RMS `1.076260e-8` / `1.072679e-8`; worst frame
   `5367`.
2. ch0/ch1 max `1.192093e-7`; RMS `1.337031e-8` / `1.342042e-8`; worst frame
   `5372`.
3. ch0/ch1 max `1.192093e-7`; RMS `1.076260e-8` / `1.072679e-8`; worst frame
   `5367`.

A helper-only raw comparison of one fresh pass found no samples above `1e-6`
(108,866 / 108,914 exact Float32 sample differences, mostly below that limit);
its max/RMS were `1.1920928955e-7`, `1.0762601260e-8`, and
`1.0726792525e-8`. Its worst frame was `5367` (`0.1118125 s`) in both
channels. Fresh current/difference WAV hashes are
`5e8f312af5642dae310cf9158baa0e181be844fbbb5937bb614325f3181b8f09` and
`db4402a11577e63d9006add6a54764df8fc8cc77fa3402ca07625808f2830f71`.

The source build passed 6/6 tasks; the regression package check, lint, and
format checks also passed. The subsequent full `audio:verify` returned
**15/15**, including bends (ch0/ch1 max `1.192093e-7`; RMS `9.376459e-9` /
`9.330910e-9`; worst frame `5372`). This result followed the initial 14/15
run and the three fresh focused reruns; it does not erase or explain the
initial significant failure. Logs and the complete raw-analysis JSON are
retained under the same `/tmp` directory (`run-1.log`..`run-3.log`,
`full-verify.log`, `analysis.json`). No reference update, tolerance change,
normalization, or source fix was made.

## Working-tree note and limitations

At capture, the working tree contained only the native test/docs work in scope:
modified `packages/audio-regression/README.md`,
`packages/audio-regression/src/__tests__/saturator.test.ts`, and
`plans/analog-engine/saturator/plan.md`, plus untracked native support/evidence
files. The complete source-relevant working patch, including the untracked native
support file, was captured as
`/tmp/web-audio-step2.1-bends-20261029-064643/source-relevant-working.patch`
(SHA-256
`ab496039670c194e7dd794b0f51770e3490c01ed8b7f9e6fa6793d63d3b77b0b`); no
production audio source, dependency, case, or reference file was edited here.

The evidence confirms repeatability of the passing reruns and non-repeatability
of the earlier failure under this unchanged setup, but does not identify a
root cause. Parent review is complete for the scoped Step 2.1 gate; the retained
initial failure remains an unresolved intermittent `bends` evidence limitation.
Do not silently treat the current 15/15 pass as resolution, and obtain explicit
approval before any further disposition or investigation of that result.

Phase 2.2 real-time characterization, Phase 2.3 listening/reference approval,
the Phase 2 exit gate, and final feature acceptance remain pending.
