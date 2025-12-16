/**
 * DTO for creating a new role
 */
export class CreateRoleDto {
  name: string;
  displayName: string;
  description?: string;
  color?: string;
}
