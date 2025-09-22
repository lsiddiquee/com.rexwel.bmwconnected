import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import Homey from 'homey';
import { CarBrand, ConnectedDrive, ILogger, Regions } from 'bmw-connected-drive';
import { HomeyTokenStore } from './utils/HomeyTokenStore';
import { ConfigurationManager } from './utils/ConfigurationManager';
import { DeviceData } from './utils/DeviceData';
import { Logger } from './utils/Logger';
import { Configuration } from './utils/Configuration';
import { LocationType } from './utils/LocationType';
import * as semver from 'semver';
import { ConnectedDriver } from './drivers/ConnectedDriver';

// TODO:
// Window states capability
// Hood state capability
// Trunk state capability
// Charging current control capability
// Charging schedule capability
// Last status update

export class BMWConnectedDrive extends Homey.App {
    tokenStore?: HomeyTokenStore;
    connectedDriveApi?: ConnectedDrive;
    logger?: Logger;
    currentLocation?: LocationType;

    /**
     * onInit is called when the app is initialized.
     */
    async onInit(): Promise<void> {
        this.logger = new Logger(this.homey, () => ConfigurationManager.getConfiguration(this.homey).logLevel);
        this.tokenStore = new HomeyTokenStore(this.homey);
        let configuration = ConfigurationManager.getConfiguration(this.homey);
        if (!configuration) {
            configuration = new Configuration();
            ConfigurationManager.setConfiguration(this.homey, configuration);
        }
        else {
            await this.migrate_configuration();
        }

        // Using dummy credentials to initialize the ConnectedDrive API
        // The actual credentials are not stored in the app, only the token.
        // The authentication happens in the login flow, and the token is persisted.
        this.connectedDriveApi = new ConnectedDrive("dummy_user", "false_password", configuration.region, this.tokenStore, this.logger);
        this.logger.LogInformation('BMWConnectedDrive app has been initialized');

        this.registerActionCards();
        this.registerConditionCards();
    }

    /**
     * Helper function to handle common flow action logic
     * @param actionName Name of the action for logging and error messages
     * @param args Flow action arguments
     * @param apiAction Function to call on the ConnectedDrive API
     */
    private async handleFlowAction(actionName: string, args: any, apiAction: (vin: string, brand: CarBrand) => Promise<void>): Promise<void> {
        const brand = (args.device?.driver as ConnectedDriver)?.brand ?? CarBrand.Bmw;
        const vin = (args.device?.deviceData as DeviceData)?.id;
        if (!vin) {
            throw new Error(`VIN not found while ${actionName} flow triggered.`);
        }
        args.device.log(`Flow triggered ${actionName} for vin ${vin}`);

        try {
            await apiAction(vin, brand);
        } catch (err) {
            this.logger?.LogError(err);
        }
    }

    private registerActionCards() {
        this.homey.flow.getActionCard('climate_now').registerRunListener(async (args: any) => {
            await this.handleFlowAction('climate_now', args, async (vin: string, brand: CarBrand) => {
                await this.connectedDriveApi?.startClimateControl(vin, brand);
            });
        });

        this.homey.flow.getActionCard('climate_cancel').registerRunListener(async (args: any) => {
            await this.handleFlowAction('climate_cancel', args, async (vin: string, brand: CarBrand) => {
                await this.connectedDriveApi?.stopClimateControl(vin, brand);
            });
        });

        this.homey.flow.getActionCard('lock_vehicle').registerRunListener(async (args: any) => {
            await this.handleFlowAction('lock_vehicle', args, async (vin: string, brand: CarBrand) => {
                await this.connectedDriveApi?.lockDoors(vin, brand);
            });
        });

        this.homey.flow.getActionCard('unlock_vehicle').registerRunListener(async (args: any) => {
            await this.handleFlowAction('unlock_vehicle', args, async (vin: string, brand: CarBrand) => {
                await this.connectedDriveApi?.unlockDoors(vin, brand);
            });
        });

        this.homey.flow.getActionCard('blow_horn').registerRunListener(async (args: any) => {
            await this.handleFlowAction('blow_horn', args, async (vin: string, brand: CarBrand) => {
                await this.connectedDriveApi?.blowHorn(vin, brand);
            });
        });

        this.homey.flow.getActionCard('flash_lights').registerRunListener(async (args: any) => {
            await this.handleFlowAction('flash_lights', args, async (vin: string, brand: CarBrand) => {
                await this.connectedDriveApi?.flashLights(vin, brand);
            });
        });

        this.homey.flow.getActionCard('send_message').registerRunListener(async (args: any) => {
            await this.handleFlowAction('send_message', args, async (vin: string, brand: CarBrand) => {
                await this.connectedDriveApi?.sendMessage(vin, brand, args.subject, args.message);
            });
        });

        this.homey.flow.getActionCard('start_charging').registerRunListener(async (args: any) => {
            await this.handleFlowAction('start_charging', args, async (vin: string, brand: CarBrand) => {
                await this.connectedDriveApi?.startCharging(vin, brand);
            });
        });

        this.homey.flow.getActionCard('stop_charging').registerRunListener(async (args: any) => {
            await this.handleFlowAction('stop_charging', args, async (vin: string, brand: CarBrand) => {
                await this.connectedDriveApi?.stopCharging(vin, brand);
            });
        });
    }

