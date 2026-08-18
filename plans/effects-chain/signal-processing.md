# Buses, routes, and sends

Core model

The engine has three levels of signal ownership:

1.  Voice — one scheduled note or sample playback.
2.  Instrument — mixes all voices belonging to a playable instrument.
3.  Bus — persistently receives and processes one or more instrument signals.

```text
  voice → instrument output → bus → main bus → destination
```

The "main" bus always exists and is the final path to AudioContext.destination.

---

## Instrument signal flow

Each voice is processed independently before reaching its instrument output:

```text
  source
    → per-voice envelope
    → per-voice effects
    → instrument mix
```

The combined instrument signal then passes through persistent instrument-level output controls:

```text
  instrument mix
    → instrument balancing gain
    → instrument mute
    → instrument output
```

The instrument output is the source for both:

- its one primary route;
- any number of auxiliary sends.

```text
  instrument output
    ├─→ primary route
    ├─→ send gain → auxiliary bus
    └─→ send gain → auxiliary bus
```

Therefore all routes and sends receive the signal after voice processing, instrument gain, and instrument mute.

---

## Primary route

Every instrument has exactly one primary route.

```ts
d.synth().route("drums").push();
```

This selects the bus that receives the instrument’s normal output:

```text
  synth → drums bus → main bus → destination
```

If no route is specified, it defaults to "main":

```ts
d.synth().push();
```

```text
  synth → main bus → destination
```

A primary route does not preserve an additional implicit connection to "main". Routing to "drums" replaces the default primary destination:

```text
  Correct:

  synth → drums → main
```

not:

```text
  Incorrect:

  synth ─────────→ main
     └─→ drums ──→ main
```

This prevents accidental dry-signal duplication.

---

## Auxiliary sends

A send creates an additional parallel copy of the instrument output:

```ts
d.synth().send("verb", 0.2).push();
```

With the default primary route, this produces:

```text
  synth output
    ├─→ main
    └─→ send gain 0.2 → verb bus → main
```

A send never replaces or changes the primary route.

Multiple sends may exist:

```ts
d.synth().route("synths").send("verb", 0.2).send("delay", 0.1).push();
```

```text
  synth output
    ├─→ synths bus → main
    ├─→ gain 0.2 → verb bus → main
    └─→ gain 0.1 → delay bus → main
```

Each send has its own gain node.

---

## Send tap position

Instrument sends are:

- post-envelope;
- post-voice effects;
- post-instrument balancing gain;
- post-instrument mute;
- pre-primary-bus processing.

```text
  voices
    → voice processing
    → instrument mix
    → instrument gain
    → instrument mute
    ├─→ primary bus
    └─→ send gain → auxiliary bus
```

The sent signal is therefore:

```text
  instrument signal
  × instrument gain
  × instrument mute
  × send amount
```

### Consequences

Lowering an instrument’s gain reduces both its routed and sent signals.

Muting an instrument:

- stops new dry output;
- stops new signal from entering auxiliary buses;
- does not terminate tails already being processed by persistent buses.

Primary-bus processing does not affect an instrument-level send. For example:

```text
  synth → drums compressor → main
     └─→ verb
```

The reverb receives the instrument before the drums compressor.

Sending the compressed drums mix would require a future bus-to-bus send:

```text
  drums bus → compressor
    ├─→ main
    └─→ verb send
```

---

## Buses

A bus is a persistent signal-processing path with:

- an input;
- an optional processing chain;
- an output gain;
- an output destination.

Conceptually:

```text
  bus input
    → bus processing
    → bus output gain
    → destination bus
```

In the initial model, all non-main buses output to "main":

```text
  instrument → named bus → main → destination
```

The same bus abstraction supports both group buses and auxiliary returns.

### Group bus

A group bus receives primary routes:

```ts
d.bus("drums");
d.sample("bd").route("drums").push();
d.sample("sd").route("drums").push();
```

```text
  kick ──┐
         ├─→ drums bus → main
  snare ─┘
```

