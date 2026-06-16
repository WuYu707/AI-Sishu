import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/lib/AppContext';

export default function TabsLayout() {
  const { isDark } = useAppContext();

  const activeTint = '#2E6B5C';
  const inactiveTint = isDark ? '#888' : '#999';
  const tabBarBg = isDark ? '#1E1E1E' : '#FFFFFF';
  const borderColor = isDark ? '#333' : '#E5E7EB';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        tabBarStyle: {
          backgroundColor: tabBarBg,
          borderTopColor: borderColor,
          height: 68,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '学',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: '练',
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: '智',
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
