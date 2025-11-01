import { ConnectedDriver } from '../ConnectedDriver';

class MiniDriver extends ConnectedDriver {
  protected get brand(): string {
    return 'MINI';
  }

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    await super.onInit();
    this.log('MINI ConnectedDrive driver has been initialized');
  }
}

module.exports = MiniDriver;
