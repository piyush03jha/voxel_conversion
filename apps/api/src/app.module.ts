import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { FormatsController } from './formats.controller'

@Module({ controllers: [HealthController, FormatsController] })
export class AppModule {}
