import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, type TextStyle } from 'react-native';

type AccessibilityContextValue = {
  oneHandedMode: boolean;
  dyslexiaFont: boolean;
  /** Extra top padding to push content down for one-handed reach */
  oneHandedShift: number;
  /** Text style overrides for dyslexia-friendly rendering */
  dyslexiaStyle: TextStyle;
  /** Apply to all body/label text */
  bodyText: TextStyle;
  /** Apply to all heading text */
  headingText: TextStyle;
};

const AccessibilityContext = createContext<AccessibilityContextValue>({
  oneHandedMode: false,
  dyslexiaFont: false,
  oneHandedShift: 0,
  dyslexiaStyle: {},
  bodyText: {},
  headingText: {},
});

export function AccessibilityProvider({
  oneHandedMode,
  dyslexiaFont,
  children,
}: {
  oneHandedMode: boolean;
  dyslexiaFont: boolean;
  children: ReactNode;
}) {
  const oneHandedShift = oneHandedMode ? 90 : 0;

  const dyslexiaStyle: TextStyle = dyslexiaFont
    ? { fontWeight: '800', letterSpacing: 0.6, lineHeight: undefined }
    : {};

  const bodyText: TextStyle = dyslexiaFont
    ? { fontWeight: '700', letterSpacing: 0.4, fontSize: 15, lineHeight: 24 }
    : {};

  const headingText: TextStyle = dyslexiaFont
    ? { fontWeight: '900', letterSpacing: 0.3 }
    : {};

  return (
    <AccessibilityContext.Provider
      value={{ oneHandedMode, dyslexiaFont, oneHandedShift, dyslexiaStyle, bodyText, headingText }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  return useContext(AccessibilityContext);
}
