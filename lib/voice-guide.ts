/**
 * Voice guide engine.
 *
 * Spoken navigation + accessibility narration for HearMe. Pure logic + a thin
 * adapter over expo-speech so the rest of the app never imports it directly.
 *
 * Goals:
 *   1. Speak any phrase in the user's chosen app language (all 22 supported).
 *   2. Map natural-language utterances to in-app routes (and a tappable
 *      command palette for users who can't reliably do STT).
 *   3. Pre-translated strings for every navigable screen + every voice
 *      command, in every supported language, with a graceful English fallback.
 *
 * Note on TTS: expo-speech runs on Android/iOS/web with the system engine.
 * If it's not installed (e.g. legacy Expo Go without the module), the
 * adapter falls back to no-ops so the rest of the UI still works.
 */
import type { LangCode } from './i18n';

// ---------- TTS adapter -------------------------------------------------

type SpeechModule = {
  speak: (text: string, options?: Record<string, unknown>) => void;
  stop: () => void;
  isSpeakingAsync?: () => Promise<boolean>;
};

let speechMod: SpeechModule | null | undefined;

function getSpeech(): SpeechModule | null {
  if (speechMod !== undefined) return speechMod;
  try {
    // require so a missing module is a runtime no-op rather than a build error
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech') as SpeechModule;
    speechMod = mod && typeof mod.speak === 'function' ? mod : null;
  } catch {
    speechMod = null;
  }
  return speechMod;
}

export function isSpeechAvailable(): boolean {
  return getSpeech() !== null;
}

// ---------- BCP-47 locale mapping ---------------------------------------

/**
 * Map our app LangCode -> a BCP-47 tag the OS TTS engine will recognise.
 * Many minor languages don't have a dedicated TTS voice on most devices;
 * for those we point at the closest cousin so playback never fails silently.
 */
const LOCALE_FOR: Record<LangCode, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  te: 'te-IN',
  mr: 'mr-IN',
  ta: 'ta-IN',
  ur: 'ur-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  or: 'or-IN',
  pa: 'pa-IN',
  as: 'as-IN',
  // No dedicated TTS voices on most devices -> Hindi (Devanagari) is the
  // closest match since these scripts are Indic / phonetically related.
  mai: 'hi-IN',
  sa: 'hi-IN',
  kok: 'hi-IN',
  doi: 'hi-IN',
  bodo: 'hi-IN',
  sat: 'hi-IN',
  ks: 'hi-IN',
  // Sindhi uses Arabic script -> Urdu engine renders it best.
  sd: 'ur-IN',
  // Manipuri uses Bengali script in this app -> Bengali engine.
  mni: 'bn-IN',
};

export function localeFor(lang: LangCode): string {
  return LOCALE_FOR[lang] ?? 'en-IN';
}

// ---------- Routes the voice guide can navigate to ----------------------

export type VoiceRoute =
  | '/(main)/(tabs)'
  | '/(main)/(tabs)/contacts'
  | '/(main)/(tabs)/speed'
  | '/(main)/(tabs)/safety'
  | '/(main)/(tabs)/settings'
  | '/(main)/helplines'
  | '/(main)/fake-call'
  | '/(main)/camera-detector'
  | '/(main)/nearby-services'
  | '/(main)/audio-recorder'
  | '/(main)/alert-history'
  | '/(main)/behavior-monitor'
  | '/(main)/check-in'
  | '/(main)/journey-monitor'
  | '/(main)/evidence-locker'
  | '/(main)/user-profile'
  | '/(main)/neuroband';

export type VoiceCommand =
  | 'home'
  | 'contacts'
  | 'speed'
  | 'safety'
  | 'settings'
  | 'helplines'
  | 'fakeCall'
  | 'cameraDetector'
  | 'nearbyServices'
  | 'audioRecorder'
  | 'alertHistory'
  | 'behaviorMonitor'
  | 'checkIn'
  | 'journeyMonitor'
  | 'evidenceLocker'
  | 'userProfile'
  | 'neuroband'
  | 'sos'
  | 'shareLocation'
  | 'callEmergency'
  | 'stop'
  | 'help'
  | 'back';

export type CommandSpec = {
  command: VoiceCommand;
  /** Where this command sends the user, if it's a navigation command. */
  route?: VoiceRoute;
  /** Action key consumed by VoiceGuideProvider (sos / share-location / etc.) */
  action?: 'sos' | 'shareLocation' | 'callEmergency' | 'stop' | 'help' | 'back';
  /** Material icon name. */
  icon: string;
  /** Tint colour family for the palette. */
  tone: 'violet' | 'pink' | 'blue' | 'green' | 'amber' | 'red' | 'cyan' | 'indigo';
};

export const COMMANDS: CommandSpec[] = [
  { command: 'home',             route: '/(main)/(tabs)',                  icon: 'home-variant',         tone: 'violet' },
  { command: 'contacts',         route: '/(main)/(tabs)/contacts',         icon: 'account-heart',        tone: 'pink'   },
  { command: 'speed',            route: '/(main)/(tabs)/speed',            icon: 'speedometer',          tone: 'cyan'   },
  { command: 'safety',           route: '/(main)/(tabs)/safety',           icon: 'shield-star',          tone: 'indigo' },
  { command: 'settings',         route: '/(main)/(tabs)/settings',         icon: 'cog',                  tone: 'blue'   },
  { command: 'helplines',        route: '/(main)/helplines',               icon: 'phone-classic',        tone: 'violet' },
  { command: 'fakeCall',         route: '/(main)/fake-call',               icon: 'phone-incoming',       tone: 'green'  },
  { command: 'cameraDetector',   route: '/(main)/camera-detector',         icon: 'camera-wireless-outline', tone: 'amber' },
  { command: 'nearbyServices',   route: '/(main)/nearby-services',         icon: 'map-search-outline',   tone: 'cyan'   },
  { command: 'audioRecorder',    route: '/(main)/audio-recorder',          icon: 'microphone',           tone: 'pink'   },
  { command: 'alertHistory',     route: '/(main)/alert-history',           icon: 'history',              tone: 'indigo' },
  { command: 'behaviorMonitor',  route: '/(main)/behavior-monitor',        icon: 'brain',                tone: 'green'  },
  { command: 'checkIn',          route: '/(main)/check-in',                icon: 'timer-sand',           tone: 'violet' },
  { command: 'journeyMonitor',   route: '/(main)/journey-monitor',         icon: 'map-marker-path',      tone: 'violet' },
  { command: 'evidenceLocker',   route: '/(main)/evidence-locker',         icon: 'folder-lock',          tone: 'amber'  },
  { command: 'userProfile',      route: '/(main)/user-profile',            icon: 'account-circle',       tone: 'pink'   },
  { command: 'neuroband',        route: '/(main)/neuroband',               icon: 'watch-variant',        tone: 'violet' },
  { command: 'sos',              action: 'sos',           icon: 'alarm-light',     tone: 'red'    },
  { command: 'shareLocation',    action: 'shareLocation', icon: 'map-marker-radius', tone: 'blue' },
  { command: 'callEmergency',    action: 'callEmergency', icon: 'phone-alert',     tone: 'red'    },
  { command: 'stop',             action: 'stop',          icon: 'volume-off',      tone: 'amber'  },
  { command: 'help',             action: 'help',          icon: 'help-circle',     tone: 'cyan'   },
  { command: 'back',             action: 'back',          icon: 'arrow-left',      tone: 'indigo' },
];

// ---------- Translation strings -----------------------------------------

export type VoiceStringKey =
  // System / framing
  | 'voiceGuide'
  | 'voiceGuideOn'
  | 'voiceGuideOff'
  | 'enableHint'
  | 'introHint'
  | 'listening'
  | 'didNotUnderstand'
  | 'commandPaletteTitle'
  | 'commandPaletteHint'
  | 'noSpeechEngine'
  | 'tapAnyCommand'
  | 'speakIntro'
  | 'speakRate'
  | 'speakPitch'
  | 'announceScreens'
  | 'announceScreensDesc'
  | 'announceButtons'
  | 'announceButtonsDesc'
  | 'voiceGuideDesc'
  // Per-screen friendly names (used both for announcements and palette labels)
  | 'screenHome'
  | 'screenContacts'
  | 'screenSpeed'
  | 'screenSafety'
  | 'screenSettings'
  | 'screenHelplines'
  | 'screenFakeCall'
  | 'screenCameraDetector'
  | 'screenNearbyServices'
  | 'screenAudioRecorder'
  | 'screenAlertHistory'
  | 'screenBehaviorMonitor'
  | 'screenCheckIn'
  | 'screenJourneyMonitor'
  | 'screenEvidenceLocker'
  | 'screenUserProfile'
  | 'screenNeuroband'
  // Screen entry hints (a short sentence explaining what the screen does)
  | 'hintHome'
  | 'hintContacts'
  | 'hintSpeed'
  | 'hintSafety'
  | 'hintSettings'
  | 'hintHelplines'
  | 'hintFakeCall'
  | 'hintCameraDetector'
  | 'hintNearbyServices'
  | 'hintAudioRecorder'
  | 'hintAlertHistory'
  | 'hintBehaviorMonitor'
  | 'hintCheckIn'
  | 'hintJourneyMonitor'
  | 'hintEvidenceLocker'
  | 'hintUserProfile'
  | 'hintNeuroband'
  // Action labels
  | 'actionSos'
  | 'actionShareLocation'
  | 'actionCallEmergency'
  | 'actionStopSpeaking'
  | 'actionHelp'
  | 'actionBack'
  // Confirmations
  | 'goingTo'
  | 'sosTriggered'
  | 'sharingLocation'
  | 'callingEmergency'
  | 'stopped'
  | 'goingBack'
  // Help message
  | 'helpMessage';

type VoiceStrings = Record<VoiceStringKey, string>;

const EN: VoiceStrings = {
  voiceGuide: 'Voice guide',
  voiceGuideOn: 'Voice guide on',
  voiceGuideOff: 'Voice guide off',
  enableHint: 'Enable to hear screen names and tap any command to navigate by voice.',
  introHint:
    'Voice guide enabled. Tap the microphone button at the bottom right to open the command palette and navigate by voice.',
  listening: 'Listening',
  didNotUnderstand: "I didn't catch that. Tap a command from the list.",
  commandPaletteTitle: 'Voice commands',
  commandPaletteHint: 'Tap a command — I will speak it and take you there.',
  noSpeechEngine:
    'Speech engine is not available on this build. The command palette still works as taps.',
  tapAnyCommand: 'Tap any command.',
  speakIntro: 'Speak intro on screen',
  speakRate: 'Speech rate',
  speakPitch: 'Speech pitch',
  announceScreens: 'Announce screens',
  announceScreensDesc: 'Speak the screen name and a short hint when you open it',
  announceButtons: 'Announce key buttons',
  announceButtonsDesc: 'Confirm SOS, share location and other key actions out loud',
  voiceGuideDesc:
    'Hear what is on screen and navigate the whole app with your voice in your language.',
  screenHome: 'Home',
  screenContacts: 'Trusted contacts',
  screenSpeed: 'Speed',
  screenSafety: 'Safety tools',
  screenSettings: 'Settings',
  screenHelplines: 'Helplines',
  screenFakeCall: 'Fake call',
  screenCameraDetector: 'Hidden camera detector',
  screenNearbyServices: 'Nearby services',
  screenAudioRecorder: 'Audio recorder',
  screenAlertHistory: 'Alert history',
  screenBehaviorMonitor: 'Behavior monitor',
  screenCheckIn: 'Timer check-in',
  screenJourneyMonitor: 'Journey monitor',
  screenEvidenceLocker: 'Evidence locker',
  screenUserProfile: 'Profile',
  screenNeuroband: 'NeuroBand',
  hintHome: 'Tap S O S in the centre, or pick a quick action.',
  hintContacts: 'Add or edit the trusted contacts who get your S O S.',
  hintSpeed: 'Live speed and crash detection settings.',
  hintSafety: 'All safety tools in one place.',
  hintSettings: 'Configure shake, voice trigger, app lock and more.',
  hintHelplines: 'Quick-dial police, women, child and ambulance helplines.',
  hintFakeCall: 'Trigger a believable incoming call to escape an unsafe moment.',
  hintCameraDetector: 'Scan a room for hidden cameras with your phone sensors.',
  hintNearbyServices: 'Find police stations, hospitals and pharmacies near you.',
  hintAudioRecorder: 'Quietly record audio evidence to your evidence locker.',
  hintAlertHistory: 'Review every alert you have sent.',
  hintBehaviorMonitor: 'Detect distress patterns from how you use the phone.',
  hintCheckIn: 'Start a timer; auto-S O S if you do not confirm in time.',
  hintJourneyMonitor: 'Share a live trip with auto-S O S on detour.',
  hintEvidenceLocker: 'Encrypted evidence sessions with cloud sync.',
  hintUserProfile: 'View and edit your profile.',
  hintNeuroband: 'Bio-signal silent trigger from your wearable.',
  actionSos: 'Send S O S',
  actionShareLocation: 'Share location',
  actionCallEmergency: 'Call emergency',
  actionStopSpeaking: 'Stop speaking',
  actionHelp: 'Help',
  actionBack: 'Go back',
  goingTo: 'Going to',
  sosTriggered: 'Sending S O S now',
  sharingLocation: 'Sharing your location',
  callingEmergency: 'Calling emergency line',
  stopped: 'Stopped',
  goingBack: 'Going back',
  helpMessage:
    'I can take you to any screen. Try home, contacts, safety, settings, helplines, fake call, audio recorder, journey monitor, or say S O S, share location, call emergency.',
};

