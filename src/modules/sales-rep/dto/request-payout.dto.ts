import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/**
 * A sales rep requests a cash payout of ALL their currently-available cash
 * referrals to the supplied bank account. (Only one open payout at a time.)
 */
export class RequestSalesRepPayoutDto {
  @ApiProperty({ example: '044', description: 'Bank code (e.g. Paystack)' })
  @IsString()
  @MaxLength(20)
  bankCode: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @MaxLength(20)
  accountNumber: string;

  @ApiProperty({ example: 'Ada Obi' })
  @IsString()
  @MaxLength(255)
  accountName: string;
}
