import { registerSimpleTest } from './general.js';

registerSimpleTest({
  id: 'tracking',
  secondsInputId: 'trackingSeconds',
  difficultySelectId: 'trackingDifficulty',
  minSeconds: 5,
  maxSeconds: 600
});
