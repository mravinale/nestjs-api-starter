import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { RolesGuard, Roles, PermissionsGuard, RequirePermissions } from '../../../../../shared';
import { OrgImpersonationService } from '../../application/services';
import { ImpersonateUserDto } from '../../api/dto';

/**
 * Controller for org-scoped impersonation.
 * Allows org managers (admin/manager) to impersonate members within their organization.
 */
@Controller('api/organization')
@UseGuards(RolesGuard, PermissionsGuard)
@Roles('admin', 'manager')
export class OrgImpersonationController {
  constructor(private readonly impersonationService: OrgImpersonationService) {}

  /**
   * Impersonate a user within an organization.
   * Only org managers (admin/manager) can impersonate.
   * Target user must be a member of the same organization.
   */
  @Post(':organizationId/impersonate')
  @RequirePermissions('user:impersonate')
  async impersonate(
    @Param('organizationId') organizationId: string,
    @Body() dto: ImpersonateUserDto,
    @Session() session: UserSession,
  ) {
    if (!session?.user?.id) {
      throw new ForbiddenException('Authentication required');
    }

    const result = await this.impersonationService.impersonateUser(
      session.user.id,
      dto.userId,
      organizationId,
    );

    return {
      success: true,
      sessionToken: result.sessionToken,
    };
  }

  /**
   * Stop impersonation - returns to original session.
   * This endpoint uses the current session token to identify the impersonation session.
   */
  @Post('stop-impersonating')
  async stopImpersonating(@Req() request: Request & { headers: { authorization?: string } }) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ForbiddenException('No session token provided');
    }

    const sessionToken = authHeader.substring(7);
    await this.impersonationService.stopImpersonation(sessionToken);

    return { success: true };
  }
}
