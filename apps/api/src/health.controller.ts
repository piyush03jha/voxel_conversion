import { Controller, Get } from '@nestjs/common'
import { CONVERSION_AVAILABLE } from '../../../packages/shared/src/compatibility'

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok', conversionAvailable: CONVERSION_AVAILABLE }
  }
}
