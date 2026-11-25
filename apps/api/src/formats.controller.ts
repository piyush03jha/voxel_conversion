import { Controller, Get } from '@nestjs/common'
import { ACCEPTED_FORMATS, MAX_UPLOAD_BYTES, getSupportedOutputs } from '../../../packages/shared/src/compatibility'

import { QueueService } from './conversion/queue.service'
import { isWorkerRoute } from '../../../packages/shared/src/jobs'

@Controller('formats')
export class FormatsController {
  constructor(private readonly jobs: QueueService) {}
  @Get()
  async getFormats() {
    const { conversionAvailable } = await this.jobs.health()
    return {
      maxUploadBytes: MAX_UPLOAD_BYTES,
      conversionAvailable,
      formats: ACCEPTED_FORMATS.map((input) => ({ input, plannedOutputs: getSupportedOutputs(input), enabledOutputs: conversionAvailable ? getSupportedOutputs(input).filter((output) => isWorkerRoute(input, output)) : [] })),
    }
  }
}
