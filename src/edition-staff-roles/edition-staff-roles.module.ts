import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EditionStaffRolesController } from './edition-staff-roles.controller';
import { EditionStaffRolesService } from './edition-staff-roles.service';

@Module({
  imports: [AuthModule],
  controllers: [EditionStaffRolesController],
  providers: [EditionStaffRolesService],
  exports: [EditionStaffRolesService],
})
export class EditionStaffRolesModule {}
