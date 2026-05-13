import {
  ForbiddenException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { env } from '../../config/env';
import { UserAccessProjectionService } from '../access-control/user-access-projection.service';
import { AuthRepo } from './auth.repo';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { normalizeEmail } from '../users/user-identity.util';
import { AuthPasswordDeliveryService } from './auth-password-delivery.service';
import { PasswordResetEmailPurpose } from './auth.types';

interface JwtPayload {
  sub: string;
  email: string;
  orgId?: string | null;
}

type RequestPasswordResetOptions = {
  purpose?: PasswordResetEmailPurpose;
  issuedByUserId?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepo: AuthRepo,
    private readonly jwtService: JwtService,
    private readonly authPasswordDeliveryService: AuthPasswordDeliveryService,
    private readonly userAccessProjectionService: UserAccessProjectionService,
  ) {}

  async register(dto: RegisterDto) {
    if (!env.AUTH_PUBLIC_REGISTER_ENABLED) {
      throw new ForbiddenException('Public registration is disabled');
    }

    const email = normalizeEmail(dto.email);
    const existing = await this.authRepo.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.authRepo.createUser({
      email,
      passwordHash,
      name: dto.name,
    });

    const tokens = await this.issueTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return {
      ...tokens,
      user: await this.userAccessProjectionService.buildUserResponse(
        user,
        user.orgId ?? null,
      ),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.authRepo.findByEmail(normalizeEmail(dto.email));
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await argon2.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return {
      ...tokens,
      user: await this.userAccessProjectionService.buildUserResponse(
        user,
        user.orgId ?? null,
      ),
    };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.authRepo.findById(userId);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token invalid');
    }

    const validRefresh = await argon2.verify(
      user.refreshTokenHash,
      refreshToken,
    );
    if (!validRefresh) {
      throw new UnauthorizedException('Refresh token invalid');
    }

    const tokens = await this.issueTokens(user);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return {
      ...tokens,
      user: await this.userAccessProjectionService.buildUserResponse(
        user,
        user.orgId ?? null,
      ),
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.authRepo.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await argon2.verify(
      user.passwordHash,
      currentPassword,
    );
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.authRepo.updatePasswordHash(user.id, passwordHash);

    return { success: true };
  }

  async logout(userId: string) {
    await this.authRepo.clearRefreshTokenHash(userId);
    return { success: true };
  }

  async requestPasswordReset(
    email: string,
    options?: RequestPasswordResetOptions,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.authRepo.findByEmailInsensitive(normalizedEmail);
    const purpose = options?.purpose ?? 'PASSWORD_RESET';

    if (!user || !user.isActive) {
      return { success: true };
    }

    const token = this.generatePasswordResetToken();
    const tokenHash = this.hashPasswordResetToken(token);
    const expiresAt = new Date(
      Date.now() + env.AUTH_PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );
    const inviteeName = user.name ?? null;
    const inviterName =
      options?.issuedByUserId &&
      (purpose === 'RESIDENT_INVITE' ||
        purpose === 'OWNER_INVITE' ||
        purpose === 'PROVIDER_INVITE')
        ? ((await this.authRepo.findById(options.issuedByUserId))?.name ?? null)
        : null;

    await this.authRepo.createPasswordResetToken(
      user.id,
      tokenHash,
      expiresAt,
      purpose,
    );
    if (purpose === 'RESIDENT_INVITE' && user.orgId) {
      await this.authRepo.createResidentInvite({
        orgId: user.orgId,
        userId: user.id,
        createdByUserId: options?.issuedByUserId ?? null,
        email: user.email,
        tokenHash,
        expiresAt,
      });
    }

    await this.authPasswordDeliveryService.enqueuePasswordResetEmail({
      email: user.email,
      token,
      tokenHash,
      expiresAt,
      purpose,
      issuedByUserId: options?.issuedByUserId ?? null,
      context: {
        inviteeName,
        inviterName,
      },
      orgId: user.orgId ?? null,
      userId: user.id,
    });

    return { success: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const normalizedToken = token.trim();
    const tokenHash = this.hashPasswordResetToken(normalizedToken);
    const passwordHash = await argon2.hash(newPassword);
    const changed = await this.authRepo.resetPasswordByToken(
      tokenHash,
      passwordHash,
    );
    if (!changed) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    return { success: true };
  }

  private async issueTokens(user: User) {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      orgId: user.orgId ?? null,
    };

    const refreshPayload = {
      sub: user.id,
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: env.JWT_ACCESS_SECRET,
      expiresIn: env.JWT_ACCESS_TTL,
    });

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: env.JWT_REFRESH_SECRET,
      expiresIn: env.JWT_REFRESH_TTL,
    });

    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, refreshToken: string) {
    const refreshTokenHash = await argon2.hash(refreshToken);
    await this.authRepo.updateRefreshTokenHash(userId, refreshTokenHash);
  }

  private generatePasswordResetToken() {
    return randomBytes(32).toString('hex');
  }

  private hashPasswordResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
