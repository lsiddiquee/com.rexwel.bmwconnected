# BMW Connected

Adds support for BMW and Mini Connected Drive services to Homey.

Before adding a car you need to go to app settings and fill in your username and password for BMW / Mini Connected Services.

## Triggers
- Car location changed (this is only triggered when the car is locked, otherwise the update will be way too frequent.)
  - If the location is inside a configured geofence additional 'Label' argument is filled.
- Car alarm activated/deactivated.
- Car locked/unlocked.
- Battery level changed.
- Charging status changed (only for PHEV/BEV)

## Conditions
- Car is (not) locked
- Car alarm is (not) armed

## Actions
- Activate Climate Now (Only on supported cars)
- Lock/Unlock car
- Blow horn
- Flash headlights
- Send message

## Settings
- Polling interval in seconds (This is the interval at which the app will poll for the vehicle status.)

## Acknowledgements
- Use at your own risk. I accept no responsibility for any damages caused by using this app.
- Reverse geo coding data is provided under ODbL and © OpenStreetMap contributors. Further details https://www.openstreetmap.org/copyright.

## Useful links
- [Latest release info](https://community.athom.com/t/app-bmw-connected/49199/2)
- [Changelog](https://community.athom.com/t/app-bmw-connected/49199/3)
- [FAQ](https://community.athom.com/t/app-bmw-connected/49199/4)
- [TODO List](https://community.athom.com/t/app-bmw-connected/49199/5)