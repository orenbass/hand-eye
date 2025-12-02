// flightexam.scoring.js
export function computeFlightExamRaw(userTrack, corridorHalfWidth, corridorPenaltyWidth){
  if(!userTrack || !userTrack.length) return 0;
  const half = Math.max(0.0001, corridorHalfWidth || 0.08);
  const clamp01 = (val) => Math.max(0, Math.min(1, val));

  let maxProgress = 0;
  let coverageProgress = 0;
  let insideProgress = 0;
  let weightedCenterDeviation = 0;

  let fallbackInsideSamples = 0;
  let fallbackCenterSum = 0;

  let prevProgress = null;
  let prevInside = false;
  let prevNorm = 1;

  for(const sample of userTrack){
    if(!sample) continue;
    const progressRaw = typeof sample.progress === 'number' ? sample.progress : null;
    const progress = progressRaw !== null && Number.isFinite(progressRaw) ? clamp01(progressRaw) : null;
    const dist = typeof sample.d === 'number' && Number.isFinite(sample.d) ? Math.max(0, sample.d) : null;
    const inside = dist !== null ? dist <= half : false;
    const normDist = dist !== null && half > 0 ? clamp01(dist / half) : 1;

    if(progress !== null && progress > maxProgress){
      maxProgress = progress;
    }

    if(progress !== null && prevProgress !== null){
      let delta = progress - prevProgress;
      if(!Number.isFinite(delta)) delta = 0;
      if(delta < -0.01){
        delta = 0; // ignore large regressions along the path
      } else if(delta < 0){
        delta = 0;
      }
      if(delta > 0){
        coverageProgress += delta;
        let insideDelta = 0;
        let centerContribution = 0;
        if(prevInside && inside){
          insideDelta = delta;
          centerContribution = delta * ((prevNorm + normDist) / 2);
        } else if(prevInside || inside){
          insideDelta = delta * 0.5;
          const contributingNorm = prevInside ? prevNorm : normDist;
          centerContribution = delta * contributingNorm * 0.5;
        }
        insideProgress += insideDelta;
        weightedCenterDeviation += centerContribution;
      }
    }

    if(inside){
      fallbackInsideSamples += 1;
      fallbackCenterSum += normDist;
    }

    if(progress !== null){
      prevProgress = progress;
      prevInside = inside;
      prevNorm = normDist;
    }
  }

  if(coverageProgress <= 0){
    coverageProgress = maxProgress;
  }
  coverageProgress = clamp01(coverageProgress);
  const pathCoverage = coverageProgress;

  let insideCoverage = 0;
  if(pathCoverage > 1e-6){
    insideCoverage = clamp01(insideProgress / pathCoverage);
  } else if(userTrack.length){
    insideCoverage = clamp01(fallbackInsideSamples / userTrack.length);
  }

  let centerFactor = 1;
  if(insideProgress > 1e-6){
    const avgDeviation = clamp01(weightedCenterDeviation / insideProgress);
    centerFactor = Math.max(0, 1 - avgDeviation * 0.2);
  } else if(fallbackInsideSamples > 0){
    const avgDeviation = clamp01(fallbackCenterSum / fallbackInsideSamples);
    centerFactor = Math.max(0, 1 - avgDeviation * 0.2);
  }

  const baseScore = pathCoverage * insideCoverage;
  const accuracy = clamp01(baseScore * centerFactor);
  return accuracy * 100;
}
export function scaleFlightExam(raw, scaleRange){
  const g = scaleRange || {min:1,max:7};
  return g.min + (Math.min(100,Math.max(0,raw))/100)*(g.max-g.min);
}
