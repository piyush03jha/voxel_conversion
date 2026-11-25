import { Controller, Get } from '@nestjs/common'
import { ACCEPTED_FORMATS, MAX_UPLOAD_BYTES, getSupportedOutputs, getCompressionLevels, getOutputWarning } from '../../../packages/shared/src/compatibility'

import { QueueService } from './conversion/queue.service'
import { isWorkerRoute, COMPRESSION_LEVELS } from '../../../packages/shared/src/jobs'

@Controller('formats')
export class FormatsController {
  constructor(private readonly jobs: QueueService) {}
  @Get()
  async getFormats() {
    const { conversionAvailable } = await this.jobs.health()
    return {
      maxUploadBytes: MAX_UPLOAD_BYTES,
      conversionAvailable,
      compressionLevels: [...COMPRESSION_LEVELS],
      customColorAvailable: false,
      outputs: ACCEPTED_FORMATS.map((output) => ({ output, compressionLevels: getCompressionLevels(output), warning: getOutputWarning(output) })),
      formats: ACCEPTED_FORMATS.map((input) => ({ input, plannedOutputs: getSupportedOutputs(input), enabledOutputs: conversionAvailable ? getSupportedOutputs(input).filter((output) => isWorkerRoute(input, output)) : [] })),
    }
  }
}
