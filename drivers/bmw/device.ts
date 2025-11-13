import { Vehicle } from '../Vehicle';

class Bmw extends Vehicle {
  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    return await super.onInit();
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  onAdded() {
    this.logger?.info(`BMW (${this.deviceData.id}) has been added`);
  }
}

module.exports = Bmw;