    private registerConditionCards() {
        const geofenceCard = this.homey.flow.getConditionCard('geofence');
        geofenceCard.registerArgumentAutocompleteListener("geo_fence", async (query: any, args: any) => {
            const configuration = ConfigurationManager.getConfiguration(this.homey);
            if (configuration?.geofences) {
                const geofences = configuration.geofences.map(item => ({ name: item.label, id: item.label }));
                return geofences.filter(result => result.name?.toLowerCase().includes(query.toLowerCase()));
            }

            return [];
        });
        geofenceCard.registerRunListener(async (args: any, state: any) => {
            const app = this.homey.app as BMWConnectedDrive
            return (app.currentLocation && args.geo_fence.id && app.currentLocation.label === args.geo_fence.id);
        });

        this.homey.flow.getConditionCard('battery_percentage').registerRunListener(async (args: any, _: any) => {
            const battery_percentage = args.device.getCapabilityValue('measure_battery');
            return (battery_percentage < args.battery_charge_test);
        });

        this.homey.flow.getConditionCard('charging_status').registerRunListener(async (args: any, _: any) => {
            const charging_state = args.device.getCapabilityValue('charging_status_capability');
            return (charging_state === args.charging_state);
        });
    }

    /**
     * Perform migrations to ensure proper functionality after upgrading
     */
    private async migrate_configuration() {
        const configuration = ConfigurationManager.getConfiguration(this.homey);
        this.logger?.LogInformation(`Configuration version is ${configuration.currentVersion}.`);

        if (!configuration.currentVersion) {
            configuration.currentVersion = "0.0.0";
        }

        await this.migrate_0_6_5(configuration);
        await this.migrate_0_7_0(configuration);

        configuration.currentVersion = this.homey.app.manifest.version;
        ConfigurationManager.setConfiguration(this.homey, configuration);
    }

    /**
     * Migrate configuration from earlier version to 0.6.5
     */
    private async migrate_0_6_5(configuration: Configuration) {
        if (semver.lt(configuration.currentVersion, "0.6.5")) {
            this.logger?.LogInformation("Migrating to version 0.6.5");

            // Migrating geofences properties to the new casing
            if (configuration.geofences) {
                configuration.geofences = (configuration.geofences as any[]).map(fence => {
                    return {
                        label: fence.Label,
                        latitude: fence.Latitude,
                        longitude: fence.Longitude,
                        address: fence.Address,
                        radius: fence.Radius
                    };
                });
            }
        }
    }

    /**
     * Migrate configuration from earlier version to 0.7.0
     */
    private async migrate_0_7_0(configuration: Configuration) {
        if (semver.lt(configuration.currentVersion, "0.7.0")) {
            this.logger?.LogInformation("Migrating to version 0.7.0");

            // Removing username, password and captcha from the configuration
            // as they are no longer persisted in the application.
            delete (configuration as any).username;
            delete (configuration as any).password;
            delete (configuration as any).captcha;
        }
    }
}

module.exports = BMWConnectedDrive;