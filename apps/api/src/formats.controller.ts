import { Controller, Get } from '@nestjs/common'
import { ACCEPTED_FORMATS, getSupportedOutputs, getCompressionLevels, getOutputWarning, getOutputGroups, FORMAT_USE } from '../../../packages/shared/src/compatibility'

import { QueueService } from './conversion/queue.service'
import { isWorkerRoute, COMPRESSION_LEVELS } from '../../../packages/shared/src/jobs'

@Controller('formats')
export class FormatsController {
  constructor(private readonly jobs: QueueService) {}
  @Get()
  async getFormats() {
    const { conversionAvailable } = await this.jobs.health()
    return {
      maxUploadBytes: null, // no fixed application cap
      conversionAvailable,
      compressionLevels: [...COMPRESSION_LEVELS],
      customColorAvailable: false,
      outputs: ACCEPTED_FORMATS.map((output) => ({ output, compressionLevels: getCompressionLevels(output), warning: getOutputWarning(output), use: FORMAT_USE[output] })),
      formats: ACCEPTED_FORMATS.map((input) => ({ input, ...getOutputGroups(input), plannedOutputs: getSupportedOutputs(input), enabledOutputs: conversionAvailable ? getSupportedOutputs(input).filter((output) => isWorkerRoute(input, output)) : [] })),
    }
  }
}
