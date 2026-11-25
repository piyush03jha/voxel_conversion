import { Controller, Get, Header } from '@nestjs/common'
import { CONVERSION_AVAILABLE } from '../../../packages/shared/src/compatibility'
import { QueueService } from './conversion/queue.service'

@Controller('health')
export class HealthController {
  constructor(private readonly jobs: QueueService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  getHealth() {
    return { status: 'ok', conversionAvailable: CONVERSION_AVAILABLE, ...this.jobs.health }
  }
}
