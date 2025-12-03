import { registerSimpleTest } from './general.js';

registerSimpleTest({
  id: 'reaction',
  secondsInputId: 'reactionSeconds',
  difficultySelectId: 'reactionDifficulty',
  minSeconds: 5,
  maxSeconds: 600
});
