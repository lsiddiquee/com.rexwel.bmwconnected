import { LatitudeLongitude } from 'geolocation-utils';

export class LocationType implements LatitudeLongitude {
  label: string;
  latitude: number;
  longitude: number;
  radius?: number;
  address: string;

  constructor(
    label: string = '',
    latitude: number,
    longitude: number,
    address: string = '',
    radius?: number
  ) {
    this.label = label;
    this.latitude = latitude;
    this.longitude = longitude;
    this.address = address;
    this.radius = radius;
  }
}
