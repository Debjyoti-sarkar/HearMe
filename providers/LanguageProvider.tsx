import React, { useCallback, useEffect, useState } from 'react';
import {
  LanguageContext,
  type LangCode,
  loadLanguage,
  saveLanguage,
  t,
} from '../lib/i18n';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await loadLanguage();
      if (saved) setLangState(saved);
      setReady(true);
    })();
  }, []);

  const setLang = useCallback(async (code: LangCode) => {
    setLangState(code);
    await saveLanguage(code);
  }, []);

  const T = useCallback(
    (key: Parameters<typeof t>[1]) => t(lang, key),
    [lang],
  );

  if (!ready) return null;

  return (
    <LanguageContext.Provider value={{ lang, setLang, T }}>
      {children}
    </LanguageContext.Provider>
  );
}