const HI: VoiceStrings = {
  voiceGuide: 'वॉयस गाइड',
  voiceGuideOn: 'वॉयस गाइड चालू',
  voiceGuideOff: 'वॉयस गाइड बंद',
  enableHint: 'चालू करें ताकि स्क्रीन के नाम सुन सकें और किसी भी कमांड पर टैप करके आवाज़ से नेविगेट कर सकें।',
  introHint:
    'वॉयस गाइड चालू है। नीचे दाएँ माइक बटन दबाकर कमांड पैलेट खोलें और आवाज़ से नेविगेट करें।',
  listening: 'सुन रहा हूँ',
  didNotUnderstand: 'समझ नहीं आया। सूची से कोई कमांड टैप करें।',
  commandPaletteTitle: 'वॉयस कमांड',
  commandPaletteHint: 'किसी कमांड पर टैप करें — मैं उसे बोलूँगा और आपको वहाँ ले जाऊँगा।',
  noSpeechEngine:
    'इस बिल्ड में स्पीच इंजन उपलब्ध नहीं है। कमांड पैलेट टैप से अब भी काम करेगा।',
  tapAnyCommand: 'किसी भी कमांड पर टैप करें।',
  speakIntro: 'स्क्रीन पर परिचय बोलें',
  speakRate: 'बोलने की गति',
  speakPitch: 'आवाज़ का पिच',
  announceScreens: 'स्क्रीन की घोषणा',
  announceScreensDesc: 'स्क्रीन खोलते ही उसका नाम और संक्षिप्त संकेत बोलें',
  announceButtons: 'मुख्य बटन की घोषणा',
  announceButtonsDesc: 'एसओएस, लोकेशन शेयर और अन्य मुख्य क्रियाओं की पुष्टि बोलकर करें',
  voiceGuideDesc:
    'स्क्रीन पर क्या है सुनें और पूरे ऐप को अपनी भाषा में आवाज़ से नेविगेट करें।',
  screenHome: 'मुख्य पृष्ठ',
  screenContacts: 'विश्वसनीय संपर्क',
  screenSpeed: 'गति',
  screenSafety: 'सुरक्षा उपकरण',
  screenSettings: 'सेटिंग्स',
  screenHelplines: 'हेल्पलाइन',
  screenFakeCall: 'नकली कॉल',
  screenCameraDetector: 'छिपे कैमरा डिटेक्टर',
  screenNearbyServices: 'पास की सेवाएँ',
  screenAudioRecorder: 'ऑडियो रिकॉर्डर',
  screenAlertHistory: 'अलर्ट इतिहास',
  screenBehaviorMonitor: 'व्यवहार मॉनिटर',
  screenCheckIn: 'टाइमर चेक-इन',
  screenJourneyMonitor: 'यात्रा मॉनिटर',
  screenEvidenceLocker: 'साक्ष्य लॉकर',
  screenUserProfile: 'प्रोफ़ाइल',
  screenNeuroband: 'न्यूरोबैंड',
  hintHome: 'बीच में एसओएस दबाएँ या कोई क्विक एक्शन चुनें।',
  hintContacts: 'अपने विश्वसनीय संपर्क जोड़ें जिन्हें एसओएस मिलेगा।',
  hintSpeed: 'लाइव गति और दुर्घटना डिटेक्शन सेटिंग्स।',
  hintSafety: 'सभी सुरक्षा उपकरण एक जगह।',
  hintSettings: 'शेक, वॉयस ट्रिगर, ऐप लॉक और बहुत कुछ कॉन्फ़िगर करें।',
  hintHelplines: 'पुलिस, महिला, बाल और एम्बुलेंस हेल्पलाइन क्विक-डायल।',
  hintFakeCall: 'असुरक्षित पल से बचने के लिए असली जैसी इनकमिंग कॉल चलाएँ।',
  hintCameraDetector: 'फोन सेंसर से कमरे में छिपे कैमरे खोजें।',
  hintNearbyServices: 'पास के पुलिस स्टेशन, अस्पताल और मेडिकल खोजें।',
  hintAudioRecorder: 'चुपचाप ऑडियो साक्ष्य रिकॉर्ड करें।',
  hintAlertHistory: 'भेजे गए सभी अलर्ट देखें।',
  hintBehaviorMonitor: 'फोन उपयोग से तनाव के पैटर्न पहचानें।',
  hintCheckIn: 'टाइमर शुरू करें; समय पर पुष्टि न करने पर ऑटो-एसओएस।',
  hintJourneyMonitor: 'लाइव यात्रा साझा करें; मार्ग बदलने पर ऑटो-एसओएस।',
  hintEvidenceLocker: 'क्लाउड सिंक के साथ एन्क्रिप्टेड साक्ष्य सेशन।',
  hintUserProfile: 'अपनी प्रोफ़ाइल देखें और संपादित करें।',
  hintNeuroband: 'पहनने योग्य से बायो-सिग्नल साइलेंट ट्रिगर।',
  actionSos: 'एसओएस भेजें',
  actionShareLocation: 'लोकेशन साझा करें',
  actionCallEmergency: 'इमरजेंसी कॉल',
  actionStopSpeaking: 'बोलना बंद करें',
  actionHelp: 'सहायता',
  actionBack: 'वापस जाएँ',
  goingTo: 'जा रहे हैं',
  sosTriggered: 'एसओएस भेजा जा रहा है',
  sharingLocation: 'आपकी लोकेशन साझा हो रही है',
  callingEmergency: 'इमरजेंसी लाइन डायल हो रही है',
  stopped: 'रोक दिया',
  goingBack: 'वापस जा रहे हैं',
  helpMessage:
    'मैं आपको किसी भी स्क्रीन पर ले जा सकता हूँ। होम, संपर्क, सुरक्षा, सेटिंग्स, हेल्पलाइन, नकली कॉल, ऑडियो रिकॉर्डर, यात्रा मॉनिटर बोलें या एसओएस, लोकेशन साझा करें, इमरजेंसी कॉल कहें।',
};

const BN: VoiceStrings = {
  voiceGuide: 'ভয়েস গাইড',
  voiceGuideOn: 'ভয়েস গাইড চালু',
  voiceGuideOff: 'ভয়েস গাইড বন্ধ',
  enableHint: 'চালু করুন স্ক্রিনের নাম শুনতে এবং যেকোনো কমান্ডে ট্যাপ করে কণ্ঠ দিয়ে নেভিগেট করতে।',
  introHint: 'ভয়েস গাইড চালু আছে। নিচে ডানদিকে মাইক বোতাম চাপুন এবং কমান্ড প্যালেট খুলে কণ্ঠ দিয়ে নেভিগেট করুন।',
  listening: 'শুনছি',
  didNotUnderstand: 'বুঝতে পারিনি। তালিকা থেকে একটি কমান্ড ট্যাপ করুন।',
  commandPaletteTitle: 'ভয়েস কমান্ড',
  commandPaletteHint: 'একটি কমান্ডে ট্যাপ করুন — আমি বলব এবং আপনাকে সেখানে নিয়ে যাব।',
  noSpeechEngine: 'এই বিল্ডে স্পিচ ইঞ্জিন নেই। কমান্ড প্যালেট ট্যাপের মাধ্যমে কাজ করবে।',
  tapAnyCommand: 'যেকোনো কমান্ডে ট্যাপ করুন।',
  speakIntro: 'স্ক্রিনের পরিচয় বলুন',
  speakRate: 'বলার গতি',
  speakPitch: 'কণ্ঠের পিচ',
  announceScreens: 'স্ক্রিন ঘোষণা',
  announceScreensDesc: 'স্ক্রিন খোলার সাথে সাথে নাম এবং সংক্ষিপ্ত ইঙ্গিত বলুন',
  announceButtons: 'মূল বোতাম ঘোষণা',
  announceButtonsDesc: 'এসওএস, লোকেশন শেয়ার এবং অন্য মূল ক্রিয়া উচ্চস্বরে নিশ্চিত করুন',
  voiceGuideDesc: 'স্ক্রিনে কী আছে শুনুন এবং পুরো অ্যাপটি আপনার ভাষায় কণ্ঠ দিয়ে নেভিগেট করুন।',
  screenHome: 'হোম',
  screenContacts: 'বিশ্বস্ত পরিচিতি',
  screenSpeed: 'গতি',
  screenSafety: 'নিরাপত্তা সরঞ্জাম',
  screenSettings: 'সেটিংস',
  screenHelplines: 'হেল্পলাইন',
  screenFakeCall: 'নকল কল',
  screenCameraDetector: 'লুকানো ক্যামেরা ডিটেক্টর',
  screenNearbyServices: 'নিকটবর্তী সেবা',
  screenAudioRecorder: 'অডিও রেকর্ডার',
  screenAlertHistory: 'অ্যালার্ট ইতিহাস',
  screenBehaviorMonitor: 'আচরণ মনিটর',
  screenCheckIn: 'টাইমার চেক-ইন',
  screenJourneyMonitor: 'যাত্রা মনিটর',
  screenEvidenceLocker: 'প্রমাণ লকার',
  screenUserProfile: 'প্রোফাইল',
  screenNeuroband: 'নিউরোব্যান্ড',
  hintHome: 'কেন্দ্রে এসওএস চাপুন বা একটি দ্রুত ক্রিয়া বেছে নিন।',
  hintContacts: 'বিশ্বস্ত পরিচিতি যোগ বা সম্পাদনা করুন যারা আপনার এসওএস পাবেন।',
  hintSpeed: 'লাইভ গতি এবং দুর্ঘটনা শনাক্তকরণ সেটিংস।',
  hintSafety: 'সব নিরাপত্তা সরঞ্জাম এক জায়গায়।',
  hintSettings: 'শেক, ভয়েস ট্রিগার, অ্যাপ লক ইত্যাদি কনফিগার করুন।',
  hintHelplines: 'পুলিশ, নারী, শিশু এবং অ্যাম্বুলেন্স হেল্পলাইন দ্রুত-ডায়াল।',
  hintFakeCall: 'অনিরাপদ মুহূর্ত থেকে পালাতে বিশ্বাসযোগ্য ইনকামিং কল।',
  hintCameraDetector: 'ফোন সেন্সর দিয়ে ঘরে লুকানো ক্যামেরা খুঁজুন।',
  hintNearbyServices: 'কাছের পুলিশ স্টেশন, হাসপাতাল এবং ফার্মেসি খুঁজুন।',
  hintAudioRecorder: 'নীরবে অডিও প্রমাণ রেকর্ড করুন।',
  hintAlertHistory: 'আপনার পাঠানো প্রতিটি অ্যালার্ট পর্যালোচনা করুন।',
  hintBehaviorMonitor: 'ফোন ব্যবহার থেকে দুর্দশার ধরন শনাক্ত করুন।',
  hintCheckIn: 'টাইমার শুরু করুন; সময়মতো নিশ্চিত না করলে অটো-এসওএস।',
  hintJourneyMonitor: 'লাইভ যাত্রা শেয়ার করুন; পথ পরিবর্তনে অটো-এসওএস।',
  hintEvidenceLocker: 'ক্লাউড সিঙ্কসহ এনক্রিপ্টেড প্রমাণ সেশন।',
  hintUserProfile: 'আপনার প্রোফাইল দেখুন এবং সম্পাদনা করুন।',
  hintNeuroband: 'পরিধেয় থেকে বায়ো-সংকেত নীরব ট্রিগার।',
  actionSos: 'এসওএস পাঠান',
  actionShareLocation: 'লোকেশন শেয়ার',
  actionCallEmergency: 'জরুরি কল',
  actionStopSpeaking: 'বলা বন্ধ',
  actionHelp: 'সহায়তা',
  actionBack: 'ফিরে যান',
  goingTo: 'যাচ্ছি',
  sosTriggered: 'এসওএস পাঠানো হচ্ছে',
  sharingLocation: 'আপনার লোকেশন শেয়ার হচ্ছে',
  callingEmergency: 'জরুরি লাইন ডায়াল হচ্ছে',
  stopped: 'বন্ধ',
  goingBack: 'ফিরে যাচ্ছি',
  helpMessage:
    'আমি আপনাকে যেকোনো স্ক্রিনে নিয়ে যেতে পারি। হোম, পরিচিতি, নিরাপত্তা, সেটিংস, হেল্পলাইন, নকল কল, অডিও রেকর্ডার, যাত্রা মনিটর বলুন; অথবা এসওএস, লোকেশন শেয়ার, জরুরি কল বলুন।',
};

