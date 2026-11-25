import { Module } from '@nestjs/common'
import { QueueService } from './queue.service'
import { StorageService } from './storage.service'
import { ConversionController } from './conversion.controller'

@Module({ providers: [StorageService, QueueService], controllers: [ConversionController], exports: [QueueService] })
export class ConversionModule {}
