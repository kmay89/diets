/**
 * native.js — the thin seam between the web app and an iOS app around it.
 *
 * Veg-Nourish is a static site with no build step, and that is worth keeping.
 * So nothing here is imported from a package: when the app runs inside a
 * Capacitor WebView, the native runtime injects `window.Capacitor` with a
 * `Plugins` object on it, and this file talks to that. In a browser the global
 * is absent, every function below quietly does nothing, and the site is byte
 * for byte what it was.
 *
 * That means one codebase, two shipping targets, and no branch in any view. A
 * view calls `notifyAt(...)`; on a phone it becomes a real notification that
 * fires with the screen locked, and on the web it becomes nothing, because on
 * the web there is genuinely nothing it could become.
 *
 * What being an app is actually for, in order:
 *
 *   Notifications. A timer that only rings while the app is open is not a
 *   kitchen timer, it is a stopwatch. This is the whole reason to leave the
 *   browser, and everything else here is a nicety.
 *
 *   Haptics. A tap you feel is a tap you do not have to look at, which matters
 *   when your hands are wet and the phone is propped against the toaster.
 *
 *   The status bar and the keyboard, which the web cannot reach at all.
 *
 * ERRERLabs — MIT licensed.
 */

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : null);

/** True only inside a real app shell. Never true in a browser or an installed PWA. */
export const isNative = () => !!cap()?.isNativePlatform?.();

export const platform = () => cap()?.getPlatform?.() || 'web';

const plugin = (name) => (isNative() ? cap()?.Plugins?.[name] : null) || null;

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

let notificationsReady = null;

/**
 * Ask once, and only when there is something to ask about.
 *
 * Permission is requested the first time somebody starts a timer, never at
 * launch. A permission dialog on first open is a dialog answered "no" by
 * reflex, and the answer is permanent — so the ask is deferred to the exact
 * moment it explains itself.
 */
export async function ensureNotifications() {
  const api = plugin('LocalNotifications');
  if (!api) return false;
  if (notificationsReady !== null) return notificationsReady;
  try {
    const status = await api.checkPermissions();
    const granted = status.display === 'granted'
      ? true
      : (await api.requestPermissions()).display === 'granted';
    notificationsReady = granted;
  } catch {
    notificationsReady = false;
  }
  return notificationsReady;
}

/**
 * A notification at a wall-clock time.
 *
 * Scheduled with the operating system rather than counted down by the app, so
 * it fires whether or not the app is running — which is the entire point, since
 * the moment you most need a timer is the moment you have put the phone down
 * and left the room.
 *
 * @param id     stable numeric id, so rescheduling replaces rather than stacks
 * @param at     Date or epoch ms
 */
export async function notifyAt(id, at, { title, body }) {
  const api = plugin('LocalNotifications');
  if (!api) return false;
  if (!(await ensureNotifications())) return false;

  const when = new Date(at);
  if (!(when.getTime() > Date.now())) return false;

  try {
    await api.schedule({
      notifications: [{
        id: numericId(id),
        title,
        body,
        schedule: { at: when, allowWhileIdle: true },
        sound: 'default',
        // The id travels back on tap so the app can open the right pan rather
        // than dumping somebody on the home screen holding a hot dish.
        extra: { ref: String(id) }
      }]
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelNotification(id) {
  const api = plugin('LocalNotifications');
  if (!api) return;
  try {
    await api.cancel({ notifications: [{ id: numericId(id) }] });
  } catch { /* nothing scheduled is not an error */ }
}

/**
 * A stable 31-bit number for a string id.
 *
 * iOS wants an integer and the app thinks in strings like
 * "rec.lentil-bolognese:4". A hash keeps the mapping stable across launches,
 * which is what makes canceling and rescheduling work rather than piling up
 * duplicate alarms for the same pot.
 */
export function numericId(id) {
  const s = String(id);
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = ((hash * 33) ^ s.charCodeAt(i)) >>> 0;
  return hash % 2147483647;
}

/** Called when somebody taps a notification. The handler gets the original id. */
export function onNotificationTap(fn) {
  const api = plugin('LocalNotifications');
  if (!api?.addListener) return () => {};
  try {
    const handle = api.addListener('localNotificationActionPerformed', (event) => {
      const ref = event?.notification?.extra?.ref;
      if (ref) fn(ref);
    });
    return () => handle?.then?.(h => h.remove?.());
  } catch {
    return () => {};
  }
}

/* ------------------------------------------------------------------ *
 * Touch
 * ------------------------------------------------------------------ */

const HAPTIC_STYLE = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };

/**
 * A small physical answer to a tap.
 *
 * Paired with the existing sounds rather than replacing them: the app is used
 * with wet hands in a room with a fan going, where a sound can be missed and a
 * buzz cannot. Silent by design if the plugin is absent, and never used for
 * anything the user did not initiate — a phone that buzzes on its own is a
 * phone somebody turns off.
 */
export function haptic(kind = 'light') {
  const api = plugin('Haptics');
  if (!api) return;
  try {
    if (kind === 'success' || kind === 'warning' || kind === 'error') {
      api.notification({ type: kind.toUpperCase() });
    } else {
      api.impact({ style: HAPTIC_STYLE[kind] || 'LIGHT' });
    }
  } catch { /* a missing buzz is not worth an error */ }
}

/* ------------------------------------------------------------------ *
 * The shell itself
 * ------------------------------------------------------------------ */

/**
 * Match the status bar to the theme, and keep matching it.
 *
 * The one piece of chrome the web cannot touch. Left wrong it is the single
 * most obvious tell that an app is a website in a box — dark text on a dark
 * header, every launch.
 */
export function paintStatusBar(dark) {
  const api = plugin('StatusBar');
  if (!api) return;
  try {
    api.setStyle({ style: dark ? 'DARK' : 'LIGHT' });
  } catch { /* not every platform has one */ }
}

/**
 * Wire the app shell up. Safe to call in a browser, where it does nothing.
 *
 * @param onOpenRef  handed the id from a tapped notification
 */
export function initNative({ onOpenRef } = {}) {
  if (!isNative()) return false;
  document.documentElement.classList.add('is-native', `is-${platform()}`);
  if (onOpenRef) onNotificationTap(onOpenRef);

  const dark = window.matchMedia?.('(prefers-color-scheme: dark)');
  paintStatusBar(!!dark?.matches);
  dark?.addEventListener?.('change', (e) => paintStatusBar(e.matches));
  return true;
}
