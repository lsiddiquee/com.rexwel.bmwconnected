import { CarBrand } from 'bmw-connected-drive';
import { ConnectedDriver } from '../ConnectedDriver';

class BmwDriver extends ConnectedDriver {
    /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.brand = CarBrand.Bmw;
    this.log('BMW ConnectedDrive driver has been initialized');
  }
}

module.exports = BmwDriver