const TE: VoiceStrings = {
  voiceGuide: 'వాయిస్ గైడ్',
  voiceGuideOn: 'వాయిస్ గైడ్ ఆన్',
  voiceGuideOff: 'వాయిస్ గైడ్ ఆఫ్',
  enableHint: 'ఎనేబుల్ చేయండి — తెర పేర్లు వినండి మరియు ఏదైనా ఆదేశంపై నొక్కి వాయిస్‌తో నావిగేట్ చేయండి.',
  introHint: 'వాయిస్ గైడ్ ఆన్ ఉంది. క్రింద కుడివైపున ఉన్న మైక్ బటన్ నొక్కి కమాండ్ ప్యాలెట్ తెరవండి.',
  listening: 'వింటున్నాను',
  didNotUnderstand: 'అర్థం కాలేదు. జాబితా నుండి ఒక ఆదేశాన్ని నొక్కండి.',
  commandPaletteTitle: 'వాయిస్ ఆదేశాలు',
  commandPaletteHint: 'ఒక ఆదేశంపై నొక్కండి — నేను మాట్లాడి మిమ్మల్ని తీసుకెళతాను.',
  noSpeechEngine: 'ఈ బిల్డ్‌లో స్పీచ్ ఇంజిన్ లేదు. ఆదేశ ప్యాలెట్ నొక్కడం ద్వారా పనిచేస్తుంది.',
  tapAnyCommand: 'ఏదైనా ఆదేశాన్ని నొక్కండి.',
  speakIntro: 'తెరపై పరిచయం మాట్లాడండి',
  speakRate: 'మాట వేగం',
  speakPitch: 'స్వర పిచ్',
  announceScreens: 'తెరలను ప్రకటించు',
  announceScreensDesc: 'తెర తెరిచిన వెంటనే పేరు మరియు చిన్న సూచన మాట్లాడు',
  announceButtons: 'ముఖ్య బటన్లను ప్రకటించు',
  announceButtonsDesc: 'ఎస్ఓఎస్, లొకేషన్ షేర్ మరియు ఇతర ముఖ్య చర్యలను బిగ్గరగా నిర్ధారించు',
  voiceGuideDesc: 'తెరపై ఏముందో వినండి మరియు మొత్తం యాప్‌ను మీ భాషలో వాయిస్‌తో నావిగేట్ చేయండి.',
  screenHome: 'హోమ్',
  screenContacts: 'విశ్వసనీయ పరిచయాలు',
  screenSpeed: 'వేగం',
  screenSafety: 'భద్రతా సాధనాలు',
  screenSettings: 'సెట్టింగ్‌లు',
  screenHelplines: 'హెల్ప్‌లైన్‌లు',
  screenFakeCall: 'నకిలీ కాల్',
  screenCameraDetector: 'దాచిన కెమెరా డిటెక్టర్',
  screenNearbyServices: 'సమీప సేవలు',
  screenAudioRecorder: 'ఆడియో రికార్డర్',
  screenAlertHistory: 'హెచ్చరిక చరిత్ర',
  screenBehaviorMonitor: 'ప్రవర్తన మానిటర్',
  screenCheckIn: 'టైమర్ చెక్-ఇన్',
  screenJourneyMonitor: 'ప్రయాణ మానిటర్',
  screenEvidenceLocker: 'సాక్ష్య లాకర్',
  screenUserProfile: 'ప్రొఫైల్',
  screenNeuroband: 'న్యూరోబాండ్',
  hintHome: 'మధ్యలో ఎస్ఓఎస్ నొక్కండి లేదా త్వరిత చర్యను ఎంచుకోండి.',
  hintContacts: 'మీ ఎస్ఓఎస్ అందుకునే విశ్వసనీయ పరిచయాలను జోడించండి.',
  hintSpeed: 'లైవ్ వేగం మరియు ప్రమాద గుర్తింపు సెట్టింగ్‌లు.',
  hintSafety: 'అన్ని భద్రతా సాధనాలు ఒకే చోట.',
  hintSettings: 'షేక్, వాయిస్ ట్రిగ్గర్, యాప్ లాక్ మొదలైనవి కాన్ఫిగర్ చేయండి.',
  hintHelplines: 'పోలీస్, మహిళా, శిశు, అంబులెన్స్ హెల్ప్‌లైన్‌లకు త్వరిత డయల్.',
  hintFakeCall: 'అసురక్షిత క్షణం నుండి తప్పించుకోవడానికి నమ్మదగిన కాల్.',
  hintCameraDetector: 'మీ ఫోన్ సెన్సర్‌లతో దాచిన కెమెరాల కోసం గది స్కాన్ చేయండి.',
  hintNearbyServices: 'సమీప పోలీస్ స్టేషన్లు, ఆసుపత్రులు మరియు మెడికల్‌ను కనుగొనండి.',
  hintAudioRecorder: 'మీ సాక్ష్య లాకర్‌కు నిశ్శబ్దంగా ఆడియో రికార్డ్ చేయండి.',
  hintAlertHistory: 'మీరు పంపిన ప్రతి హెచ్చరికను సమీక్షించండి.',
  hintBehaviorMonitor: 'ఫోన్ ఉపయోగం నుండి ఇబ్బంది నమూనాలను గుర్తించండి.',
  hintCheckIn: 'టైమర్ ప్రారంభించండి; సమయానికి నిర్ధారించకపోతే ఆటో-ఎస్ఓఎస్.',
  hintJourneyMonitor: 'లైవ్ ప్రయాణాన్ని పంచుకోండి; మార్గం మారితే ఆటో-ఎస్ఓఎస్.',
  hintEvidenceLocker: 'క్లౌడ్ సింక్‌తో ఎన్‌క్రిప్టెడ్ సాక్ష్య సెషన్‌లు.',
  hintUserProfile: 'మీ ప్రొఫైల్‌ను చూడండి మరియు సవరించండి.',
  hintNeuroband: 'ధరించగల పరికరం నుండి బయో-సిగ్నల్ నిశ్శబ్ద ట్రిగ్గర్.',
  actionSos: 'ఎస్ఓఎస్ పంపండి',
  actionShareLocation: 'లొకేషన్ షేర్',
  actionCallEmergency: 'అత్యవసర కాల్',
  actionStopSpeaking: 'మాట్లాడటం ఆపండి',
  actionHelp: 'సహాయం',
  actionBack: 'వెనుకకు',
  goingTo: 'వెళుతున్నాను',
  sosTriggered: 'ఎస్ఓఎస్ పంపుతున్నాను',
  sharingLocation: 'మీ లొకేషన్‌ను పంచుకుంటున్నాను',
  callingEmergency: 'అత్యవసర లైన్‌ను డయల్ చేస్తున్నాను',
  stopped: 'ఆగింది',
  goingBack: 'వెనుకకు వెళుతున్నాను',
  helpMessage:
    'నేను మిమ్మల్ని ఏ తెరకైనా తీసుకెళ్లగలను. హోమ్, పరిచయాలు, భద్రత, సెట్టింగ్‌లు, హెల్ప్‌లైన్, నకిలీ కాల్, ఆడియో రికార్డర్, ప్రయాణ మానిటర్ చెప్పండి; లేదా ఎస్ఓఎస్, లొకేషన్ షేర్, అత్యవసర కాల్ చెప్పండి.',
};

const MR: VoiceStrings = {
  voiceGuide: 'व्हॉइस गाइड',
  voiceGuideOn: 'व्हॉइस गाइड चालू',
  voiceGuideOff: 'व्हॉइस गाइड बंद',
  enableHint: 'चालू करा — स्क्रीनची नावे ऐका आणि कोणत्याही कमांडवर टॅप करून आवाजाने नेव्हिगेट करा.',
  introHint: 'व्हॉइस गाइड चालू आहे. खाली उजवीकडील माइक बटण दाबून कमांड पॅलेट उघडा.',
  listening: 'ऐकत आहे',
  didNotUnderstand: 'समजले नाही. यादीतून एखादी कमांड टॅप करा.',
  commandPaletteTitle: 'व्हॉइस कमांड्स',
  commandPaletteHint: 'एखाद्या कमांडवर टॅप करा — मी ती बोलेन आणि तुम्हाला तिथे नेईन.',
  noSpeechEngine: 'या बिल्डमध्ये स्पीच इंजिन नाही. कमांड पॅलेट टॅपने काम करेल.',
  tapAnyCommand: 'कोणत्याही कमांडवर टॅप करा.',
  speakIntro: 'स्क्रीनवर परिचय बोला',
  speakRate: 'बोलण्याचा वेग',
  speakPitch: 'आवाजाचा पिच',
  announceScreens: 'स्क्रीन घोषणा',
  announceScreensDesc: 'स्क्रीन उघडल्यावर नाव आणि छोटी सूचना बोला',
  announceButtons: 'मुख्य बटणांची घोषणा',
  announceButtonsDesc: 'एसओएस, लोकेशन शेअर आणि इतर महत्त्वाच्या क्रियांची मोठ्याने पुष्टी करा',
  voiceGuideDesc: 'स्क्रीनवर काय आहे ऐका आणि संपूर्ण ऐप तुमच्या भाषेत आवाजाने नेव्हिगेट करा.',
  screenHome: 'मुख्यपृष्ठ',
  screenContacts: 'विश्वसनीय संपर्क',
  screenSpeed: 'वेग',
  screenSafety: 'सुरक्षा साधने',
  screenSettings: 'सेटिंग्ज',
  screenHelplines: 'हेल्पलाइन',
  screenFakeCall: 'खोटा कॉल',
  screenCameraDetector: 'लपलेला कॅमेरा डिटेक्टर',
  screenNearbyServices: 'जवळच्या सेवा',
  screenAudioRecorder: 'ऑडिओ रेकॉर्डर',
  screenAlertHistory: 'अलर्ट इतिहास',
  screenBehaviorMonitor: 'वर्तन मॉनिटर',
  screenCheckIn: 'टायमर चेक-इन',
  screenJourneyMonitor: 'प्रवास मॉनिटर',
  screenEvidenceLocker: 'पुरावा लॉकर',
  screenUserProfile: 'प्रोफाइल',
  screenNeuroband: 'न्यूरोबँड',
  hintHome: 'मध्यभागी एसओएस दाबा किंवा क्विक अॅक्शन निवडा.',
  hintContacts: 'एसओएस मिळणारे विश्वसनीय संपर्क जोडा किंवा संपादित करा.',
  hintSpeed: 'लाइव्ह वेग आणि अपघात ओळख सेटिंग्ज.',
  hintSafety: 'सर्व सुरक्षा साधने एका ठिकाणी.',
  hintSettings: 'शेक, व्हॉइस ट्रिगर, अॅप लॉक इत्यादी कॉन्फिगर करा.',
  hintHelplines: 'पोलीस, महिला, बाल आणि अॅम्ब्युलन्स हेल्पलाइन क्विक-डायल.',
  hintFakeCall: 'असुरक्षित क्षणातून सुटका करण्यासाठी विश्वासार्ह येणारा कॉल.',
  hintCameraDetector: 'फोन सेन्सरद्वारे खोलीत लपलेले कॅमेरे शोधा.',
  hintNearbyServices: 'जवळची पोलीस ठाणी, रुग्णालये आणि औषधालये शोधा.',
  hintAudioRecorder: 'शांतपणे ऑडिओ पुरावा रेकॉर्ड करा.',
  hintAlertHistory: 'तुम्ही पाठवलेला प्रत्येक अलर्ट पहा.',
  hintBehaviorMonitor: 'फोन वापरावरून त्रासाचे पॅटर्न ओळखा.',
  hintCheckIn: 'टायमर सुरू करा; वेळेवर पुष्टी न केल्यास ऑटो-एसओएस.',
  hintJourneyMonitor: 'थेट प्रवास सामायिक करा; मार्ग बदलल्यास ऑटो-एसओएस.',
  hintEvidenceLocker: 'क्लाउड सिंकसह एन्क्रिप्टेड पुरावा सत्रे.',
  hintUserProfile: 'तुमची प्रोफाइल पहा आणि संपादित करा.',
  hintNeuroband: 'परिधान करण्यायोग्य उपकरणावरून बायो-सिग्नल मूक ट्रिगर.',
  actionSos: 'एसओएस पाठवा',
  actionShareLocation: 'लोकेशन शेअर',
  actionCallEmergency: 'आणीबाणी कॉल',
  actionStopSpeaking: 'बोलणे थांबवा',
  actionHelp: 'मदत',
  actionBack: 'मागे जा',
  goingTo: 'जात आहे',
  sosTriggered: 'एसओएस पाठवत आहे',
  sharingLocation: 'तुमचे लोकेशन शेअर करत आहे',
  callingEmergency: 'आणीबाणी लाइन डायल करत आहे',
  stopped: 'थांबवले',
  goingBack: 'मागे जात आहे',
  helpMessage:
    'मी तुम्हाला कोणत्याही स्क्रीनवर नेऊ शकतो. होम, संपर्क, सुरक्षा, सेटिंग्ज, हेल्पलाइन, खोटा कॉल, ऑडिओ रेकॉर्डर, प्रवास मॉनिटर म्हणा; किंवा एसओएस, लोकेशन शेअर, आणीबाणी कॉल म्हणा.',
};

const TA: VoiceStrings = {
  voiceGuide: 'குரல் வழிகாட்டி',
  voiceGuideOn: 'குரல் வழிகாட்டி இயக்கப்பட்டது',
  voiceGuideOff: 'குரல் வழிகாட்டி நிறுத்தப்பட்டது',
  enableHint: 'திரை பெயர்களைக் கேட்கவும், எந்த கட்டளையையும் தட்டி குரல் மூலம் வழிசெலுத்தவும் இதை இயக்கவும்.',
  introHint: 'குரல் வழிகாட்டி இயக்கப்பட்டுள்ளது. கீழ் வலதில் உள்ள மைக் பொத்தானை அழுத்தி கட்டளை பலகையைத் திறக்கவும்.',
  listening: 'கேட்கிறேன்',
  didNotUnderstand: 'புரியவில்லை. பட்டியலில் இருந்து ஒரு கட்டளையைத் தட்டவும்.',
  commandPaletteTitle: 'குரல் கட்டளைகள்',
  commandPaletteHint: 'ஒரு கட்டளையைத் தட்டவும் — நான் பேசி அந்த இடத்திற்கு அழைத்துச் செல்வேன்.',
  noSpeechEngine: 'இந்த பதிப்பில் பேச்சு இயந்திரம் இல்லை. கட்டளை பலகை தட்டலின் மூலம் வேலை செய்யும்.',
  tapAnyCommand: 'எந்த கட்டளையையும் தட்டவும்.',
  speakIntro: 'திரையில் அறிமுகத்தை பேசு',
  speakRate: 'பேச்சு வேகம்',
  speakPitch: 'குரல் பிட்ச்',
  announceScreens: 'திரைகளை அறிவி',
  announceScreensDesc: 'திரை திறக்கப்பட்டவுடன் பெயரையும் சிறிய துப்பையும் பேசு',
  announceButtons: 'முக்கிய பொத்தான்களை அறிவி',
  announceButtonsDesc: 'எஸ்ஓஎஸ், இடம் பகிர்வு போன்ற முக்கிய செயல்களை வாய்மொழியாக உறுதி செய்',
  voiceGuideDesc: 'திரையில் என்ன உள்ளது என்பதைக் கேளுங்கள், முழு பயன்பாட்டையும் உங்கள் மொழியில் குரல் மூலம் வழிசெலுத்துங்கள்.',
  screenHome: 'முகப்பு',
  screenContacts: 'நம்பகமான தொடர்புகள்',
  screenSpeed: 'வேகம்',
  screenSafety: 'பாதுகாப்பு கருவிகள்',
  screenSettings: 'அமைப்புகள்',
  screenHelplines: 'உதவி எண்கள்',
  screenFakeCall: 'போலி அழைப்பு',
  screenCameraDetector: 'மறைக்கப்பட்ட கேமரா கண்டறிதல்',
  screenNearbyServices: 'அருகிலுள்ள சேவைகள்',
  screenAudioRecorder: 'ஒலி பதிவு',
  screenAlertHistory: 'எச்சரிக்கை வரலாறு',
  screenBehaviorMonitor: 'நடத்தை கண்காணிப்பு',
  screenCheckIn: 'டைமர் செக்-இன்',
  screenJourneyMonitor: 'பயண கண்காணிப்பு',
  screenEvidenceLocker: 'ஆதார பெட்டகம்',
  screenUserProfile: 'சுயவிவரம்',
  screenNeuroband: 'நியூரோபேண்ட்',
  hintHome: 'மையத்தில் எஸ்ஓஎஸ் அழுத்தவும் அல்லது விரைவு செயலைத் தேர்வு செய்யவும்.',
  hintContacts: 'எஸ்ஓஎஸ் பெறும் நம்பகமான தொடர்புகளைச் சேர்க்கவும் அல்லது திருத்தவும்.',
  hintSpeed: 'நேரடி வேகம் மற்றும் விபத்து கண்டறிதல் அமைப்புகள்.',
  hintSafety: 'அனைத்து பாதுகாப்பு கருவிகளும் ஒரே இடத்தில்.',
  hintSettings: 'அலையடிப்பு, குரல் தூண்டல், பயன்பாட்டு பூட்டு போன்றவற்றை கட்டமைக்கவும்.',
  hintHelplines: 'காவல், பெண்கள், குழந்தை, ஆம்புலன்ஸ் உதவி எண் விரைவு-டயல்.',
  hintFakeCall: 'பாதுகாப்பற்ற நேரத்திலிருந்து தப்பிக்க நம்பகமான வரும் அழைப்பு.',
  hintCameraDetector: 'மறைக்கப்பட்ட கேமராக்களுக்காக உங்கள் ஃபோன் சென்சார்களால் அறையை ஸ்கேன் செய்யுங்கள்.',
  hintNearbyServices: 'அருகில் உள்ள காவல் நிலையங்கள், மருத்துவமனைகள் மற்றும் மருந்தகங்களைக் கண்டறியவும்.',
  hintAudioRecorder: 'உங்கள் ஆதார பெட்டகத்திற்கு அமைதியாக ஒலி ஆதாரத்தை பதிவு செய்யுங்கள்.',
  hintAlertHistory: 'நீங்கள் அனுப்பிய ஒவ்வொரு எச்சரிக்கையையும் பார்க்கவும்.',
  hintBehaviorMonitor: 'ஃபோன் பயன்பாட்டிலிருந்து கஷ்ட வடிவங்களை கண்டறியவும்.',
  hintCheckIn: 'டைமரைத் தொடங்கவும்; நேரத்தில் உறுதிப்படுத்தவில்லை எனில் தானாக எஸ்ஓஎஸ்.',
  hintJourneyMonitor: 'நேரடி பயணத்தைப் பகிரவும்; வழித் திருப்பத்தில் தானாக எஸ்ஓஎஸ்.',
  hintEvidenceLocker: 'மேக ஒத்திசைவுடன் என்க்ரிப்ட் செய்யப்பட்ட ஆதார அமர்வுகள்.',
  hintUserProfile: 'உங்கள் சுயவிவரத்தைப் பார்க்கவும், திருத்தவும்.',
  hintNeuroband: 'அணியக்கூடிய சாதனத்திலிருந்து உயிரியல்-சமிக்ஞை அமைதி தூண்டுதல்.',
  actionSos: 'எஸ்ஓஎஸ் அனுப்பு',
  actionShareLocation: 'இடத்தை பகிர்',
  actionCallEmergency: 'அவசர அழைப்பு',
  actionStopSpeaking: 'பேசுவதை நிறுத்து',
  actionHelp: 'உதவி',
  actionBack: 'பின்செல்',
  goingTo: 'செல்கிறேன்',
  sosTriggered: 'எஸ்ஓஎஸ் அனுப்புகிறேன்',
  sharingLocation: 'உங்கள் இடத்தைப் பகிர்கிறேன்',
  callingEmergency: 'அவசர வரியை அழைக்கிறேன்',
  stopped: 'நிறுத்தப்பட்டது',
  goingBack: 'பின் செல்கிறேன்',
  helpMessage:
    'நான் உங்களை எந்த திரைக்கும் அழைத்துச் செல்ல முடியும். முகப்பு, தொடர்புகள், பாதுகாப்பு, அமைப்புகள், உதவி எண், போலி அழைப்பு, ஒலி பதிவு, பயண கண்காணிப்பு என்று சொல்லுங்கள்; அல்லது எஸ்ஓஎஸ், இடத்தை பகிர், அவசர அழைப்பு என்று சொல்லுங்கள்.',
};

