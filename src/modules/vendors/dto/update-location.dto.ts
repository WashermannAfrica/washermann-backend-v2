import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude } from 'class-validator';

/**
 * Vendor sets their shop coordinates — the client obtains these from Google
 * Places/Geocoding (a place pick or the device location) and sends the resolved
 * lat/lng here. Used for distance-based transport pricing.
 */
export class UpdateVendorLocationDto {
  @ApiProperty({ example: 6.4550 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 3.3841 })
  @IsLongitude()
  longitude: number;
}
