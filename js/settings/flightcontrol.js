import { registerSimpleTest } from './general.js';

registerSimpleTest({
  id: 'flightcontrol',
  secondsInputId: 'flightcontrolSeconds',
  difficultySelectId: 'flightcontrolDifficulty',
  minSeconds: 5,
  maxSeconds: 600
});