const UR: VoiceStrings = {
  voiceGuide: 'وائس گائیڈ',
  voiceGuideOn: 'وائس گائیڈ آن',
  voiceGuideOff: 'وائس گائیڈ آف',
  enableHint: 'فعال کریں — اسکرین کے نام سنیں اور کسی بھی کمانڈ کو ٹیپ کر کے آواز سے نیویگیٹ کریں۔',
  introHint: 'وائس گائیڈ آن ہے۔ نیچے دائیں طرف مائیک بٹن دبا کر کمانڈ پیلیٹ کھولیں۔',
  listening: 'سن رہا ہوں',
  didNotUnderstand: 'سمجھ نہیں آیا۔ فہرست سے کوئی کمانڈ ٹیپ کریں۔',
  commandPaletteTitle: 'وائس کمانڈز',
  commandPaletteHint: 'کسی کمانڈ کو ٹیپ کریں — میں بولوں گا اور آپ کو وہاں لے جاؤں گا۔',
  noSpeechEngine: 'اس بلڈ میں اسپیچ انجن نہیں ہے۔ کمانڈ پیلیٹ ٹیپ سے کام کرے گا۔',
  tapAnyCommand: 'کسی بھی کمانڈ پر ٹیپ کریں۔',
  speakIntro: 'اسکرین پر تعارف بولیں',
  speakRate: 'بولنے کی رفتار',
  speakPitch: 'آواز کی پچ',
  announceScreens: 'اسکرینز کا اعلان',
  announceScreensDesc: 'اسکرین کھلتے ہی اس کا نام اور مختصر اشارہ بولیں',
  announceButtons: 'اہم بٹنوں کا اعلان',
  announceButtonsDesc: 'ایس او ایس، لوکیشن شیئر اور دیگر اہم اعمال کو بلند آواز سے تصدیق کریں',
  voiceGuideDesc: 'اسکرین پر کیا ہے سنیں اور پوری ایپ کو اپنی زبان میں آواز سے نیویگیٹ کریں۔',
  screenHome: 'ہوم',
  screenContacts: 'قابل اعتماد رابطے',
  screenSpeed: 'رفتار',
  screenSafety: 'حفاظتی ٹولز',
  screenSettings: 'ترتیبات',
  screenHelplines: 'ہیلپ لائنز',
  screenFakeCall: 'جعلی کال',
  screenCameraDetector: 'چھپا ہوا کیمرا ڈیٹیکٹر',
  screenNearbyServices: 'قریبی خدمات',
  screenAudioRecorder: 'آڈیو ریکارڈر',
  screenAlertHistory: 'الرٹ ہسٹری',
  screenBehaviorMonitor: 'سلوک مانیٹر',
  screenCheckIn: 'ٹائمر چیک ان',
  screenJourneyMonitor: 'سفر مانیٹر',
  screenEvidenceLocker: 'ثبوت لاکر',
  screenUserProfile: 'پروفائل',
  screenNeuroband: 'نیوروبینڈ',
  hintHome: 'درمیان میں ایس او ایس دبائیں یا کوئی فوری ایکشن منتخب کریں۔',
  hintContacts: 'وہ قابل اعتماد رابطے شامل کریں جنہیں آپ کا ایس او ایس ملے گا۔',
  hintSpeed: 'لائیو رفتار اور حادثہ پکڑ سیٹنگز۔',
  hintSafety: 'تمام حفاظتی ٹولز ایک جگہ۔',
  hintSettings: 'شیک، وائس ٹرگر، ایپ لاک وغیرہ ترتیب دیں۔',
  hintHelplines: 'پولیس، خواتین، بچوں اور ایمبولینس ہیلپ لائنز فوری ڈائل۔',
  hintFakeCall: 'غیر محفوظ لمحے سے بچنے کے لیے قابل اعتماد آنے والی کال۔',
  hintCameraDetector: 'فون سینسرز سے کمرے میں چھپے کیمرے تلاش کریں۔',
  hintNearbyServices: 'قریبی پولیس اسٹیشن، اسپتال اور میڈیکل تلاش کریں۔',
  hintAudioRecorder: 'خاموشی سے آڈیو ثبوت اپنے ثبوت لاکر میں ریکارڈ کریں۔',
  hintAlertHistory: 'آپ کے بھیجے گئے ہر الرٹ کا جائزہ لیں۔',
  hintBehaviorMonitor: 'فون کے استعمال سے پریشانی کے پیٹرن کا پتہ لگائیں۔',
  hintCheckIn: 'ٹائمر شروع کریں؛ وقت پر تصدیق نہ کرنے پر آٹو ایس او ایس۔',
  hintJourneyMonitor: 'لائیو سفر شیئر کریں؛ راستہ بدلنے پر آٹو ایس او ایس۔',
  hintEvidenceLocker: 'کلاؤڈ سنک کے ساتھ انکرپٹڈ ثبوت سیشن۔',
  hintUserProfile: 'اپنا پروفائل دیکھیں اور ترمیم کریں۔',
  hintNeuroband: 'پہننے والی ڈیوائس سے بائیو سگنل خاموش ٹرگر۔',
  actionSos: 'ایس او ایس بھیجیں',
  actionShareLocation: 'لوکیشن شیئر',
  actionCallEmergency: 'ایمرجنسی کال',
  actionStopSpeaking: 'بولنا روکیں',
  actionHelp: 'مدد',
  actionBack: 'واپس جائیں',
  goingTo: 'جا رہا ہوں',
  sosTriggered: 'ایس او ایس بھیج رہا ہوں',
  sharingLocation: 'آپ کا لوکیشن شیئر کر رہا ہوں',
  callingEmergency: 'ایمرجنسی لائن ڈائل کر رہا ہوں',
  stopped: 'رک گیا',
  goingBack: 'واپس جا رہا ہوں',
  helpMessage:
    'میں آپ کو کسی بھی اسکرین پر لے جا سکتا ہوں۔ ہوم، رابطے، حفاظت، ترتیبات، ہیلپ لائن، جعلی کال، آڈیو ریکارڈر، سفر مانیٹر کہیں؛ یا ایس او ایس، لوکیشن شیئر، ایمرجنسی کال کہیں۔',
};

const GU: VoiceStrings = {
  voiceGuide: 'વોઇસ ગાઇડ',
  voiceGuideOn: 'વોઇસ ગાઇડ ચાલુ',
  voiceGuideOff: 'વોઇસ ગાઇડ બંધ',
  enableHint: 'સક્ષમ કરો — સ્ક્રીન નામ સાંભળો અને કોઈપણ આદેશ પર ટેપ કરી અવાજથી નેવિગેટ કરો.',
  introHint: 'વોઇસ ગાઇડ ચાલુ છે. નીચે જમણી બાજુનું માઇક બટન દબાવી આદેશ પેલેટ ખોલો.',
  listening: 'સાંભળું છું',
  didNotUnderstand: 'સમજ્યું નહીં. યાદીમાંથી કોઈ આદેશ પર ટેપ કરો.',
  commandPaletteTitle: 'વોઇસ આદેશો',
  commandPaletteHint: 'કોઈ આદેશ પર ટેપ કરો — હું બોલીશ અને તમને ત્યાં લઈ જઈશ.',
  noSpeechEngine: 'આ બિલ્ડમાં સ્પીચ એન્જિન નથી. આદેશ પેલેટ ટેપથી કામ કરશે.',
  tapAnyCommand: 'કોઈપણ આદેશ પર ટેપ કરો.',
  speakIntro: 'સ્ક્રીન પર પરિચય બોલો',
  speakRate: 'બોલવાની ગતિ',
  speakPitch: 'અવાજનો પીચ',
  announceScreens: 'સ્ક્રીન જાહેર કરો',
  announceScreensDesc: 'સ્ક્રીન ખુલતા જ નામ અને ટૂંકો સંકેત બોલો',
  announceButtons: 'મુખ્ય બટન જાહેર કરો',
  announceButtonsDesc: 'એસઓએસ, લોકેશન શેર અને અન્ય મુખ્ય ક્રિયાઓ મોટેથી પુષ્ટિ કરો',
  voiceGuideDesc: 'સ્ક્રીન પર શું છે સાંભળો અને સંપૂર્ણ એપને તમારી ભાષામાં અવાજથી નેવિગેટ કરો.',
  screenHome: 'હોમ',
  screenContacts: 'વિશ્વાસપાત્ર સંપર્કો',
  screenSpeed: 'ગતિ',
  screenSafety: 'સુરક્ષા સાધનો',
  screenSettings: 'સેટિંગ્સ',
  screenHelplines: 'હેલ્પલાઇન',
  screenFakeCall: 'નકલી કૉલ',
  screenCameraDetector: 'છૂપાયેલ કૅમેરા ડિટેક્ટર',
  screenNearbyServices: 'નજીકની સેવાઓ',
  screenAudioRecorder: 'ઑડિઓ રેકોર્ડર',
  screenAlertHistory: 'ચેતવણી ઇતિહાસ',
  screenBehaviorMonitor: 'વર્તન મોનિટર',
  screenCheckIn: 'ટાઇમર ચેક-ઇન',
  screenJourneyMonitor: 'યાત્રા મોનિટર',
  screenEvidenceLocker: 'પુરાવા લોકર',
  screenUserProfile: 'પ્રોફાઇલ',
  screenNeuroband: 'ન્યૂરોબેન્ડ',
  hintHome: 'મધ્યમાં એસઓએસ દબાવો અથવા ઝડપી ક્રિયા પસંદ કરો.',
  hintContacts: 'એસઓએસ મેળવનાર વિશ્વાસપાત્ર સંપર્કો ઉમેરો.',
  hintSpeed: 'લાઇવ ગતિ અને અકસ્માત શોધ સેટિંગ્સ.',
  hintSafety: 'બધા સુરક્ષા સાધનો એક જગ્યાએ.',
  hintSettings: 'શેક, વૉઇસ ટ્રિગર, ઐપ લૉક વગેરે રૂપરેખાંકિત કરો.',
  hintHelplines: 'પોલીસ, મહિલા, બાળ અને એમ્બ્યુલન્સ હેલ્પલાઇન ઝડપી-ડાયલ.',
  hintFakeCall: 'અસુરક્ષિત ક્ષણથી બચવા માટે વિશ્વસનીય ઇનકમિંગ કૉલ.',
  hintCameraDetector: 'ફોન સેન્સરથી રૂમમાં છૂપાયેલા કૅમેરા શોધો.',
  hintNearbyServices: 'નજીકના પોલીસ સ્ટેશન, હૉસ્પિટલ અને મેડિકલ શોધો.',
  hintAudioRecorder: 'તમારા પુરાવા લોકરમાં શાંતિથી ઑડિઓ રેકોર્ડ કરો.',
  hintAlertHistory: 'તમે મોકલેલી દરેક ચેતવણીની સમીક્ષા કરો.',
  hintBehaviorMonitor: 'ફોન ઉપયોગથી તકલીફના પેટર્ન ઓળખો.',
  hintCheckIn: 'ટાઇમર શરૂ કરો; સમયસર પુષ્ટિ ન કરો તો ઑટો-એસઓએસ.',
  hintJourneyMonitor: 'લાઇવ યાત્રા શેર કરો; માર્ગ બદલવા પર ઑટો-એસઓએસ.',
  hintEvidenceLocker: 'ક્લાઉડ સિંક સાથે એન્ક્રિપ્ટેડ પુરાવા સત્રો.',
  hintUserProfile: 'તમારી પ્રોફાઇલ જુઓ અને સંપાદિત કરો.',
  hintNeuroband: 'પહેરવા યોગ્ય ઉપકરણથી બાયો-સિગ્નલ મૌન ટ્રિગર.',
  actionSos: 'એસઓએસ મોકલો',
  actionShareLocation: 'લોકેશન શેર',
  actionCallEmergency: 'ઇમરજન્સી કૉલ',
  actionStopSpeaking: 'બોલવાનું બંધ કરો',
  actionHelp: 'મદદ',
  actionBack: 'પાછળ',
  goingTo: 'જઈ રહ્યો છું',
  sosTriggered: 'એસઓએસ મોકલી રહ્યો છું',
  sharingLocation: 'તમારું લોકેશન શેર કરી રહ્યો છું',
  callingEmergency: 'ઇમરજન્સી લાઇન ડાયલ કરી રહ્યો છું',
  stopped: 'બંધ',
  goingBack: 'પાછળ જઈ રહ્યો છું',
  helpMessage:
    'હું તમને કોઈપણ સ્ક્રીન પર લઈ જઈ શકું છું. હોમ, સંપર્કો, સુરક્ષા, સેટિંગ્સ, હેલ્પલાઇન, નકલી કૉલ, ઑડિઓ રેકોર્ડર, યાત્રા મોનિટર બોલો; અથવા એસઓએસ, લોકેશન શેર, ઇમરજન્સી કૉલ બોલો.',
};

