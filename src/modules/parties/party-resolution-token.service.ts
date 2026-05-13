import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PartyIdentifierType } from '@prisma/client';
import { env } from '../../config/env';

type ResolutionTokenPayload = {
  sub: string;
  orgId: string;
  partyId: string;
  identifierType: PartyIdentifierType;
  purpose: 'owner-party-resolution';
};

@Injectable()
export class PartyResolutionTokenService {
  constructor(private readonly jwtService: JwtService) {}

  async sign(input: {
    actorUserId: string;
    orgId: string;
    partyId: string;
    identifierType: PartyIdentifierType;
  }) {
    return this.jwtService.signAsync(
      {
        sub: input.actorUserId,
        orgId: input.orgId,
        partyId: input.partyId,
        identifierType: input.identifierType,
        purpose: 'owner-party-resolution',
      } satisfies ResolutionTokenPayload,
      {
        secret: env.OWNER_RESOLUTION_TOKEN_SECRET,
        expiresIn: env.OWNER_RESOLUTION_TOKEN_TTL_SECONDS,
      },
    );
  }

  async verify(
    token: string,
    actorUserId: string,
    orgId: string,
  ): Promise<ResolutionTokenPayload> {
    let payload: ResolutionTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: env.OWNER_RESOLUTION_TOKEN_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid owner resolution token');
    }

    if (
      payload.purpose !== 'owner-party-resolution' ||
      payload.sub !== actorUserId ||
      payload.orgId !== orgId
    ) {
      throw new BadRequestException(
        'Owner resolution token does not match actor scope',
      );
    }

    return payload;
  }
}
