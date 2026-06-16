/**
 * 登录页（当前应用为纯本地模式，此页面暂不使用）
 */
import { Redirect } from 'expo-router';

export default function SignIn() {
  // 本应用无需登录，直接重定向到主页
  return <Redirect href="/(app)/(tabs)" />;
}
