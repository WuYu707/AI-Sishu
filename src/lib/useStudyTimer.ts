/**
 * 学习计时Hook - 记录用户在各模块的停留时间
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { updateTodayStat } from '@/lib/database';

export function useStudyTimer(module: string, active: boolean = true) {
  const startRef = useRef<number>(Date.now());
  const accRef = useRef<number>(0);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!active) return;
    startRef.current = Date.now();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current === 'active' && nextState.match(/inactive|background/)) {
        accRef.current += Date.now() - startRef.current;
      } else if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        startRef.current = Date.now();
      }
      appStateRef.current = nextState;
    });

    return () => {
      sub.remove();
      const total = accRef.current + (Date.now() - startRef.current);
      const minutes = Math.round(total / 60000);
      if (minutes > 0) {
        updateTodayStat({ study_minutes: minutes }).catch(() => {});
      }
    };
  }, [active, module]);
}
