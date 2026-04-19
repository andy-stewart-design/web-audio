// Base64-encoded silent MP3 (VBR 220-260, Joint Stereo, 859 bytes).
// Looped via an <audio> tag to force iOS onto the media channel
// instead of the ringer channel (which the mute switch silences).
const SILENT_MP3 =
  "data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA//////////////////////////////////////////////////////////////////8AAABhTEFNRTMuMTAwA8MAAAAAAAAAABQgJAUHQQAB9AAAAnGMHkkIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQxAADgnABGiAAQBCqgCRMAAgEAH///////////////7+n/9FTuQsQH//////2NG0jWUGlio5gLQTOtIoeR2WX////X4s9Atb/JRVCbBUpeRUq//////////////////9RUi0f2jn/+xDECgPCjAEQAABN4AAANIAAAAQVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==";

const UNLOCK_EVENTS = ["click", "touchstart", "touchend", "keydown", "mousedown"] as const;

interface AudioContextOptions {
  allowBackgroundPlayback?: boolean;
}

interface ManagedAudioContext {
  ctx: AudioContext;
  dispose(): void;
}

function createAudioContext(options: AudioContextOptions = {}): ManagedAudioContext {
  const { allowBackgroundPlayback = false } = options;

  const ctx = new AudioContext();
  let silentTag: HTMLAudioElement | null = null;
  let isUnlocked = false;
  let isBackground = false;
  let disposed = false;

  function createSilentTag(): HTMLAudioElement {
    const audio = document.createElement("audio");
    audio.src = SILENT_MP3;
    audio.loop = true;
    audio.setAttribute("x-webkit-airplay", "deny");
    audio.disableRemotePlayback = true;
    return audio;
  }

  function destroySilentTag() {
    if (!silentTag) return;
    silentTag.pause();
    silentTag.src = "about:blank";
    silentTag.load();
    silentTag = null;
  }

  function unlock() {
    if (isUnlocked || disposed) return;
    isUnlocked = true;

    ctx.resume().catch(() => {});

    silentTag = createSilentTag();
    silentTag.play().catch(() => {});

    for (const event of UNLOCK_EVENTS) {
      window.removeEventListener(event, unlock, true);
    }
  }

  function onVisible() {
    if (disposed || !isBackground) return;
    isBackground = false;

    ctx.resume().catch(() => {});

    if (isUnlocked) {
      silentTag = createSilentTag();
      silentTag.play().catch(() => {});
    }
  }

  function onHidden() {
    if (disposed || isBackground || allowBackgroundPlayback) return;
    isBackground = true;

    ctx.suspend().catch(() => {});
    destroySilentTag();
  }

  function handleVisibility() {
    if (document.hidden) {
      onHidden();
    } else {
      onVisible();
    }
  }

  function handleFocus() {
    onVisible();
  }

  function handleBlur() {
    onHidden();
  }

  // Set up gesture listeners for unlock
  for (const event of UNLOCK_EVENTS) {
    window.addEventListener(event, unlock, true);
  }

  // Set up visibility listeners
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("blur", handleBlur);

  function dispose() {
    if (disposed) return;
    disposed = true;

    for (const event of UNLOCK_EVENTS) {
      window.removeEventListener(event, unlock, true);
    }

    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("blur", handleBlur);

    destroySilentTag();
    ctx.close().catch(() => {});
  }

  return { ctx, dispose };
}

export { createAudioContext, type ManagedAudioContext, type AudioContextOptions };
