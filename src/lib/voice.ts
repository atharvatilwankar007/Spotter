// Offline "start" / "stop" listener. Runs entirely on the phone: no audio is saved or sent anywhere.
import type { Model } from 'vosk-browser';

export type Word = 'start' | 'stop';

let model: Promise<Model> | null = null;

/** loads the speech model (a few seconds), once */
export function preloadVoice() {
  // not named .gz on purpose: web servers would unzip it on the way and the loader expects it zipped
  const load = import('vosk-browser').then((v) => v.createModel(new URL('models/vosk-small-en.dat', document.baseURI).href, -1));
  // a failed load never reports back, so give up after a while and let Ghost Set run without voice
  const giveUp = new Promise<never>((_, no) => setTimeout(() => no(new Error('voice timeout')), 60000));
  model ??= Promise.race([load, giveUp])
    .catch((e) => {
      model = null;
      throw e;
    });
  return model;
}

/** a recogniser that only knows our two words; anything else lands in [unk] and is ignored */
export async function createListener(sampleRate: number, onWord: (w: Word) => void) {
  const m = await preloadVoice();
  const rec = new m.KaldiRecognizer(sampleRate, JSON.stringify(['start', 'stop', '[unk]']));
  let seen = 0; // words of the current phrase already handled
  const read = (text: string, final: boolean) => {
    const words = text.split(' ').filter(Boolean);
    for (let i = seen; i < words.length; i++) if (words[i] === 'start' || words[i] === 'stop') onWord(words[i] as Word);
    seen = final ? 0 : Math.max(seen, words.length);
  };
  // partial results answer quickly, and don't need silence after the word (a gym is never silent)
  rec.on('partialresult', (msg) => {
    if (msg.event === 'partialresult') read(msg.result.partial, false);
  });
  rec.on('result', (msg) => {
    if (msg.event === 'result') read(msg.result.text, true);
  });
  return {
    feed: (samples: Float32Array) => rec.acceptWaveformFloat(samples, sampleRate),
    close: () => rec.remove(),
  };
}

/** opens the microphone and listens until the returned function is called */
export async function startVoice(onWord: (w: Word) => void): Promise<() => void> {
  // the phone's voice-call processing would duck your music, so ask for the plain microphone
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
  });
  const ctx = new AudioContext();
  await ctx.resume();
  let listener: Awaited<ReturnType<typeof createListener>>;
  try {
    listener = await createListener(ctx.sampleRate, onWord);
  } catch (e) {
    mic.getTracks().forEach((t) => t.stop());
    ctx.close();
    throw e;
  }
  const src = ctx.createMediaStreamSource(mic);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  proc.onaudioprocess = (e) => listener.feed(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(proc).connect(mute).connect(ctx.destination);
  return () => {
    proc.onaudioprocess = null;
    src.disconnect();
    proc.disconnect();
    mic.getTracks().forEach((t) => t.stop());
    ctx.close();
    listener.close();
  };
}
