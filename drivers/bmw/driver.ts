import { ConnectedDriver } from '../ConnectedDriver';

class BmwDriver extends ConnectedDriver {
  protected get brand(): string {
    return 'BMW';
  }

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    await super.onInit();
    this.log('BMW ConnectedDrive driver has been initialized');
  }
}

module.exports = BmwDriver;