const KN: VoiceStrings = {
  voiceGuide: 'ಧ್ವನಿ ಮಾರ್ಗದರ್ಶಿ',
  voiceGuideOn: 'ಧ್ವನಿ ಮಾರ್ಗದರ್ಶಿ ಆನ್',
  voiceGuideOff: 'ಧ್ವನಿ ಮಾರ್ಗದರ್ಶಿ ಆಫ್',
  enableHint: 'ಸಕ್ರಿಯಗೊಳಿಸಿ — ಪರದೆಯ ಹೆಸರುಗಳನ್ನು ಆಲಿಸಿ ಮತ್ತು ಯಾವುದೇ ಆಜ್ಞೆಯನ್ನು ಒತ್ತಿ ಧ್ವನಿಯಿಂದ ನ್ಯಾವಿಗೇಟ್ ಮಾಡಿ.',
  introHint: 'ಧ್ವನಿ ಮಾರ್ಗದರ್ಶಿ ಸಕ್ರಿಯವಾಗಿದೆ. ಕೆಳಗೆ ಬಲಭಾಗದ ಮೈಕ್ ಬಟನ್ ಒತ್ತಿ ಆಜ್ಞೆ ಪಲೆಟ್ ತೆರೆಯಿರಿ.',
  listening: 'ಆಲಿಸುತ್ತಿದ್ದೇನೆ',
  didNotUnderstand: 'ಅರ್ಥವಾಗಲಿಲ್ಲ. ಪಟ್ಟಿಯಿಂದ ಆಜ್ಞೆಯನ್ನು ಒತ್ತಿ.',
  commandPaletteTitle: 'ಧ್ವನಿ ಆಜ್ಞೆಗಳು',
  commandPaletteHint: 'ಒಂದು ಆಜ್ಞೆಯನ್ನು ಒತ್ತಿ — ನಾನು ಮಾತನಾಡುತ್ತೇನೆ ಮತ್ತು ಅಲ್ಲಿಗೆ ಕರೆದೊಯ್ಯುತ್ತೇನೆ.',
  noSpeechEngine: 'ಈ ಬಿಲ್ಡ್‌ನಲ್ಲಿ ಸ್ಪೀಚ್ ಎಂಜಿನ್ ಇಲ್ಲ. ಆಜ್ಞೆ ಪಲೆಟ್ ಸ್ಪರ್ಶದ ಮೂಲಕ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ.',
  tapAnyCommand: 'ಯಾವುದೇ ಆಜ್ಞೆಯನ್ನು ಒತ್ತಿ.',
  speakIntro: 'ಪರದೆಯಲ್ಲಿ ಪರಿಚಯವನ್ನು ಮಾತನಾಡಿ',
  speakRate: 'ಮಾತಿನ ವೇಗ',
  speakPitch: 'ಧ್ವನಿಯ ಪಿಚ್',
  announceScreens: 'ಪರದೆಗಳನ್ನು ಪ್ರಕಟಿಸು',
  announceScreensDesc: 'ಪರದೆ ತೆರೆದ ಕೂಡಲೇ ಹೆಸರು ಮತ್ತು ಸಂಕ್ಷಿಪ್ತ ಸುಳಿವನ್ನು ಮಾತನಾಡು',
  announceButtons: 'ಮುಖ್ಯ ಬಟನ್‌ಗಳನ್ನು ಪ್ರಕಟಿಸು',
  announceButtonsDesc: 'ಎಸ್‌ಒಎಸ್, ಸ್ಥಳ ಹಂಚಿಕೆ ಮತ್ತು ಇತರ ಮುಖ್ಯ ಕ್ರಿಯೆಗಳನ್ನು ಗಟ್ಟಿಯಾಗಿ ದೃಢೀಕರಿಸು',
  voiceGuideDesc: 'ಪರದೆಯಲ್ಲಿ ಏನಿದೆ ಎಂದು ಆಲಿಸಿ ಮತ್ತು ಸಂಪೂರ್ಣ ಅಪ್ಲಿಕೇಶನ್ ಅನ್ನು ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಧ್ವನಿಯಿಂದ ನ್ಯಾವಿಗೇಟ್ ಮಾಡಿ.',
  screenHome: 'ಮುಖಪುಟ',
  screenContacts: 'ವಿಶ್ವಾಸಾರ್ಹ ಸಂಪರ್ಕಗಳು',
  screenSpeed: 'ವೇಗ',
  screenSafety: 'ಸುರಕ್ಷತಾ ಸಾಧನಗಳು',
  screenSettings: 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
  screenHelplines: 'ಸಹಾಯವಾಣಿಗಳು',
  screenFakeCall: 'ನಕಲಿ ಕರೆ',
  screenCameraDetector: 'ಮರೆಮಾಡಿದ ಕ್ಯಾಮೆರಾ ಪತ್ತೆಕಾರಕ',
  screenNearbyServices: 'ಹತ್ತಿರದ ಸೇವೆಗಳು',
  screenAudioRecorder: 'ಧ್ವನಿ ರೆಕಾರ್ಡರ್',
  screenAlertHistory: 'ಎಚ್ಚರಿಕೆ ಇತಿಹಾಸ',
  screenBehaviorMonitor: 'ವರ್ತನೆ ಮಾನಿಟರ್',
  screenCheckIn: 'ಟೈಮರ್ ಚೆಕ್-ಇನ್',
  screenJourneyMonitor: 'ಪ್ರಯಾಣ ಮಾನಿಟರ್',
  screenEvidenceLocker: 'ಸಾಕ್ಷ್ಯ ಲಾಕರ್',
  screenUserProfile: 'ಪ್ರೊಫೈಲ್',
  screenNeuroband: 'ನ್ಯೂರೋಬ್ಯಾಂಡ್',
  hintHome: 'ಮಧ್ಯದಲ್ಲಿ ಎಸ್‌ಒಎಸ್ ಒತ್ತಿ ಅಥವಾ ತ್ವರಿತ ಕ್ರಿಯೆ ಆಯ್ಕೆಮಾಡಿ.',
  hintContacts: 'ನಿಮ್ಮ ಎಸ್‌ಒಎಸ್ ಪಡೆಯುವ ವಿಶ್ವಾಸಾರ್ಹ ಸಂಪರ್ಕಗಳನ್ನು ಸೇರಿಸಿ.',
  hintSpeed: 'ಲೈವ್ ವೇಗ ಮತ್ತು ಅಪಘಾತ ಪತ್ತೆ ಸೆಟ್ಟಿಂಗ್‌ಗಳು.',
  hintSafety: 'ಎಲ್ಲಾ ಸುರಕ್ಷತಾ ಸಾಧನಗಳು ಒಂದೇ ಸ್ಥಳದಲ್ಲಿ.',
  hintSettings: 'ಶೇಕ್, ಧ್ವನಿ ಟ್ರಿಗ್ಗರ್, ಅಪ್ಲಿಕೇಶನ್ ಲಾಕ್ ಮತ್ತು ಇನ್ನಷ್ಟನ್ನು ಕಾನ್ಫಿಗರ್ ಮಾಡಿ.',
  hintHelplines: 'ಪೊಲೀಸ್, ಮಹಿಳೆ, ಮಗು ಮತ್ತು ಆಂಬ್ಯುಲೆನ್ಸ್ ಸಹಾಯವಾಣಿಗಳಿಗೆ ತ್ವರಿತ-ಡಯಲ್.',
  hintFakeCall: 'ಅಸುರಕ್ಷಿತ ಕ್ಷಣದಿಂದ ತಪ್ಪಿಸಿಕೊಳ್ಳಲು ವಿಶ್ವಾಸಾರ್ಹ ಒಳಬರುವ ಕರೆ.',
  hintCameraDetector: 'ನಿಮ್ಮ ಫೋನ್ ಸೆನ್ಸರ್‌ಗಳಿಂದ ಕೋಣೆಯಲ್ಲಿ ಮರೆಮಾಡಿದ ಕ್ಯಾಮೆರಾಗಳನ್ನು ಹುಡುಕಿ.',
  hintNearbyServices: 'ಹತ್ತಿರದ ಪೊಲೀಸ್ ಠಾಣೆಗಳು, ಆಸ್ಪತ್ರೆಗಳು ಮತ್ತು ಔಷಧಾಲಯಗಳನ್ನು ಹುಡುಕಿ.',
  hintAudioRecorder: 'ನಿಮ್ಮ ಸಾಕ್ಷ್ಯ ಲಾಕರ್‌ಗೆ ಮೌನವಾಗಿ ಧ್ವನಿಯನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡಿ.',
  hintAlertHistory: 'ನೀವು ಕಳುಹಿಸಿದ ಪ್ರತಿ ಎಚ್ಚರಿಕೆಯನ್ನೂ ಪರಿಶೀಲಿಸಿ.',
  hintBehaviorMonitor: 'ಫೋನ್ ಬಳಕೆಯಿಂದ ಸಂಕಷ್ಟ ನಮೂನೆಗಳನ್ನು ಗುರುತಿಸಿ.',
  hintCheckIn: 'ಟೈಮರ್ ಪ್ರಾರಂಭಿಸಿ; ಸಮಯಕ್ಕೆ ದೃಢೀಕರಿಸದಿದ್ದರೆ ಸ್ವಯಂ ಎಸ್‌ಒಎಸ್.',
  hintJourneyMonitor: 'ಲೈವ್ ಪ್ರಯಾಣವನ್ನು ಹಂಚಿಕೊಳ್ಳಿ; ಮಾರ್ಗ ಬದಲಾವಣೆಯಲ್ಲಿ ಸ್ವಯಂ ಎಸ್‌ಒಎಸ್.',
  hintEvidenceLocker: 'ಕ್ಲೌಡ್ ಸಿಂಕ್ ಜೊತೆ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಿದ ಸಾಕ್ಷ್ಯ ಸೆಷನ್‌ಗಳು.',
  hintUserProfile: 'ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಅನ್ನು ವೀಕ್ಷಿಸಿ ಮತ್ತು ಸಂಪಾದಿಸಿ.',
  hintNeuroband: 'ಧರಿಸಬಹುದಾದ ಸಾಧನದಿಂದ ಜೈವಿಕ-ಸಂಕೇತ ಮೌನ ಟ್ರಿಗ್ಗರ್.',
  actionSos: 'ಎಸ್‌ಒಎಸ್ ಕಳುಹಿಸಿ',
  actionShareLocation: 'ಸ್ಥಳ ಹಂಚಿಕೊಳ್ಳಿ',
  actionCallEmergency: 'ತುರ್ತು ಕರೆ',
  actionStopSpeaking: 'ಮಾತನಾಡುವುದನ್ನು ನಿಲ್ಲಿಸಿ',
  actionHelp: 'ಸಹಾಯ',
  actionBack: 'ಹಿಂದೆ',
  goingTo: 'ಹೋಗುತ್ತಿದ್ದೇನೆ',
  sosTriggered: 'ಎಸ್‌ಒಎಸ್ ಕಳುಹಿಸುತ್ತಿದ್ದೇನೆ',
  sharingLocation: 'ನಿಮ್ಮ ಸ್ಥಳ ಹಂಚಿಕೊಳ್ಳುತ್ತಿದ್ದೇನೆ',
  callingEmergency: 'ತುರ್ತು ಸಾಲಿಗೆ ಡಯಲ್ ಮಾಡುತ್ತಿದ್ದೇನೆ',
  stopped: 'ನಿಲ್ಲಿಸಲಾಗಿದೆ',
  goingBack: 'ಹಿಂದಕ್ಕೆ ಹೋಗುತ್ತಿದ್ದೇನೆ',
  helpMessage:
    'ನಾನು ನಿಮ್ಮನ್ನು ಯಾವುದೇ ಪರದೆಗೆ ಕರೆದೊಯ್ಯಬಲ್ಲೆ. ಮುಖಪುಟ, ಸಂಪರ್ಕಗಳು, ಸುರಕ್ಷತೆ, ಸೆಟ್ಟಿಂಗ್‌ಗಳು, ಸಹಾಯವಾಣಿ, ನಕಲಿ ಕರೆ, ಧ್ವನಿ ರೆಕಾರ್ಡರ್, ಪ್ರಯಾಣ ಮಾನಿಟರ್ ಎಂದು ಹೇಳಿ; ಅಥವಾ ಎಸ್‌ಒಎಸ್, ಸ್ಥಳ ಹಂಚಿಕೆ, ತುರ್ತು ಕರೆ ಎಂದು ಹೇಳಿ.',
};

