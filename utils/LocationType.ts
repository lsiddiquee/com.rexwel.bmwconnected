import { LatitudeLongitude } from 'geolocation-utils';

export class LocationType implements LatitudeLongitude {
    label?: string;
    latitude!: number;
    longitude!: number;
    radius?: number = 20;
    address?: string; 
}