### Auxiliary return bus

An auxiliary bus receives sends:

```ts
d.bus("verb");
d.synth().send("verb", 0.2).push();
d.sample("sd").send("verb", 0.5).push();
```

```text
  synth × 0.2 ─┐
               ├─→ verb bus → main
  snare × 0.5 ─┘
```

The distinction is created by how signals enter the bus:

- route() supplies the primary signal;
- send() supplies an additional copy.

A bus does not need an intrinsic "group" or "aux" type in v1.

---

## Main bus

The "main" bus is a special, always-present bus:

```text
  main input
    → main processing
    → main output gain
    → AudioContext.destination
```

Instruments route to it by default, and named buses feed into it.

```text
  instrument ──────────┐
                       ├─→ main → destination
  instrument → drums ──┤
  instrument → verb ───┘
```

The main bus:

- cannot route to another bus;
- should not send to itself;
- should not be removable;
- is the only graph object connected directly to the destination.

This centralizes final level control and prevents instruments from bypassing the main processing path.

---

## Proposed v1 topology

Keep bus routing intentionally constrained:

```text
  voice
    → instrument
    ├─→ primary bus ─┐
    └─→ aux bus ─────┤
                     ↓
                   main
                     ↓
                destination
```

Allowed connections:

```text
  instrument → main
  instrument → named bus
  instrument send → named bus
  named bus → main
  main → destination
```

Deferred:

- named bus → named bus routing;
- bus-to-bus sends;
- pre-fader sends;
- pre-mute sends;
- per-voice sends;
- feedback routing.

This topology cannot form feedback cycles and is straightforward to validate.

---

## Suggested behavioral rules

### Routes

- Every instrument has exactly one primary route.
- The default route is "main".
- Calling .route(name) changes the primary destination.
- A route never duplicates the instrument directly to "main".
- The target bus must be declared unless it is "main".

### Sends

- An instrument may have zero or more sends.
- Sends are parallel to the primary route.
- Each send targets a declared named bus.
- Each send has an independent gain.
- Sends are post-instrument-gain and post-mute.
- Sends branch before primary-bus processing.
- Sending to "main" should be rejected because it would normally duplicate the dry signal.
- Duplicate sends to the same bus should either be rejected or deterministically replace one another; replacing is  
  likely the cleaner builder behavior.

### Buses

- "main" always exists.
- Named buses are declared explicitly.
- Named buses output to "main" in v1.
- A bus may receive both routes and sends, though mixing those roles should be intentional.
- Bus output gain affects everything entering that bus.
- Only the main bus connects to AudioContext.destination.

---

## Reference graph

Given:

```ts
d.bus("drums").gain(0.8);
d.bus("verb").gain(0.5);

d.sample("bd").route("drums").send("verb", 0.1).push();

d.sample("sd").route("drums").send("verb", 0.4).push();

d.synth().send("verb", 0.2).push();
```

The graph is:

```text
  kick voices → kick output ──→ drums ─────────────┐
                            └─→ send 0.1 → verb ───┤
                                                   │
  snare voices → snare output → drums ─────────────┤
                             └→ send 0.4 → verb ───┤
                                                   ├─→ main → destination
  synth voices → synth output ─────────────────────┤
                            └─→ send 0.2 → verb ───┘
```

More precisely, shared bus inputs are summed:

```text
  kick primary ─┐
                ├─→ drums processing → drums gain 0.8 ─┐
  snare primary ┘                                      │
                                                       ├─→ main
  kick send 0.1 ──┐                                    │
  snare send 0.4 ─┼─→ verb processing → verb gain 0.5 ─┤
  synth send 0.2 ─┘                                    │
                                                       │
  synth primary ───────────────────────────────────────┘
```

This provides a clean initial invariant:

> Every instrument produces one final output signal. Its primary route forwards that signal to exactly one bus, while sends forward gain-controlled copies to additional buses. Every named bus processes its summed input and forwards the result exactly once to the main bus.
