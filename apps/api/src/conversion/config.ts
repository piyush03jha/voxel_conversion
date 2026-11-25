export function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid ' + name)
  return value
}
export const settings = () => {
  if (process.env.NODE_ENV === 'production' && process.env.QUEUE_TEST_MODE === 'true') throw new Error('QUEUE_TEST_MODE is prohibited in production')
  return ({
  queueTestMode: process.env.QUEUE_TEST_MODE === 'true',
  acceptJobs: process.env.QUEUE_ACCEPT_JOBS === 'true',
  capacity: intEnv('QUEUE_CAPACITY', 100, 1, 100),
  uploadSeconds: intEnv('UPLOAD_URL_TTL_SECONDS', 900, 60, 1800),
  retentionSeconds: intEnv('JOB_RETENTION_SECONDS', 86400, 3600, 86400),
  createsPerMinute: intEnv('UPLOADS_PER_MINUTE', 30, 1, 100),
  downloadSeconds: intEnv('DOWNLOAD_URL_TTL_SECONDS', 300, 30, 900),
})
}
