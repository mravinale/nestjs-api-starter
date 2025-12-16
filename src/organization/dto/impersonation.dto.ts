export class ImpersonateUserDto {
  userId!: string;
}

export interface OrgMember {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt: Date;
}