const ML: VoiceStrings = {
  voiceGuide: 'വോയ്സ് ഗൈഡ്',
  voiceGuideOn: 'വോയ്സ് ഗൈഡ് ഓൺ',
  voiceGuideOff: 'വോയ്സ് ഗൈഡ് ഓഫ്',
  enableHint: 'പ്രവർത്തനക്ഷമമാക്കുക — സ്ക്രീൻ പേരുകൾ കേൾക്കൂ, ഏതെങ്കിലും കമാൻഡ് ടാപ്പ് ചെയ്ത് വോയ്സ് വഴി നാവിഗേറ്റ് ചെയ്യൂ.',
  introHint: 'വോയ്സ് ഗൈഡ് ഓൺ ആണ്. താഴെ വലത്തെ മൈക് ബട്ടൺ അമർത്തി കമാൻഡ് പാലറ്റ് തുറക്കൂ.',
  listening: 'കേൾക്കുന്നു',
  didNotUnderstand: 'മനസ്സിലായില്ല. ലിസ്റ്റിൽ നിന്ന് ഒരു കമാൻഡ് ടാപ്പ് ചെയ്യൂ.',
  commandPaletteTitle: 'വോയ്സ് കമാൻഡുകൾ',
  commandPaletteHint: 'ഒരു കമാൻഡ് ടാപ്പ് ചെയ്യൂ — ഞാൻ പറയും, അവിടേക്ക് കൊണ്ടുപോകും.',
  noSpeechEngine: 'ഈ ബിൽഡിൽ സ്പീച്ച് എഞ്ചിൻ ലഭ്യമല്ല. കമാൻഡ് പാലറ്റ് ടാപ്പ് വഴി പ്രവർത്തിക്കും.',
  tapAnyCommand: 'ഏതെങ്കിലും കമാൻഡ് ടാപ്പ് ചെയ്യൂ.',
  speakIntro: 'സ്ക്രീൻ പരിചയം പറയൂ',
  speakRate: 'സംസാര വേഗത',
  speakPitch: 'ശബ്ദ പിച്ച്',
  announceScreens: 'സ്ക്രീൻ പ്രഖ്യാപിക്കുക',
  announceScreensDesc: 'സ്ക്രീൻ തുറക്കുമ്പോൾ പേരും ചെറിയ സൂചനയും പറയുക',
  announceButtons: 'പ്രധാന ബട്ടണുകൾ പ്രഖ്യാപിക്കുക',
  announceButtonsDesc: 'എസ്ഒഎസ്, ലൊക്കേഷൻ ഷെയർ തുടങ്ങിയ പ്രധാന പ്രവർത്തനങ്ങൾ ഉറക്കെ സ്ഥിരീകരിക്കുക',
  voiceGuideDesc: 'സ്ക്രീനിൽ ഉള്ളത് കേൾക്കൂ, മുഴുവൻ ആപ്പും നിങ്ങളുടെ ഭാഷയിൽ വോയ്സിൽ നാവിഗേറ്റ് ചെയ്യൂ.',
  screenHome: 'ഹോം',
  screenContacts: 'വിശ്വസ്ത ബന്ധങ്ങൾ',
  screenSpeed: 'വേഗത',
  screenSafety: 'സുരക്ഷാ ഉപകരണങ്ങൾ',
  screenSettings: 'ക്രമീകരണങ്ങൾ',
  screenHelplines: 'ഹെൽപ്പ്‌ലൈനുകൾ',
  screenFakeCall: 'വ്യാജ കോൾ',
  screenCameraDetector: 'മറഞ്ഞ ക്യാമറ ഡിറ്റക്റ്റർ',
  screenNearbyServices: 'അടുത്തുള്ള സേവനങ്ങൾ',
  screenAudioRecorder: 'ഓഡിയോ റെക്കോർഡർ',
  screenAlertHistory: 'അലേർട്ട് ചരിത്രം',
  screenBehaviorMonitor: 'പെരുമാറ്റ മോണിറ്റർ',
  screenCheckIn: 'ടൈമർ ചെക്ക്-ഇൻ',
  screenJourneyMonitor: 'യാത്ര മോണിറ്റർ',
  screenEvidenceLocker: 'തെളിവ് ലോക്കർ',
  screenUserProfile: 'പ്രൊഫൈൽ',
  screenNeuroband: 'ന്യൂറോബാൻഡ്',
  hintHome: 'മധ്യത്തിൽ എസ്ഒഎസ് അമർത്തൂ അല്ലെങ്കിൽ ദ്രുത പ്രവർത്തനം തിരഞ്ഞെടുക്കൂ.',
  hintContacts: 'നിങ്ങളുടെ എസ്ഒഎസ് ലഭിക്കുന്ന വിശ്വസ്ത ബന്ധങ്ങൾ ചേർക്കൂ.',
  hintSpeed: 'തത്സമയ വേഗതയും അപകട ഡിറ്റക്ഷൻ ക്രമീകരണങ്ങളും.',
  hintSafety: 'എല്ലാ സുരക്ഷാ ഉപകരണങ്ങളും ഒരേയിടത്ത്.',
  hintSettings: 'ഷേക്ക്, വോയ്സ് ട്രിഗർ, ആപ്പ് ലോക്ക് മുതലായവ ക്രമീകരിക്കൂ.',
  hintHelplines: 'പോലീസ്, സ്ത്രീ, കുട്ടി, ആംബുലൻസ് ഹെൽപ്പ്‌ലൈൻ ദ്രുത-ഡയൽ.',
  hintFakeCall: 'അസുരക്ഷിത നിമിഷത്തിൽ നിന്ന് രക്ഷപ്പെടാൻ വിശ്വസനീയമായ ഇൻകമിംഗ് കോൾ.',
  hintCameraDetector: 'ഫോൺ സെൻസറുകൾ ഉപയോഗിച്ച് മുറിയിലെ മറഞ്ഞ ക്യാമറകൾ കണ്ടെത്തൂ.',
  hintNearbyServices: 'അടുത്തുള്ള പോലീസ് സ്റ്റേഷനുകൾ, ആശുപത്രികൾ, മെഡിക്കൽ കണ്ടെത്തൂ.',
  hintAudioRecorder: 'നിശ്ശബ്ദമായി ഓഡിയോ തെളിവുകൾ നിങ്ങളുടെ തെളിവ് ലോക്കറിൽ റെക്കോർഡ് ചെയ്യൂ.',
  hintAlertHistory: 'നിങ്ങൾ അയച്ച ഓരോ അലേർട്ടും അവലോകനം ചെയ്യൂ.',
  hintBehaviorMonitor: 'ഫോൺ ഉപയോഗത്തിൽ നിന്ന് വിഷമ പാറ്റേണുകൾ കണ്ടെത്തൂ.',
  hintCheckIn: 'ടൈമർ ആരംഭിക്കൂ; സമയത്ത് സ്ഥിരീകരിച്ചില്ലെങ്കിൽ ഓട്ടോ-എസ്ഒഎസ്.',
  hintJourneyMonitor: 'തത്സമയ യാത്ര പങ്കിടൂ; വഴി മാറുമ്പോൾ ഓട്ടോ-എസ്ഒഎസ്.',
  hintEvidenceLocker: 'ക്ലൗഡ് സിങ്ക് ഉള്ള എൻക്രിപ്റ്റഡ് തെളിവ് സെഷനുകൾ.',
  hintUserProfile: 'നിങ്ങളുടെ പ്രൊഫൈൽ കാണൂ, എഡിറ്റ് ചെയ്യൂ.',
  hintNeuroband: 'ധരിക്കാവുന്ന ഉപകരണത്തിൽ നിന്ന് ജൈവ-സിഗ്നൽ നിശ്ശബ്ദ ട്രിഗർ.',
  actionSos: 'എസ്ഒഎസ് അയയ്ക്കൂ',
  actionShareLocation: 'ലൊക്കേഷൻ പങ്കിടൂ',
  actionCallEmergency: 'അടിയന്തര കോൾ',
  actionStopSpeaking: 'സംസാരം നിർത്തൂ',
  actionHelp: 'സഹായം',
  actionBack: 'പിന്നോട്ട്',
  goingTo: 'പോകുന്നു',
  sosTriggered: 'എസ്ഒഎസ് അയക്കുന്നു',
  sharingLocation: 'നിങ്ങളുടെ ലൊക്കേഷൻ പങ്കിടുന്നു',
  callingEmergency: 'അടിയന്തര ലൈൻ ഡയൽ ചെയ്യുന്നു',
  stopped: 'നിർത്തി',
  goingBack: 'പിന്നോട്ട് പോകുന്നു',
  helpMessage:
    'ഞാൻ നിങ്ങളെ ഏത് സ്ക്രീനിലേക്കും കൊണ്ടുപോകും. ഹോം, ബന്ധങ്ങൾ, സുരക്ഷ, ക്രമീകരണങ്ങൾ, ഹെൽപ്പ്‌ലൈൻ, വ്യാജ കോൾ, ഓഡിയോ റെക്കോർഡർ, യാത്ര മോണിറ്റർ പറയൂ; അല്ലെങ്കിൽ എസ്ഒഎസ്, ലൊക്കേഷൻ പങ്കിടൂ, അടിയന്തര കോൾ പറയൂ.',
};

const OR: VoiceStrings = {
  voiceGuide: 'ଭଏସ ଗାଇଡ',
  voiceGuideOn: 'ଭଏସ ଗାଇଡ ଅନ',
  voiceGuideOff: 'ଭଏସ ଗାଇଡ ଅଫ',
  enableHint: 'ସକ୍ରିୟ କରନ୍ତୁ — ସ୍କ୍ରିନ ନାମ ଶୁଣନ୍ତୁ ଏବଂ ଯେ କୌଣସି କମାଣ୍ଡ ଟ୍ୟାପ କରି ସ୍ୱରରେ ନେଭିଗେଟ କରନ୍ତୁ।',
  introHint: 'ଭଏସ ଗାଇଡ ଅନ ଅଛି। ତଳ ଡାହାଣର ମାଇକ ବଟନ ଚାପି କମାଣ୍ଡ ପ୍ୟାଲେଟ ଖୋଲନ୍ତୁ।',
  listening: 'ଶୁଣୁଛି',
  didNotUnderstand: 'ବୁଝି ପାରିଲି ନାହିଁ। ତାଲିକାରୁ ଗୋଟିଏ କମାଣ୍ଡ ଟ୍ୟାପ କରନ୍ତୁ।',
  commandPaletteTitle: 'ଭଏସ କମାଣ୍ଡ',
  commandPaletteHint: 'ଗୋଟିଏ କମାଣ୍ଡ ଟ୍ୟାପ କରନ୍ତୁ — ମୁଁ କହିବି ଏବଂ ଆପଣଙ୍କୁ ସେଠାକୁ ନେବି।',
  noSpeechEngine: 'ଏହି ବିଲ୍ଡରେ ସ୍ପିଚ ଇଞ୍ଜିନ ନାହିଁ। କମାଣ୍ଡ ପ୍ୟାଲେଟ ଟ୍ୟାପ ଦ୍ୱାରା କାମ କରିବ।',
  tapAnyCommand: 'ଯେ କୌଣସି କମାଣ୍ଡ ଟ୍ୟାପ କରନ୍ତୁ।',
  speakIntro: 'ସ୍କ୍ରିନ ଉପରେ ପରିଚୟ କୁହନ୍ତୁ',
  speakRate: 'କହିବାର ଗତି',
  speakPitch: 'ସ୍ୱର ପିଚ',
  announceScreens: 'ସ୍କ୍ରିନ ଘୋଷଣା',
  announceScreensDesc: 'ସ୍କ୍ରିନ ଖୋଲିବା ସମୟରେ ନାମ ଓ ଛୋଟ ସୂଚନା କୁହ',
  announceButtons: 'ମୁଖ୍ୟ ବଟନ ଘୋଷଣା',
  announceButtonsDesc: 'ଏସଓଏସ, ଲୋକେସନ ଶେୟାର ଓ ଅନ୍ୟ ମୁଖ୍ୟ କାର୍ଯ୍ୟକୁ ଉଚ୍ଚ ସ୍ୱରରେ ନିଶ୍ଚିତ କର',
  voiceGuideDesc: 'ସ୍କ୍ରିନରେ କଣ ଅଛି ଶୁଣନ୍ତୁ ଏବଂ ସମ୍ପୂର୍ଣ୍ଣ ଆପକୁ ଆପଣଙ୍କ ଭାଷାରେ ସ୍ୱରରେ ନେଭିଗେଟ କରନ୍ତୁ।',
  screenHome: 'ହୋମ',
  screenContacts: 'ବିଶ୍ୱାସଯୋଗ୍ୟ ଯୋଗାଯୋଗ',
  screenSpeed: 'ଗତି',
  screenSafety: 'ସୁରକ୍ଷା ଉପକରଣ',
  screenSettings: 'ସେଟିଂସ',
  screenHelplines: 'ସହାୟତା ଲାଇନ',
  screenFakeCall: 'ନକଲି କଲ',
  screenCameraDetector: 'ଲୁକ୍କାୟିତ କ୍ୟାମେରା ଡିଟେକ୍ଟର',
  screenNearbyServices: 'ନିକଟବର୍ତ୍ତୀ ସେବା',
  screenAudioRecorder: 'ଅଡିଓ ରେକର୍ଡର',
  screenAlertHistory: 'ଆଲର୍ଟ ଇତିହାସ',
  screenBehaviorMonitor: 'ଆଚରଣ ମନିଟର',
  screenCheckIn: 'ଟାଇମର ଚେକ-ଇନ',
  screenJourneyMonitor: 'ଯାତ୍ରା ମନିଟର',
  screenEvidenceLocker: 'ପ୍ରମାଣ ଲକର',
  screenUserProfile: 'ପ୍ରୋଫାଇଲ',
  screenNeuroband: 'ନ୍ୟୁରୋବ୍ୟାଣ୍ଡ',
  hintHome: 'କେନ୍ଦ୍ରରେ ଏସଓଏସ ଚାପନ୍ତୁ କିମ୍ବା ଶୀଘ୍ର କାର୍ଯ୍ୟ ବାଛନ୍ତୁ।',
  hintContacts: 'ଆପଣଙ୍କ ଏସଓଏସ ପାଇଥିବା ବିଶ୍ୱାସଯୋଗ୍ୟ ଯୋଗାଯୋଗ ଯୋଡନ୍ତୁ।',
  hintSpeed: 'ଲାଇଭ ଗତି ଓ ଦୁର୍ଘଟଣା ଚିହ୍ନଟ ସେଟିଂସ।',
  hintSafety: 'ସମସ୍ତ ସୁରକ୍ଷା ଉପକରଣ ଏକ ସ୍ଥାନରେ।',
  hintSettings: 'ଶେକ, ଭଏସ ଟ୍ରିଗର, ଆପ ଲକ ଇତ୍ୟାଦି କନଫିଗର କରନ୍ତୁ।',
  hintHelplines: 'ପୋଲିସ, ମହିଳା, ଶିଶୁ, ଆମ୍ବୁଲାନ୍ସ ଶୀଘ୍ର-ଡାଏଲ।',
  hintFakeCall: 'ଅସୁରକ୍ଷିତ ମୁହୂର୍ତ୍ତରୁ ବଞ୍ଚିବା ପାଇଁ ବିଶ୍ୱାସଯୋଗ୍ୟ ଆସୁଥିବା କଲ।',
  hintCameraDetector: 'ଫୋନ ସେନ୍ସର ସହିତ କୋଠରୀରେ ଲୁକ୍କାୟିତ କ୍ୟାମେରା ଖୋଜନ୍ତୁ।',
  hintNearbyServices: 'ନିକଟବର୍ତ୍ତୀ ପୋଲିସ ଷ୍ଟେସନ, ଡାକ୍ତରଖାନା ଓ ମେଡିକାଲ ଖୋଜନ୍ତୁ।',
  hintAudioRecorder: 'ଆପଣଙ୍କ ପ୍ରମାଣ ଲକରକୁ ନୀରବରେ ଅଡିଓ ରେକର୍ଡ କରନ୍ତୁ।',
  hintAlertHistory: 'ଆପଣ ପଠାଇଥିବା ପ୍ରତି ଆଲର୍ଟ ସମୀକ୍ଷା କରନ୍ତୁ।',
  hintBehaviorMonitor: 'ଫୋନ ବ୍ୟବହାରରୁ ଅସୁବିଧାର ଢାଞ୍ଚା ଚିହ୍ନଟ କରନ୍ତୁ।',
  hintCheckIn: 'ଟାଇମର ଆରମ୍ଭ କରନ୍ତୁ; ସମୟ ମଧ୍ୟରେ ନିଶ୍ଚିତ ନ କଲେ ଅଟୋ-ଏସଓଏସ।',
  hintJourneyMonitor: 'ଲାଇଭ ଯାତ୍ରା ଶେୟାର କରନ୍ତୁ; ବାଟ ବଦଳାଇବାରେ ଅଟୋ-ଏସଓଏସ।',
  hintEvidenceLocker: 'କ୍ଲାଉଡ ସିଙ୍କ ସହିତ ଏନକ୍ରିପ୍ଟେଡ ପ୍ରମାଣ ସେସନ।',
  hintUserProfile: 'ଆପଣଙ୍କ ପ୍ରୋଫାଇଲ ଦେଖନ୍ତୁ ଓ ସମ୍ପାଦନା କରନ୍ତୁ।',
  hintNeuroband: 'ପିନ୍ଧିବା ଯୋଗ୍ୟ ଡିଭାଇସରୁ ବାୟୋ-ସିଗନାଲ ନୀରବ ଟ୍ରିଗର।',
  actionSos: 'ଏସଓଏସ ପଠାନ୍ତୁ',
  actionShareLocation: 'ଲୋକେସନ ଶେୟାର',
  actionCallEmergency: 'ଆପଦକାଳୀନ କଲ',
  actionStopSpeaking: 'କହିବା ବନ୍ଦ କରନ୍ତୁ',
  actionHelp: 'ସହାୟତା',
  actionBack: 'ପଛକୁ',
  goingTo: 'ଯାଉଛି',
  sosTriggered: 'ଏସଓଏସ ପଠାଉଛି',
  sharingLocation: 'ଆପଣଙ୍କ ଲୋକେସନ ଶେୟାର କରୁଛି',
  callingEmergency: 'ଆପଦକାଳୀନ ଲାଇନ ଡାଏଲ କରୁଛି',
  stopped: 'ବନ୍ଦ',
  goingBack: 'ପଛକୁ ଯାଉଛି',
  helpMessage:
    'ମୁଁ ଆପଣଙ୍କୁ ଯେକୌଣସି ସ୍କ୍ରିନକୁ ନେଇ ପାରିବି। ହୋମ, ଯୋଗାଯୋଗ, ସୁରକ୍ଷା, ସେଟିଂସ, ସହାୟତା, ନକଲି କଲ, ଅଡିଓ ରେକର୍ଡର, ଯାତ୍ରା ମନିଟର କୁହନ୍ତୁ; କିମ୍ବା ଏସଓଏସ, ଲୋକେସନ ଶେୟାର, ଆପଦକାଳୀନ କଲ କୁହନ୍ତୁ।',
};

