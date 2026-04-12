import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';
import * as Session from '../lib/session';

export default function Index() {
  const [href, setHref] = useState<Session.InitialRoute | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const route = await Session.resolveInitialRoute();
      if (alive) setHref(route);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (href === null) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.accentViolet} />
      </View>
    );
  }

  return <Redirect href={href} />;
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgTop,
  },
});
