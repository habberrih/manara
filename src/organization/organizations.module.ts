import { Module } from '@nestjs/common';
import {
  OrganizationMemberGuard,
  TenantContextInterceptor,
} from 'src/helpers';
import { UserModule } from 'src/user/user.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [UserModule],
  controllers: [OrganizationsController, ApiKeysController],
  providers: [
    OrganizationsService,
    ApiKeysService,
    OrganizationMemberGuard,
    TenantContextInterceptor,
  ],
  exports: [OrganizationsService, ApiKeysService],
})
export class OrganizationsModule {}
