import { Controller, Get, Param } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service';

@Controller()
export class AuditLogsController {
  constructor(private readonly auditService: AuditService) {}

  @Get('editions/:editionId/audit-logs')
  async getByEdition(@Param('editionId') editionId: string) {
    return this.auditService.findByEdition(editionId);
  }

  @Get('audit-logs')
  async getAll() {
    return this.auditService.findAll();
  }
}