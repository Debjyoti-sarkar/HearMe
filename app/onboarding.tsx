import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii } from '../constants/theme';

const { width } = Dimensions.get('window');

type Slide = {
  id: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  gradient: [string, string];
  title: string;
  subtitle: string;
  features: string[];
};

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'shield-check',
    gradient: ['#7c3aed', '#a78bfa'],
    title: 'Your Safety,\nYour Power',
    subtitle: 'HearMe combines the best features from 5 leading safety apps into one powerful guardian.',
    features: ['Instant SOS alerts', 'Shake detection', 'Live GPS tracking'],
  },
  {
    id: '2',
    icon: 'account-group',
    gradient: ['#ec4899', '#f43f5e'],
    title: 'Trusted\nCircle',
    subtitle: 'Add family and friends who receive instant alerts with your live location during emergencies.',
    features: ['Emergency SMS with GPS', 'One-tap emergency call', 'Safety code verification'],
  },
  {
    id: '3',
    icon: 'toolbox',
    gradient: ['#0891b2', '#22d3ee'],
    title: 'Safety\nToolkit',
    subtitle: 'From spy camera detection to audio evidence recording — everything you need in one app.',
    features: ['Camera detector', 'Audio recorder', 'Nearby safe places'],
  },
  {
    id: '4',
    icon: 'speedometer',
    gradient: ['#059669', '#34d399'],
    title: 'Smart\nProtection',
    subtitle: 'Advanced crash detection and speed monitoring keep you safe even when you can\'t reach your phone.',
    features: ['Crash detection', 'Speed alerts', 'Decoy fake calls'],
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      router.replace('/language');
    }
  };

  const skip = () => {
    router.replace('/language');
  };

  const renderSlide = ({ item, index }: { item: Slide; index: number }) => {
    return (
      <View style={[styles.slide, { width }]}>
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={item.gradient}
            style={styles.iconCircle}
          >
            <MaterialCommunityIcons name={item.icon} size={64} color="#fff" />
          </LinearGradient>
          <View style={[styles.orb, styles.orbLeft, { backgroundColor: item.gradient[0] + '30' }]} />
          <View style={[styles.orb, styles.orbRight, { backgroundColor: item.gradient[1] + '20' }]} />
        </View>

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.subtitle}</Text>

        <View style={styles.features}>
          {item.features.map((f) => (
            <View key={f} style={styles.featureRow}>
              <LinearGradient
                colors={item.gradient}
                style={styles.featureDot}
              />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={[colors.bgTop, colors.bgMid, colors.bgBottom]} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.brand}>HearMe</Text>
        <Pressable onPress={skip} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <Animated.FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        bounces={false}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 28, 8],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: dotWidth, opacity }]}
              />
            );
          })}
        </View>

        <Pressable onPress={goNext}>
          <LinearGradient
            colors={SLIDES[currentIndex].gradient}
            style={styles.nextBtn}
          >
            <Text style={styles.nextText}>
              {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            <MaterialCommunityIcons
              name={currentIndex === SLIDES.length - 1 ? 'check' : 'arrow-right'}
              size={22}
              color="#fff"
            />
          </LinearGradient>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  brand: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
  },
  skip: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  slide: {
    paddingHorizontal: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbLeft: {
    width: 200,
    height: 200,
    left: -80,
    top: -40,
  },
  orbRight: {
    width: 160,
    height: 160,
    right: -60,
    bottom: -30,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 42,
    marginBottom: 16,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 300,
  },
  features: {
    gap: 14,
    width: '100%',
    maxWidth: 280,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  featureText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 24,
    gap: 24,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentViolet,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: radii.full,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  nextText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
});
