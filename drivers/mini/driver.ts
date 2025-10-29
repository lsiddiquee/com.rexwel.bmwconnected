import { ConnectedDriver } from '../ConnectedDriver';

class MiniDriver extends ConnectedDriver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('MINI ConnectedDrive driver has been initialized');
  }
}

module.exports = MiniDriver;
