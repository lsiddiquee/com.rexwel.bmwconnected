import { CarBrand } from 'bmw-connected-drive';
import { ConnectedDriver } from '../ConnectedDriver';

class MiniDriver extends ConnectedDriver {
    /**
   * onInit is called when the driver is initialized.
   */
    async onInit() {
        this.brand = CarBrand.Mini;
        this.log('Mini ConnectedDrive driver has been initialized');
    }
}

module.exports = MiniDriver