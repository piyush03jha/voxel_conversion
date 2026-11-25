import { Body, Controller, Delete, Get, Header, Headers, Param, Post } from '@nestjs/common'
import { QueueService } from './queue.service'

@Controller('jobs')
export class ConversionController {
  constructor(private readonly jobs: QueueService) {}

  @Post('uploads')
  @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown) { return this.jobs.create(body) }

  @Post(':id/submit')
  @Header('Cache-Control', 'no-store')
  submit(@Param('id') id: string, @Headers('authorization') auth?: string) { return this.jobs.submit(id, auth) }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  status(@Param('id') id: string, @Headers('authorization') auth?: string) { return this.jobs.status(id, auth) }

  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  cancel(@Param('id') id: string, @Headers('authorization') auth?: string) { return this.jobs.cancel(id, auth) }

  @Post(':id/preview')
  @Header('Cache-Control', 'no-store')
  preview(@Param('id') id: string, @Headers('authorization') auth?: string) { return this.jobs.previewOutput(id, auth) }

  @Get(':id/download')
  @Header('Cache-Control', 'no-store')
  download(@Param('id') id: string, @Headers('authorization') auth?: string) { return this.jobs.download(id, auth) }
}
