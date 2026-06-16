import { Stack } from 'expo-router';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import { AppProvider, useAppContext } from '@/lib/AppContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import '../global.css';

// 全局通知处理器 — 只注册一次，避免多页面重复注册
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function RootLayoutNav() {
  const { dbReady, isDark } = useAppContext();

  // 数据库未就绪时显示加载指示器，避免空白屏
  if (!dbReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2C5F8A" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={isDark ? '#1E1E1E' : '#F8F9FA'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

const RootLayout: React.FC = () => {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppProvider>
          <RootLayoutNav />
          <PortalHost />
        </AppProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
};

export default RootLayout;
