import { registerSimpleTest } from './general.js';

registerSimpleTest({
  id: 'memory',
  secondsInputId: 'memorySeconds',
  difficultySelectId: 'memoryDifficulty',
  minSeconds: 5,
  maxSeconds: 600
});
