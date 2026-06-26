import React from 'react';
import { BlurView, type BlurViewProps } from 'expo-blur';
import { StyleSheet, Platform } from 'react-native';

interface GlassProps extends BlurViewProps {
  children?: React.ReactNode;
}

export function Glass({ intensity = 40, tint = 'systemChromeMaterial', children, style, ...props }: GlassProps) {
  if (Platform.OS !== 'android') {
    return <>{children}</>;
  }
  return (
    <BlurView
      intensity={intensity}
      tint={tint}
      style={[styles.container, style]}
      experimentalBlurMethod="dimezisBlurView"
      {...props}
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});

export const GLASS_LIGHT = 'systemChromeMaterial';
export const GLASS_DARK = 'systemChromeMaterialDark';
export const GLASS_ULTRA_LIGHT = 'systemUltraThinMaterialLight';
export const GLASS_THICK = 'systemThickMaterialLight';