const PA: VoiceStrings = {
  voiceGuide: 'ਵੌਇਸ ਗਾਈਡ',
  voiceGuideOn: 'ਵੌਇਸ ਗਾਈਡ ਚਾਲੂ',
  voiceGuideOff: 'ਵੌਇਸ ਗਾਈਡ ਬੰਦ',
  enableHint: 'ਚਾਲੂ ਕਰੋ — ਸਕ੍ਰੀਨ ਨਾਮ ਸੁਣੋ ਅਤੇ ਕਿਸੇ ਵੀ ਕਮਾਂਡ ਤੇ ਟੈਪ ਕਰ ਕੇ ਆਵਾਜ਼ ਨਾਲ ਨੈਵੀਗੇਟ ਕਰੋ।',
  introHint: 'ਵੌਇਸ ਗਾਈਡ ਚਾਲੂ ਹੈ। ਹੇਠਾਂ ਸੱਜੇ ਮਾਈਕ ਬਟਨ ਦਬਾ ਕੇ ਕਮਾਂਡ ਪੈਲੇਟ ਖੋਲ੍ਹੋ।',
  listening: 'ਸੁਣ ਰਿਹਾ ਹਾਂ',
  didNotUnderstand: 'ਸਮਝ ਨਹੀਂ ਆਇਆ। ਸੂਚੀ ਵਿੱਚੋਂ ਕੋਈ ਕਮਾਂਡ ਟੈਪ ਕਰੋ।',
  commandPaletteTitle: 'ਵੌਇਸ ਕਮਾਂਡਾਂ',
  commandPaletteHint: 'ਕਿਸੇ ਕਮਾਂਡ ਤੇ ਟੈਪ ਕਰੋ — ਮੈਂ ਬੋਲਾਂਗਾ ਅਤੇ ਤੁਹਾਨੂੰ ਉੱਥੇ ਲੈ ਜਾਵਾਂਗਾ।',
  noSpeechEngine: 'ਇਸ ਬਿਲਡ ਵਿੱਚ ਸਪੀਚ ਇੰਜਣ ਨਹੀਂ ਹੈ। ਕਮਾਂਡ ਪੈਲੇਟ ਟੈਪ ਨਾਲ ਕੰਮ ਕਰੇਗਾ।',
  tapAnyCommand: 'ਕੋਈ ਵੀ ਕਮਾਂਡ ਟੈਪ ਕਰੋ।',
  speakIntro: 'ਸਕ੍ਰੀਨ ਉੱਤੇ ਜਾਣ-ਪਛਾਣ ਬੋਲੋ',
  speakRate: 'ਬੋਲਣ ਦੀ ਗਤੀ',
  speakPitch: 'ਆਵਾਜ਼ ਦੀ ਪਿੱਚ',
  announceScreens: 'ਸਕ੍ਰੀਨਾਂ ਦਾ ਐਲਾਨ',
  announceScreensDesc: 'ਸਕ੍ਰੀਨ ਖੁੱਲ੍ਹਣ ਤੇ ਨਾਮ ਅਤੇ ਛੋਟਾ ਸੰਕੇਤ ਬੋਲੋ',
  announceButtons: 'ਮੁੱਖ ਬਟਨਾਂ ਦਾ ਐਲਾਨ',
  announceButtonsDesc: 'ਐਸਓਐਸ, ਲੋਕੇਸ਼ਨ ਸ਼ੇਅਰ ਅਤੇ ਹੋਰ ਮੁੱਖ ਕਾਰਵਾਈਆਂ ਉੱਚੀ ਆਵਾਜ਼ ਵਿੱਚ ਪੁਸ਼ਟੀ ਕਰੋ',
  voiceGuideDesc: 'ਸਕ੍ਰੀਨ ਤੇ ਕੀ ਹੈ ਸੁਣੋ ਅਤੇ ਪੂਰੀ ਐਪ ਨੂੰ ਆਪਣੀ ਭਾਸ਼ਾ ਵਿੱਚ ਆਵਾਜ਼ ਨਾਲ ਨੈਵੀਗੇਟ ਕਰੋ।',
  screenHome: 'ਹੋਮ',
  screenContacts: 'ਭਰੋਸੇਯੋਗ ਸੰਪਰਕ',
  screenSpeed: 'ਗਤੀ',
  screenSafety: 'ਸੁਰੱਖਿਆ ਸੰਦ',
  screenSettings: 'ਸੈਟਿੰਗਾਂ',
  screenHelplines: 'ਹੈਲਪਲਾਈਨਾਂ',
  screenFakeCall: 'ਨਕਲੀ ਕਾਲ',
  screenCameraDetector: 'ਲੁਕਿਆ ਕੈਮਰਾ ਡਿਟੈਕਟਰ',
  screenNearbyServices: 'ਨੇੜਲੀਆਂ ਸੇਵਾਵਾਂ',
  screenAudioRecorder: 'ਆਡੀਓ ਰਿਕਾਰਡਰ',
  screenAlertHistory: 'ਅਲਰਟ ਇਤਿਹਾਸ',
  screenBehaviorMonitor: 'ਵਿਹਾਰ ਮਾਨੀਟਰ',
  screenCheckIn: 'ਟਾਈਮਰ ਚੈੱਕ-ਇਨ',
  screenJourneyMonitor: 'ਯਾਤਰਾ ਮਾਨੀਟਰ',
  screenEvidenceLocker: 'ਪ੍ਰਮਾਣ ਲਾਕਰ',
  screenUserProfile: 'ਪ੍ਰੋਫਾਈਲ',
  screenNeuroband: 'ਨਿਊਰੋਬੈਂਡ',
  hintHome: 'ਮੱਧ ਵਿੱਚ ਐਸਓਐਸ ਦਬਾਓ ਜਾਂ ਤੇਜ਼ ਕਾਰਵਾਈ ਚੁਣੋ।',
  hintContacts: 'ਉਹ ਭਰੋਸੇਯੋਗ ਸੰਪਰਕ ਜੋੜੋ ਜਿਨ੍ਹਾਂ ਨੂੰ ਤੁਹਾਡਾ ਐਸਓਐਸ ਮਿਲੇਗਾ।',
  hintSpeed: 'ਲਾਈਵ ਗਤੀ ਅਤੇ ਹਾਦਸਾ ਖੋਜ ਸੈਟਿੰਗਾਂ।',
  hintSafety: 'ਸਾਰੇ ਸੁਰੱਖਿਆ ਸੰਦ ਇੱਕੋ ਥਾਂ।',
  hintSettings: 'ਸ਼ੇਕ, ਵੌਇਸ ਟ੍ਰਿਗਰ, ਐਪ ਲਾਕ ਆਦਿ ਸੰਰਚਿਤ ਕਰੋ।',
  hintHelplines: 'ਪੁਲਿਸ, ਔਰਤ, ਬੱਚਾ ਅਤੇ ਐਂਬੂਲੈਂਸ ਹੈਲਪਲਾਈਨ ਤੇਜ਼-ਡਾਇਲ।',
  hintFakeCall: 'ਅਸੁਰੱਖਿਅਤ ਪਲ ਤੋਂ ਬਚਣ ਲਈ ਭਰੋਸੇਯੋਗ ਆਉਣ ਵਾਲੀ ਕਾਲ।',
  hintCameraDetector: 'ਫ਼ੋਨ ਸੈਂਸਰਾਂ ਨਾਲ ਕਮਰੇ ਵਿੱਚ ਲੁਕੇ ਕੈਮਰੇ ਲੱਭੋ।',
  hintNearbyServices: 'ਨੇੜਲੇ ਪੁਲਿਸ ਸਟੇਸ਼ਨ, ਹਸਪਤਾਲ ਅਤੇ ਮੈਡੀਕਲ ਲੱਭੋ।',
  hintAudioRecorder: 'ਆਪਣੇ ਪ੍ਰਮਾਣ ਲਾਕਰ ਵਿੱਚ ਚੁੱਪ-ਚਾਪ ਆਡੀਓ ਰਿਕਾਰਡ ਕਰੋ।',
  hintAlertHistory: 'ਤੁਹਾਡੇ ਭੇਜੇ ਹਰ ਅਲਰਟ ਦੀ ਸਮੀਖਿਆ ਕਰੋ।',
  hintBehaviorMonitor: 'ਫ਼ੋਨ ਵਰਤੋਂ ਤੋਂ ਪ੍ਰੇਸ਼ਾਨੀ ਦੇ ਪੈਟਰਨ ਪਛਾਣੋ।',
  hintCheckIn: 'ਟਾਈਮਰ ਸ਼ੁਰੂ ਕਰੋ; ਸਮੇਂ ਸਿਰ ਪੁਸ਼ਟੀ ਨਾ ਕਰਨ ਤੇ ਆਟੋ-ਐਸਓਐਸ।',
  hintJourneyMonitor: 'ਲਾਈਵ ਯਾਤਰਾ ਸਾਂਝੀ ਕਰੋ; ਰਾਹ ਬਦਲਣ ਤੇ ਆਟੋ-ਐਸਓਐਸ।',
  hintEvidenceLocker: 'ਕਲਾਉਡ ਸਿੰਕ ਨਾਲ ਏਨਕ੍ਰਿਪਟਡ ਪ੍ਰਮਾਣ ਸੈਸ਼ਨ।',
  hintUserProfile: 'ਆਪਣਾ ਪ੍ਰੋਫਾਈਲ ਵੇਖੋ ਅਤੇ ਸੰਪਾਦਿਤ ਕਰੋ।',
  hintNeuroband: 'ਪਹਿਨਣ ਯੋਗ ਡਿਵਾਈਸ ਤੋਂ ਬਾਇਓ-ਸਿਗਨਲ ਚੁੱਪ ਟ੍ਰਿਗਰ।',
  actionSos: 'ਐਸਓਐਸ ਭੇਜੋ',
  actionShareLocation: 'ਲੋਕੇਸ਼ਨ ਸ਼ੇਅਰ',
  actionCallEmergency: 'ਐਮਰਜੈਂਸੀ ਕਾਲ',
  actionStopSpeaking: 'ਬੋਲਣਾ ਬੰਦ ਕਰੋ',
  actionHelp: 'ਮਦਦ',
  actionBack: 'ਪਿੱਛੇ',
  goingTo: 'ਜਾ ਰਿਹਾ ਹਾਂ',
  sosTriggered: 'ਐਸਓਐਸ ਭੇਜ ਰਿਹਾ ਹਾਂ',
  sharingLocation: 'ਤੁਹਾਡੀ ਲੋਕੇਸ਼ਨ ਸ਼ੇਅਰ ਕਰ ਰਿਹਾ ਹਾਂ',
  callingEmergency: 'ਐਮਰਜੈਂਸੀ ਲਾਈਨ ਡਾਇਲ ਕਰ ਰਿਹਾ ਹਾਂ',
  stopped: 'ਰੁਕ ਗਿਆ',
  goingBack: 'ਪਿੱਛੇ ਜਾ ਰਿਹਾ ਹਾਂ',
  helpMessage:
    'ਮੈਂ ਤੁਹਾਨੂੰ ਕਿਸੇ ਵੀ ਸਕ੍ਰੀਨ ਤੇ ਲੈ ਜਾ ਸਕਦਾ ਹਾਂ। ਹੋਮ, ਸੰਪਰਕ, ਸੁਰੱਖਿਆ, ਸੈਟਿੰਗਾਂ, ਹੈਲਪਲਾਈਨ, ਨਕਲੀ ਕਾਲ, ਆਡੀਓ ਰਿਕਾਰਡਰ, ਯਾਤਰਾ ਮਾਨੀਟਰ ਬੋਲੋ; ਜਾਂ ਐਸਓਐਸ, ਲੋਕੇਸ਼ਨ ਸ਼ੇਅਰ, ਐਮਰਜੈਂਸੀ ਕਾਲ ਬੋਲੋ।',
};

