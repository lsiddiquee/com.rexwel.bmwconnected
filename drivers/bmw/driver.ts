import { ConnectedDriver } from '../ConnectedDriver';

class BmwDriver extends ConnectedDriver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('BMW ConnectedDrive driver has been initialized');
  }
}

module.exports = BmwDriver;
