import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Whether the phone asks for reduced motion (D15: sheets appear without sliding, skeletons hold still, the
 * confirmation shows its end state). Follows the setting while the app is open. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (active) setReduce(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}