const AS: VoiceStrings = {
  voiceGuide: 'ভইচ গাইড',
  voiceGuideOn: 'ভইচ গাইড অন',
  voiceGuideOff: 'ভইচ গাইড অফ',
  enableHint: 'সক্ৰিয় কৰক — স্ক্ৰীণৰ নাম শুনিব আৰু যিকোনো কমাণ্ড টেপ কৰি কণ্ঠেৰে নেভিগেট কৰক।',
  introHint: 'ভইচ গাইড অন আছে। তলৰ সোঁফালৰ মাইক বুটাম টিপি কমাণ্ড পেলেট খোলক।',
  listening: 'শুনি আছোঁ',
  didNotUnderstand: 'বুজা নাযায়। তালিকাৰ পৰা এটা কমাণ্ড টেপ কৰক।',
  commandPaletteTitle: 'ভইচ কমাণ্ড',
  commandPaletteHint: 'এটা কমাণ্ড টেপ কৰক — মই ক’ম আৰু আপোনাক তালৈ নিম।',
  noSpeechEngine: 'এই বিল্ডত স্পীচ ইঞ্জিন নাই। কমাণ্ড পেলেট টেপৰ জৰিয়তে কাম কৰিব।',
  tapAnyCommand: 'যিকোনো কমাণ্ড টেপ কৰক।',
  speakIntro: 'স্ক্ৰীণত পৰিচয় কওক',
  speakRate: 'কথা কোৱাৰ গতি',
  speakPitch: 'কণ্ঠৰ পিচ',
  announceScreens: 'স্ক্ৰীণ ঘোষণা',
  announceScreensDesc: 'স্ক্ৰীণ খোলাৰ লগে লগে নাম আৰু চমু সংকেত কওক',
  announceButtons: 'মুখ্য বুটামৰ ঘোষণা',
  announceButtonsDesc: 'এছ.অ’.এছ., লোকেচন শ্বেয়াৰ আৰু আন মুখ্য কাৰ্য্যবোৰ ডাঙৰকৈ নিশ্চিত কৰক',
  voiceGuideDesc: 'স্ক্ৰীণত কি আছে শুনি লওক আৰু সম্পূৰ্ণ এপটো নিজৰ ভাষাত কণ্ঠেৰে নেভিগেট কৰক।',
  screenHome: 'ঘৰ',
  screenContacts: 'বিশ্বাসী যোগাযোগ',
  screenSpeed: 'বেগ',
  screenSafety: 'সুৰক্ষা সঁজুলি',
  screenSettings: 'ছেটিংছ',
  screenHelplines: 'হেল্পলাইন',
  screenFakeCall: 'নকল কল',
  screenCameraDetector: 'লুকা কেমেৰা ডিটেক্টৰ',
  screenNearbyServices: 'ওচৰৰ সেৱা',
  screenAudioRecorder: 'অডিঅ’ ৰেকৰ্ডাৰ',
  screenAlertHistory: 'এলাৰ্ট ইতিহাস',
  screenBehaviorMonitor: 'আচৰণ মনিটৰ',
  screenCheckIn: 'টাইমাৰ চেক-ইন',
  screenJourneyMonitor: 'যাত্ৰা মনিটৰ',
  screenEvidenceLocker: 'প্ৰমাণ লকাৰ',
  screenUserProfile: 'প্ৰ’ফাইল',
  screenNeuroband: 'নিউৰ’বেণ্ড',
  hintHome: 'মাজত এছ.অ’.এছ. টিপক বা এটা ক্ষিপ্ৰ কাৰ্য্য বাছনি কৰক।',
  hintContacts: 'এছ.অ’.এছ. পোৱা বিশ্বাসী যোগাযোগ যোগ কৰক।',
  hintSpeed: 'লাইভ বেগ আৰু দুৰ্ঘটনা চিনাক্তকৰণ ছেটিংছ।',
  hintSafety: 'সকলো সুৰক্ষা সঁজুলি এক ঠাইত।',
  hintSettings: 'শ্বেক, ভইচ ট্ৰিগাৰ, এপ লক ইত্যাদি কনফিগাৰ কৰক।',
  hintHelplines: 'পুলিচ, মহিলা, শিশু আৰু এম্বুলেন্স হেল্পলাইনলৈ ক্ষিপ্ৰ-ডায়েল।',
  hintFakeCall: 'অসুৰক্ষিত মুহূৰ্তৰ পৰা ৰক্ষা পাবলৈ বিশ্বাসযোগ্য আহি থকা কল।',
  hintCameraDetector: 'ফোন ছেন্সৰৰ সৈতে কোঠাত লুকা কেমেৰা বিচাৰক।',
  hintNearbyServices: 'ওচৰৰ পুলিচ ষ্টেচন, চিকিৎসালয় আৰু ঔষধালয় বিচাৰক।',
  hintAudioRecorder: 'নিজৰ প্ৰমাণ লকাৰত নিৰৱে অডিঅ’ ৰেকৰ্ড কৰক।',
  hintAlertHistory: 'আপুনি পঠোৱা প্ৰতিটো এলাৰ্ট চাওক।',
  hintBehaviorMonitor: 'ফোন ব্যৱহাৰৰ পৰা সমস্যাৰ আৰ্হি চিনাক্ত কৰক।',
  hintCheckIn: 'টাইমাৰ আৰম্ভ কৰক; সময়ত নিশ্চিত নকৰিলে অট’-এছ.অ’.এছ.।',
  hintJourneyMonitor: 'লাইভ যাত্ৰা শ্বেয়াৰ কৰক; বাট সলনি কৰিলে অট’-এছ.অ’.এছ.।',
  hintEvidenceLocker: 'ক্লাউড ছিংকৰ সৈতে এনক্ৰিপ্টেড প্ৰমাণ ছেছন।',
  hintUserProfile: 'নিজৰ প্ৰ’ফাইল চাওক আৰু সম্পাদনা কৰক।',
  hintNeuroband: 'পিন্ধিব পৰা ডিভাইচৰ পৰা বায়’-চিগনেল নিৰৱ ট্ৰিগাৰ।',
  actionSos: 'এছ.অ’.এছ. পঠাওক',
  actionShareLocation: 'লোকেচন শ্বেয়াৰ',
  actionCallEmergency: 'জৰুৰীকালীন কল',
  actionStopSpeaking: 'কোৱা বন্ধ কৰক',
  actionHelp: 'সহায়',
  actionBack: 'পিছলৈ',
  goingTo: 'গৈ আছোঁ',
  sosTriggered: 'এছ.অ’.এছ. পঠাই আছোঁ',
  sharingLocation: 'আপোনাৰ লোকেচন শ্বেয়াৰ কৰি আছোঁ',
  callingEmergency: 'জৰুৰীকালীন লাইনত ডায়েল কৰি আছোঁ',
  stopped: 'বন্ধ কৰিলোঁ',
  goingBack: 'পিছলৈ গৈ আছোঁ',
  helpMessage:
    'মই আপোনাক যিকোনো স্ক্ৰীণলৈ লৈ যাব পাৰোঁ। ঘৰ, যোগাযোগ, সুৰক্ষা, ছেটিংছ, হেল্পলাইন, নকল কল, অডিঅ’ ৰেকৰ্ডাৰ, যাত্ৰা মনিটৰ কওক; বা এছ.অ’.এছ., লোকেচন শ্বেয়াৰ, জৰুৰীকালীন কল কওক।',
};

// Strings for languages without dedicated translations fall back to English
// (the OS TTS engine will speak them in the user's chosen language voice
// where available, or to a sensible cousin via LOCALE_FOR).
const STRINGS: Partial<Record<LangCode, VoiceStrings>> = {
  en: EN,
  hi: HI,
  bn: BN,
  te: TE,
  mr: MR,
  ta: TA,
  ur: UR,
  gu: GU,
  kn: KN,
  ml: ML,
  or: OR,
  pa: PA,
  as: AS,
};

export function vt(lang: LangCode, key: VoiceStringKey): string {
  return STRINGS[lang]?.[key] ?? EN[key];
}

// ---------- Command -> screen key map -----------------------------------

export const COMMAND_TO_SCREEN: Record<VoiceCommand, VoiceStringKey | null> = {
  home:            'screenHome',
  contacts:        'screenContacts',
  speed:           'screenSpeed',
  safety:          'screenSafety',
  settings:        'screenSettings',
  helplines:       'screenHelplines',
  fakeCall:        'screenFakeCall',
  cameraDetector:  'screenCameraDetector',
  nearbyServices:  'screenNearbyServices',
  audioRecorder:   'screenAudioRecorder',
  alertHistory:    'screenAlertHistory',
  behaviorMonitor: 'screenBehaviorMonitor',
  checkIn:         'screenCheckIn',
  journeyMonitor:  'screenJourneyMonitor',
  evidenceLocker:  'screenEvidenceLocker',
  userProfile:     'screenUserProfile',
  neuroband:       'screenNeuroband',
  sos:             null,
  shareLocation:   null,
  callEmergency:   null,
  stop:            null,
  help:            null,
  back:            null,
};

export const COMMAND_TO_HINT: Record<VoiceCommand, VoiceStringKey | null> = {
  home:            'hintHome',
  contacts:        'hintContacts',
  speed:           'hintSpeed',
  safety:          'hintSafety',
  settings:        'hintSettings',
  helplines:       'hintHelplines',
  fakeCall:        'hintFakeCall',
  cameraDetector:  'hintCameraDetector',
  nearbyServices:  'hintNearbyServices',
  audioRecorder:   'hintAudioRecorder',
  alertHistory:    'hintAlertHistory',
  behaviorMonitor: 'hintBehaviorMonitor',
  checkIn:         'hintCheckIn',
  journeyMonitor:  'hintJourneyMonitor',
  evidenceLocker:  'hintEvidenceLocker',
  userProfile:     'hintUserProfile',
  neuroband:       'hintNeuroband',
  sos:             null,
  shareLocation:   null,
  callEmergency:   null,
  stop:            null,
  help:            null,
  back:            null,
};

export const COMMAND_TO_LABEL: Record<VoiceCommand, VoiceStringKey> = {
  home:            'screenHome',
  contacts:        'screenContacts',
  speed:           'screenSpeed',
  safety:          'screenSafety',
  settings:        'screenSettings',
  helplines:       'screenHelplines',
  fakeCall:        'screenFakeCall',
  cameraDetector:  'screenCameraDetector',
  nearbyServices:  'screenNearbyServices',
  audioRecorder:   'screenAudioRecorder',
  alertHistory:    'screenAlertHistory',
  behaviorMonitor: 'screenBehaviorMonitor',
  checkIn:         'screenCheckIn',
  journeyMonitor:  'screenJourneyMonitor',
  evidenceLocker:  'screenEvidenceLocker',
  userProfile:     'screenUserProfile',
  neuroband:       'screenNeuroband',
  sos:             'actionSos',
  shareLocation:   'actionShareLocation',
  callEmergency:   'actionCallEmergency',
  stop:            'actionStopSpeaking',
  help:            'actionHelp',
  back:            'actionBack',
};

// ---------- Speech adapter ---------------------------------------------

export type SpeakOptions = {
  lang: LangCode;
  rate?: number;
  pitch?: number;
  /** Called on completion, error, or stop. */
  onDone?: () => void;
};

export function speak(text: string, opts: SpeakOptions): void {
  if (!text) return;
  const mod = getSpeech();
  if (!mod) {
    // No engine — pretend we finished so callers don't hang.
    opts.onDone?.();
    return;
  }
  try {
    mod.speak(text, {
      language: localeFor(opts.lang),
      rate: opts.rate ?? 1.0,
      pitch: opts.pitch ?? 1.0,
      onDone: opts.onDone,
      onStopped: opts.onDone,
      onError: opts.onDone,
    });
  } catch {
    opts.onDone?.();
  }
}

export function stopSpeaking(): void {
  const mod = getSpeech();
  if (!mod) return;
  try {
    mod.stop();
  } catch {
    /* ignore */
  }
}
