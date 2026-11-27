export function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid ' + name)
  return value
}
export const settings = () => {
  if (process.env.NODE_ENV === 'production' && process.env.QUEUE_TEST_MODE === 'true') throw new Error('QUEUE_TEST_MODE is prohibited in production')
  if (process.env.NODE_ENV === 'production' && process.env.QUEUE_ACCEPT_JOBS === 'true' && process.env.PUBLIC_CONVERSION_APPROVED !== 'true') throw new Error('Public conversion requires explicit deployment approval')
  return ({
  queueTestMode: process.env.QUEUE_TEST_MODE === 'true',
  acceptJobs: process.env.QUEUE_ACCEPT_JOBS === 'true',
  capacity: intEnv('QUEUE_CAPACITY', 100, 1, 100),
  // Shared outstanding/retained input reservation budget, not a per-file limit.
  storageBudgetBytes: intEnv('TEMP_INPUT_BUDGET_GIB', 32, 1, 1024 * 1024) * 1024 ** 3,
  multipartSeconds: intEnv('MULTIPART_UPLOAD_TTL_SECONDS', 7200, 1800, 21600),
  uploadSeconds: intEnv('UPLOAD_URL_TTL_SECONDS', 900, 60, 1800),
  retentionSeconds: intEnv('JOB_RETENTION_SECONDS', 86400, 3600, 86400),
  createsPerMinute: intEnv('UPLOADS_PER_MINUTE', 30, 1, 100),
  downloadSeconds: intEnv('DOWNLOAD_URL_TTL_SECONDS', 300, 30, 900),
})
}
