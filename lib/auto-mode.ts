// CarPlay / Android Auto adapter.
//
// Driving usage profile:
//   • The user can't tap a small SOS button safely.
//   • Voice trigger needs to coexist with the car's hands-free / nav.
//   • On crash detection (already implemented via crashSpeedThreshold),
//     we want to fire SOS *and* show a giant "I'm OK / Help" prompt on the
//     car HUD, not the small phone screen.
//
// CarPlay (iOS) and Android Auto require their own templates and a separate
// CarPlay scene / Android Auto service. This module exposes the JS-side
// adapter so a native module can drop in.
//
// Default backend: `idle` — reports "not in car mode". Native bridges call
// `notifyCarConnected` and `notifyCarDisconnected` so JS can adjust UX
// (e.g. enable big buttons, mute noisy logs, raise voice-trigger sensitivity).

export type CarMode = 'carplay' | 'android-auto' | 'none';

export type AutoModeBackend = {
  /** Current mode — driven by native lifecycle events. */
  mode(): CarMode;
  /** Render a crash / threat prompt on the car HUD. Returns user choice. */
  showCrashPrompt(opts: {
    title: string;
    message: string;
    countdownSeconds: number;
  }): Promise<'fired' | 'cancelled' | 'unsupported'>;
  /** Show the SOS-fired confirmation banner after a successful relay. */
  showFiredBanner(message: string): Promise<void>;
};

const noopBackend: AutoModeBackend = {
  mode: () => 'none',
  async showCrashPrompt() {
    return 'unsupported';
  },
  async showFiredBanner() {
    /* no-op */
  },
};

let backend: AutoModeBackend = noopBackend;

let listeners: ((mode: CarMode) => void)[] = [];

export function registerAutoModeBackend(b: AutoModeBackend): void {
  backend = b;
}

export function getCarMode(): CarMode {
  return backend.mode();
}

/** Subscribe to mode changes. Returns an unsubscribe fn. */
export function onCarModeChange(cb: (mode: CarMode) => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((x) => x !== cb);
  };
}

/** Native bridges call these when the lifecycle changes. */
export function notifyCarConnected(mode: CarMode): void {
  for (const l of listeners) l(mode);
}
export function notifyCarDisconnected(): void {
  for (const l of listeners) l('none');
}

export async function showCrashPrompt(opts: {
  title: string;
  message: string;
  countdownSeconds: number;
}): Promise<'fired' | 'cancelled' | 'unsupported'> {
  return backend.showCrashPrompt(opts);
}

export async function showFiredBanner(message: string): Promise<void> {
  return backend.showFiredBanner(message);
}

/**
 * CarPlay native recipe (Swift):
 *
 *   import CarPlay
 *   class HearMeSceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
 *     func templateApplicationScene(_ scene: CPTemplateApplicationScene,
 *                                   didConnect interfaceController: CPInterfaceController) {
 *       HearMeBridge.shared.notifyCarConnected("carplay")
 *       let crashTemplate = CPAlertTemplate(titleVariants: ["HearMe — possible crash"],
 *         actions: [
 *           CPAlertAction(title: "I'm OK", style: .cancel) { _ in HearMeBridge.shared.crashCancelled() },
 *           CPAlertAction(title: "Send SOS", style: .destructive) { _ in HearMeBridge.shared.crashFired() }])
 *       interfaceController.presentTemplate(crashTemplate, animated: true)
 *     }
 *   }
 *
 * Android Auto recipe (Kotlin):
 *
 *   class HearMeAutoService : CarAppService() {
 *     override fun createHostValidator() = HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
 *     override fun onCreateSession() = HearMeAutoSession()
 *   }
 *   class HearMeAutoSession : Session() {
 *     override fun onCreateScreen(intent: Intent) = HearMeCrashScreen(carContext)
 *   }
 *   class HearMeCrashScreen(ctx: CarContext) : Screen(ctx) {
 *     override fun onGetTemplate() = MessageTemplate.Builder("HearMe — possible crash")
 *       .addAction(Action.Builder().setTitle("I'm OK").setOnClickListener { … }.build())
 *       .addAction(Action.Builder().setTitle("Send SOS").setOnClickListener { … }.build())
 *       .build()
 *   }
 *
 * Both bridges call `notifyCarConnected` / `notifyCarDisconnected` so JS
 * code (voice trigger, journey monitor) can re-tune for in-car use.
 */
export const NATIVE_RECIPE = '__see lib/auto-mode.ts source for full recipe__';
