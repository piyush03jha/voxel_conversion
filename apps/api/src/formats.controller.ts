import { Controller, Get } from '@nestjs/common'
import { ACCEPTED_FORMATS, MAX_UPLOAD_BYTES, CONVERSION_AVAILABLE, getSupportedOutputs } from '../../../packages/shared/src/compatibility'

@Controller('formats')
export class FormatsController {
  @Get()
  getFormats() {
    return {
      maxUploadBytes: MAX_UPLOAD_BYTES,
      conversionAvailable: CONVERSION_AVAILABLE,
      formats: ACCEPTED_FORMATS.map((input) => ({ input, plannedOutputs: getSupportedOutputs(input), enabledOutputs: [] })),
    }
  }
}
