// Estimate time until a waiting job STARTS, not until it finishes.
// Inputs are actual completed-job durations and the elapsed time of active jobs.
export function estimateWaitSeconds(position: number, workers: number, samplesMs: readonly number[], activeElapsedMs: readonly number[]): number | null {
  if (!Number.isSafeInteger(position) || position < 1 || position > 100 ||
      !Number.isSafeInteger(workers) || workers < 1 || workers > 100 ||
      activeElapsedMs.length > workers || activeElapsedMs.some(n => !Number.isFinite(n) || n < 0)) return null
  const samples = samplesMs.filter(n => Number.isFinite(n) && n > 0 && n <= 900000).sort((a,b)=>a-b)
  if (samples.length < 3) return null
  const middle = Math.floor(samples.length/2)
  const typical = samples.length % 2 ? samples[middle] : (samples[middle-1]+samples[middle])/2
  // An overdue active job is not assumed to finish immediately.
  const available = activeElapsedMs.map(elapsed=>Math.max(typical*0.25,typical-elapsed))
  while (available.length < workers) available.push(0)
  for (let i=1;i<position;i++) {
    const next=available.indexOf(Math.min(...available))
    available[next]+=typical
  }
  return Math.ceil(Math.min(...available)/1000)
}
