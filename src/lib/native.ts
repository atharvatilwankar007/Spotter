// Phone features. Uses native Android APIs inside the app, web fallbacks in the browser.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { getState } from './store';

export const isNative = Capacitor.isNativePlatform();

/* ---------- haptics ---------- */

export function tick() {
  if (!getState().settings.vibrate) return;
  if (isNative) Haptics.selectionChanged().catch(() => {});
  else navigator.vibrate?.(4);
}

export function thump() {
  if (!getState().settings.vibrate) return;
  if (isNative) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  else navigator.vibrate?.(18);
}

export function buzzDone() {
  if (!getState().settings.vibrate) return;
  if (isNative) {
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    Haptics.vibrate({ duration: 600 }).catch(() => {});
  } else navigator.vibrate?.([220, 120, 220, 120, 420]);
}

export function buzzWarn() {
  if (!getState().settings.vibrate) return;
  if (isNative) Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
  else navigator.vibrate?.(60);
}

/* ---------- sound (Web Audio, no files) ---------- */

let ctx: AudioContext | null = null;
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    /* no audio */
  }
}

function tone(freq: number, at: number, dur: number, gain = 0.22) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  const t = ctx.currentTime + at;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function chimeDone() {
  if (!getState().settings.sound) return;
  unlockAudio();
  tone(880, 0, 0.35);
  tone(1174.7, 0.16, 0.35);
  tone(1568, 0.32, 0.7, 0.26);
}

export function chimeWarn() {
  if (!getState().settings.sound) return;
  unlockAudio();
  tone(660, 0, 0.18, 0.14);
}

/* ---------- screen awake during a workout ---------- */

let webLock: WakeLockSentinel | null = null;
export async function stayAwake(on: boolean) {
  try {
    if (isNative) {
      if (on) await KeepAwake.keepAwake();
      else await KeepAwake.allowSleep();
      return;
    }
    if (on && 'wakeLock' in navigator && !webLock) {
      webLock = await navigator.wakeLock.request('screen');
      webLock.addEventListener('release', () => (webLock = null));
    } else if (!on && webLock) {
      await webLock.release();
      webLock = null;
    }
  } catch {
    /* not supported */
  }
}

/* ---------- rest alarm when the phone is locked / app in background ---------- */

const REST_ID = 4242;
const CHANNEL = 'rest-alarm';
let channelReady = false;

export async function prepareAlarms() {
  if (!isNative) return;
  try {
    const p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted') await LocalNotifications.requestPermissions();
    if (!channelReady) {
      await LocalNotifications.createChannel({
        id: CHANNEL,
        name: 'Rest timer',
        description: 'Rings when your rest is over',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#ff6a2b',
      });
      channelReady = true;
    }
  } catch {
    /* ignore */
  }
}

export async function scheduleRestAlarm(at: number, body: string) {
  if (!isNative || at <= Date.now() + 500) return;
  try {
    await prepareAlarms();
    await LocalNotifications.cancel({ notifications: [{ id: REST_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_ID,
          title: 'Rest over — next set',
          body,
          channelId: CHANNEL,
          schedule: { at: new Date(at), allowWhileIdle: true },
          smallIcon: 'ic_stat_spotter',
          iconColor: '#ff6a2b',
          autoCancel: true,
        },
      ],
    });
  } catch {
    /* ignore */
  }
}

export async function cancelRestAlarm() {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REST_ID }] });
  } catch {
    /* ignore */
  }
}

/* Web fallback: a notification via the service worker if permitted (only fires if the page is alive) */
export async function webNotify(title: string, body: string) {
  if (isNative || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, icon: './icon-192.png', tag: 'rest' });
    else new Notification(title, { body });
  } catch {
    /* ignore */
  }
}
