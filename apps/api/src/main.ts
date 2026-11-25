import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api')
  const origins = (process.env.WEB_ORIGINS ?? 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean)
  app.enableCors({ origin: origins, methods: ['GET', 'OPTIONS'] })
  app.enableShutdownHooks()
  const port = Number(process.env.PORT ?? 3001)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  await app.listen(port, '0.0.0.0')
}
void bootstrap().catch((error) => { console.error(error); process.exit(1) })
