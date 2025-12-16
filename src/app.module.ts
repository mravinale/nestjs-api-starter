import { Module, OnModuleInit } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth, setEmailService } from './auth';
import { ConfigModule, ConfigService } from './config';
import { EmailModule, EmailService } from './email';
import { DatabaseModule } from './database';
import { RbacModule } from './rbac';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';
import { OrganizationModule } from './organization/organization.module';

@Module({
  imports: [
    ConfigModule,
    EmailModule,
    DatabaseModule,
    RbacModule,
    PlatformAdminModule,
    OrganizationModule,
    AuthModule.forRoot({ auth }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    // Validate environment variables
    this.configService.validateEnvironment();
    
    // Wire up email service to auth
    setEmailService(this.emailService);
    console.log('✅ Email service connected to Better Auth');
  }
}
