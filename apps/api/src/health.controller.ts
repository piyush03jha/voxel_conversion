import { Controller, Get, Header } from '@nestjs/common'
import { QueueService } from './conversion/queue.service'

@Controller('health')
export class HealthController {
  constructor(private readonly jobs: QueueService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  async getHealth() {
    return { status: 'ok', ...await this.jobs.health() }
  }
}
