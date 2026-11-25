import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { FormatsController } from './formats.controller'
import { ConversionModule } from './conversion/conversion.module'

@Module({ imports: [ConversionModule], controllers: [HealthController, FormatsController] })
export class AppModule {}
