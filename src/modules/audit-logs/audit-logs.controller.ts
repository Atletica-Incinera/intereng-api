import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  async findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditLogsService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const log = await this.auditLogsService.findById(id);
    if (!log) {
      throw new NotFoundException('Log de auditoria não encontrado');
    }
    return log;
  }
}