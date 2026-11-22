import { Publico } from '../personal/acceso.decorator';
import { Controller, Get } from '@nestjs/common';

import { HealthService } from './health.service';

@Publico()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): Promise<{ status: 'ok' }> {
    return this.healthService.check();
  }
}
