import { Vehicle } from '../Vehicle';

class Mini extends Vehicle {
    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.logger?.LogInformation(`Mini (${this.deviceData.id}) has been added`);
    }
}

module.exports = Mini;
