import { Body, Controller, Delete, Get, Header, Headers, Param, Post } from '@nestjs/common'
import { QueueService } from './queue.service'

@Controller('jobs')
export class ConversionController {
  constructor(private readonly jobs: QueueService) {}

  @Post('batches')
  @Header('Cache-Control','no-store')
  createBatch(@Body() body:unknown){return this.jobs.createBatch(body)}

  @Post('batches/:batchId/uploads')
  @Header('Cache-Control','no-store')
  batchUpload(@Param('batchId') id:string,@Body() body:unknown,@Headers('authorization') auth?:string){return this.jobs.createBatchUpload(id,body,auth)}

  @Post('uploads')
  @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown) { return this.jobs.create(body) }

  @Post(':id/parts')
  @Header('Cache-Control','no-store')
  parts(@Param('id') id:string,@Body() body:unknown,@Headers('authorization') auth?:string){return this.jobs.signParts(id,body,auth)}

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
