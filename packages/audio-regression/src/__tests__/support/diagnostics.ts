// Expected-error sketches stay synchronous. Only this test-local rendering
// gate waits for a diagnostic handshake; all audio rendering remains native.
export function withDiagnosticReady(code: string, setup: string) {
  return `
    const diagnosticReady = new Promise(resolve => { ${setup} });
    const nativeStartRendering = OfflineAudioContext.prototype.startRendering;
    OfflineAudioContext.prototype.startRendering = async function () {
      await diagnosticReady;
      return nativeStartRendering.call(this);
    };
    ${code}
  `;
}
