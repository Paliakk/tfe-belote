import {  IsEnum, IsInt, IsOptional, Min } from "class-validator";

export enum BidType{
    PASS = 'pass',
    TAKE_CARD = 'take_card',        // tour 1 prise de la carte retournée
    CHOOSE_COLOR = 'choose_color'   //
}

export class CreateBidDto{
    @IsInt()
    @Min(1)

    @IsEnum(BidType)
    type: BidType
    @IsOptional()
    @IsInt()
    @Min(1)
    couleurAtoutId?: number
}