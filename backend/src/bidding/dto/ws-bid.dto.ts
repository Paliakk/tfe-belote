import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { BidType } from './create-bid.dto';

export class WsPlaceBidDto {
  @IsInt()
  @Min(1)
  mancheId!: number;

  @IsEnum(BidType)
  type!: BidType;

  @IsOptional()
  @IsInt()
  @Min(1)
  couleurAtoutId?: number;
}
