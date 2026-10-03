'use strict';

function findVehicle(homey, id) {
  for (const driver of Object.values(homey.drivers.getDrivers())) {
    for (const device of driver.getDevices()) {
      if (device.getData().id === id) return device;
    }
  }
  return null;
}

module.exports = {
  async getStatus({ homey, query }) {
    try {
      const vehicle = query && query.id ? findVehicle(homey, query.id) : null;
      if (!vehicle) return { error: 'not found' };

      const electric = vehicle.currentVehicleState && vehicle.currentVehicleState.electric;
      let eta = null;
      if (
        electric &&
        electric.chargingStatus === 'CHARGING' &&
        electric.remainingChargingMinutes !== undefined &&
        electric.remainingChargingMinutesAt
      ) {
        const end = new Date(
          new Date(electric.remainingChargingMinutesAt).getTime() +
            electric.remainingChargingMinutes * 60000
        );
        eta = end.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: homey.clock.getTimezone(),
        });
      }

      const rangeOptions = vehicle.getCapabilityOptions('range_capability') || {};
      return {
        name: vehicle.getName(),
        soc: vehicle.getCapabilityValue('measure_battery'),
        target: electric && electric.chargingTarget !== undefined ? electric.chargingTarget : null,
        range: vehicle.getCapabilityValue('range_capability'),
        rangeUnit: rangeOptions.units || 'km',
        chargingStatus: (electric && electric.chargingStatus) || 'UNKNOWN',
        pluggedIn: !!(electric && electric.isChargerConnected),
        eta,
        alarm: vehicle.getCapabilityValue('caralarm_state'),
      };
    } catch (err) {
      homey.log && homey.log('widget.car-information getStatus error: ' + String(err));
      return { error: String(err) };
    }
  },

  async getImage({ homey, query }) {
    try {
      const vehicle = query && query.id ? findVehicle(homey, query.id) : null;
      if (!vehicle) return { error: 'not found' };
      return { image: vehicle.getStoreValue('widgetImage') || null };
    } catch (err) {
      homey.log && homey.log('widget.car-information getImage error: ' + String(err));
      return { error: String(err) };
    }
  },
};