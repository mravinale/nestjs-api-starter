import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard, Roles } from '../../common';
import { AdminOrganizationsService } from '../services';
import { PaginationQuery, UpdateOrganizationDto } from '../dto';

/**
 * Controller for platform-level organization management.
 * All endpoints require platform admin role.
 */
@Controller('api/platform-admin/organizations')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminOrganizationsController {
  constructor(private readonly orgService: AdminOrganizationsService) {}

  /**
   * List all organizations with pagination and search
   */
  @Get()
  async list(@Query() query: PaginationQuery) {
    const page = query.page ? parseInt(String(query.page), 10) : 1;
    const limit = query.limit ? parseInt(String(query.limit), 10) : 20;
    const search = query.search;

    const result = await this.orgService.findAll({ page, limit, search });
    return result;
  }

  /**
   * Get a single organization by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const org = await this.orgService.findById(id);
    if (!org) {
      throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
    }
    return { data: org };
  }

  /**
   * Get members of an organization
   */
  @Get(':id/members')
  async getMembers(@Param('id') id: string) {
    const org = await this.orgService.findById(id);
    if (!org) {
      throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
    }
    const members = await this.orgService.getMembers(id);
    return { data: members };
  }

  /**
   * Update an organization
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    const org = await this.orgService.update(id, dto);
    if (!org) {
      throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
    }
    return { data: org };
  }

  /**
   * Delete an organization
   */
  @Delete(':id')
  async delete(@Param('id') id: string) {
    try {
      await this.orgService.delete(id);
      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message === 'Organization not found') {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }
}
