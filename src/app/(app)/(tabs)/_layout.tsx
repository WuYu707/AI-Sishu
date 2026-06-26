import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';
import { BlurView } from 'expo-blur';
import { StyleSheet, Platform, View, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TABS = [
  { name: 'index', label: '学', icon: 'book-outline', iconActive: 'book' as const },
  { name: 'practice', label: '练', icon: 'document-text-outline', iconActive: 'document-text' as const },
  { name: 'ai', label: '智', icon: 'sparkles-outline', iconActive: 'sparkles' as const },
  { name: 'profile', label: '我', icon: 'person-outline', iconActive: 'person' as const },
];

function CustomTabBar({ state, navigation }: any) {
  const { isDark } = useAppContext();
  const insets = useSafeAreaInsets();
  const activeTint = '#2E6B5C';
  const inactiveTint = isDark ? '#888' : '#999';
  const { index: selectedIndex } = state;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom > 0 ? 0 : 8 }]}>
      <View style={[styles.blurWrap, {
        backgroundColor: isDark ? 'rgba(20,20,20,0.72)' : 'rgba(248,249,250,0.72)',
      }]}>
        {Platform.OS === 'android' ? (
          <BlurView
            intensity={50}
            tint={isDark ? 'dark' : 'light'}
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <BlurView intensity={80} tint="systemChromeMaterial" style={StyleSheet.absoluteFill} />
        )}
      </View>
      <View style={[styles.inner, { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]}>
        {TABS.map((tab, idx) => {
          const isSelected = idx === selectedIndex;
          const color = isSelected ? activeTint : inactiveTint;
          return (
            <Pressable key={tab.name} onPress={() => navigation.navigate(tab.name)} style={styles.tabItem}>
              <Ionicons name={isSelected ? tab.iconActive : tab.icon as any} size={24} color={color} />
              <Text style={[styles.label, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: '学' }} />
      <Tabs.Screen name="practice" options={{ title: '练' }} />
      <Tabs.Screen name="ai" options={{ title: '智' }} />
      <Tabs.Screen name="profile" options={{ title: '我' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 68,
  },
  blurWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8,
  },
  label: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
