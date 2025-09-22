import { CarBrand } from 'bmw-connected-drive';
import { Vehicle } from '../Vehicle';

class Mini extends Vehicle {
    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        this.brand = CarBrand.Mini;
        return await super.onInit();
    }

    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.logger?.LogInformation(`Mini (${this.deviceData.id}) has been added`);
    }
}

module.exports = Mini;
