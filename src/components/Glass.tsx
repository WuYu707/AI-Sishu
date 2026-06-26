import React from 'react';
import { BlurView, type BlurViewProps } from '@react-native-community/blur';
import { StyleSheet, Platform, View } from 'react-native';

interface GlassProps {
  children?: React.ReactNode;
  blurAmount?: number;
  blurType?: 'light' | 'dark' | 'extralight' | 'prominent' | 'regular' | 'systemChromeMaterial';
  style?: any;
}

export function Glass({ blurAmount = 20, blurType = 'light', children, style }: GlassProps) {
  if (Platform.OS === 'android') {
    return (
      <View style={[StyleSheet.absoluteFill, style]}>
        <BlurView
          blurType={blurType}
          blurAmount={blurAmount}
          reducedTransparencyFallback={false}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }
  return (
    <BlurView
      blurType={blurType}
      blurAmount={blurAmount}
      style={style}
    >
      {children}
    </BlurView>
  );
}
