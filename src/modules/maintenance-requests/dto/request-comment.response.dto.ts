import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MaintenanceRequestCommentAuthorTypeEnum,
  MaintenanceRequestCommentVisibilityEnum,
} from '../maintenance-requests.constants';

export class RequestCommentAuthorDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: MaintenanceRequestCommentAuthorTypeEnum })
  type!: MaintenanceRequestCommentAuthorTypeEnum;

  @ApiPropertyOptional({ nullable: true })
  ownerId?: string | null;
}

export class RequestCommentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  requestId!: string;

  @ApiProperty({ type: RequestCommentAuthorDto })
  author!: RequestCommentAuthorDto;

  @ApiProperty()
  message!: string;

  @ApiProperty({ enum: MaintenanceRequestCommentVisibilityEnum })
  visibility!: MaintenanceRequestCommentVisibilityEnum;

  @ApiProperty()
  createdAt!: Date;
}

type CommentWithAuthor = {
  id: string;
  requestId: string;
  message: string;
  createdAt: Date;
  authorType: string;
  visibility: string;
  authorOwnerId?: string | null;
  authorUser: { id: string; name?: string | null; email: string };
};

export const toRequestCommentResponse = (
  comment: CommentWithAuthor,
): RequestCommentResponseDto => ({
  id: comment.id,
  requestId: comment.requestId,
  author: {
    id: comment.authorUser.id,
    name: comment.authorUser.name ?? null,
    email: comment.authorUser.email,
    type: comment.authorType as MaintenanceRequestCommentAuthorTypeEnum,
    ownerId: comment.authorOwnerId ?? null,
  },
  message: comment.message,
  visibility: comment.visibility as MaintenanceRequestCommentVisibilityEnum,
  createdAt: comment.createdAt,
});
