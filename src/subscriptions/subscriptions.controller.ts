import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { OrganizationMemberGuard, OrganizationRoles } from 'src/common';
import {
  EnsureCustomerResponseDto,
  SyncPlansRequestDto,
  SyncPlansResponseDto,
} from './dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@Controller({
  version: '1',
  path: 'subscriptions',
})
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post('sync')
  @ApiOperation({ summary: 'Sync subscription plans from Stripe' })
  async syncPlans(
    @Body() body: SyncPlansRequestDto,
  ): Promise<SyncPlansResponseDto> {
    const summary = await this.subscriptionsService.syncPlans({
      limit: body.limit,
    });
    return summary;
  }

  @Post('organizations/:organizationId/customer')
  @ApiOperation({
    summary: 'Ensure a Stripe customer exists for an organization',
  })
  @UseGuards(OrganizationMemberGuard)
  @OrganizationRoles(OrgRole.ADMIN, OrgRole.OWNER)
  async ensureCustomer(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ): Promise<EnsureCustomerResponseDto> {
    const customerId =
      await this.subscriptionsService.ensureCustomer(organizationId);
    return { customerId };
  }
}
