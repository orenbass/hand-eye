// flightexam.config.js
export function getFlightExamConfig(){
  const timing = window.appSettings && window.appSettings.newExamTiming ? window.appSettings.newExamTiming : null;
  return {
    pathDisplaySec: timing && timing.pathDisplaySec ? Math.max(1,+timing.pathDisplaySec) : 15,
    preFlightDelaySec: timing && timing.preFlightDelaySec ? Math.max(0,+timing.preFlightDelaySec) : 10,
    flightDurationSec: timing && timing.flightDurationSec ? Math.max(5,+timing.flightDurationSec) : 60,
    REVIEW_AUTO_SEC: 30,
    END_REACH_RADIUS: 0.02,
    MAX_DIST_FOR_FULL_SCORE: 0.12,
    CORRIDOR_HALF_WIDTH: 0.08,
    CORRIDOR_PENALTY_WIDTH: 0.18,
    FORWARD_SPEED: 0.22,
    ROT_SPEED_BASE: Math.PI/3,
    ROT_SPEED_MAX: Math.PI,
    ROT_ACCEL_TIME: 1.5,
    PLANE_ROT_OFFSET: Math.PI/4
  };
}
