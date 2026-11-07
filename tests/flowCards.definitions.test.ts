/**
 * Tests for the definitions of the lock, charging flap, charging cable and climate flow cards.
 *
 * The card JSON files in .homeycompose/flow are the source of the generated app.json; the card
 * ids must match the constants the code fires them with.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Flows } from '../utils/Flows';

const readCard = (kind: 'triggers' | 'conditions', id: string) =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, `../.homeycompose/flow/${kind}/${id}.json`), 'utf8')
  );

const DEVICE_ARG = [{ name: 'device', type: 'device', filter: 'driver_id=bmw|mini' }];

describe('lock, charging flap and charging cable trigger cards', () => {
  it.each([
    [
      Flows.CAR_LOCKED,
      'car_locked',
      'The car was locked',
      'De auto is vergrendeld',
      'vehicle.cabin.door.status',
    ],
    [
      Flows.CAR_UNLOCKED,
      'car_unlocked',
      'The car was unlocked',
      'De auto is ontgrendeld',
      'vehicle.cabin.door.status',
    ],
    [
      Flows.CHARGING_FLAP_LOCKED,
      'charging_flap_locked',
      'The charging flap was locked',
      'De laadklep is vergrendeld',
      'vehicle.body.flap.isLocked',
    ],
    [
      Flows.CHARGING_FLAP_UNLOCKED,
      'charging_flap_unlocked',
      'The charging flap was unlocked',
      'De laadklep is ontgrendeld',
      'vehicle.body.flap.isLocked',
    ],
    [
      Flows.CHARGING_CABLE_CONNECTED,
      'charging_cable_connected',
      'A charging cable was plugged in',
      'Er is een laadkabel aangesloten',
      'vehicle.body.chargingPort.status',
    ],
    [
      Flows.CHARGING_CABLE_DISCONNECTED,
      'charging_cable_disconnected',
      'The charging cable was unplugged',
      'De laadkabel is losgekoppeld',
      'vehicle.body.chargingPort.status',
    ],
  ])('%s should_beADeviceTriggerWithoutTokens', (constant, id, en, nl, key) => {
    const card = readCard('triggers', id);

    expect(constant).toBe(id);
    expect(card.id).toBe(id);
    expect(card.title).toEqual({ en, nl });
    expect(card.args).toEqual(DEVICE_ARG);
    expect(card.tokens).toBeUndefined();
    // Where the data comes from, and what to tick in the BMW CarData portal
    for (const language of ['en', 'nl'] as const) {
      expect(card.hint[language]).toContain('BMW CarData');
      expect(card.hint[language]).toContain(key);
    }
    expect(card.hint.en).toContain('stream selection');
    expect(card.hint.nl).toContain('streamselectie');
  });
});

describe('climate trigger cards', () => {
  it.each([
    [Flows.CLIMATE_NOW_STARTED, 'climate_now_started', 'Climate started', 'Klimatisering gestart'],
    [Flows.CLIMATE_NOW_STOPPED, 'climate_now_stopped', 'Climate stopped', 'Klimatisering gestopt'],
    [
      Flows.CLIMATE_STATUS_CHANGED,
      'climate_status_changed',
      'Climate status changed',
      'Klimaatstatus gewijzigd',
    ],
  ])('%s should_beRetitledAndFilteredOnTheClimateStatusCapability', (constant, id, en, nl) => {
    const card = readCard('triggers', id);

    expect(constant).toBe(id);
    expect(card.id).toBe(id);
    expect(card.title).toEqual({ en, nl });
    expect(card.args).toEqual(DEVICE_ARG);
    expect(card.$filter).toBe('capabilities=climate_status_capability');
  });

  it('should_keepTheCardIdsOfTheExistingFlows', () => {
    // Users already have flows built on climate_now_started
    expect(readCard('triggers', 'climate_now_started').id).toBe('climate_now_started');
    expect(readCard('triggers', 'climate_now_stopped').id).toBe('climate_now_stopped');
  });

  it.each(['climate_now_started', 'climate_now_stopped', 'climate_status_changed'])(
    '%s should_explainItIsTheCarsClimatePreconditioning',
    (id) => {
      const card = readCard('triggers', id);

      expect(card.hint.en).toContain('preconditioning');
      expect(card.hint.en).toContain('My BMW app');
      expect(card.hint.en).toContain('stream selection');
      expect(card.hint.nl).toContain('voorklimatisering');
      expect(card.hint.nl).toContain('My BMW-app');
      expect(card.hint.nl).toContain('streamselectie');
    }
  );

  it('should_passTheNewStateAsAStringToken_when_theStatusChanged', () => {
    const card = readCard('triggers', 'climate_status_changed');

    expect(card.tokens).toHaveLength(1);
    expect(card.tokens[0]).toMatchObject({ name: 'state', type: 'string' });
    expect(card.tokens[0].example).toBe('Heating');
  });

  it('should_notDependOnTheRemovedClimateNowCapability', () => {
    for (const id of ['climate_now_started', 'climate_now_stopped', 'climate_status_changed']) {
      expect(readCard('triggers', id).$filter).not.toContain('climate_now_capability');
    }
  });
});

describe('battery_level_above trigger card', () => {
  const card = readCard('triggers', 'battery_level_above');

  it('should_matchTheFlowsConstant', () => {
    expect(Flows.BATTERY_LEVEL_ABOVE).toBe('battery_level_above');
    expect(card.id).toBe(Flows.BATTERY_LEVEL_ABOVE);
  });

  it('should_beTitledInEnglishAndDutch', () => {
    expect(card.title).toEqual({
      en: 'Battery level changed and is above …',
      nl: 'Batterijniveau gewijzigd en boven …',
    });
    expect(card.titleFormatted).toEqual({
      en: 'Battery level changed and is above [[percentage]]%',
      nl: 'Batterijniveau gewijzigd en boven [[percentage]]%',
    });
  });

  it('should_takeABmwOrMiniDeviceAndAWholePercentageBetween0And100', () => {
    expect(card.args).toEqual([
      DEVICE_ARG[0],
      expect.objectContaining({ name: 'percentage', type: 'number', min: 0, max: 100, step: 1 }),
    ]);
  });

  it('should_passTheNewLevelAsANumberToken', () => {
    expect(card.tokens).toHaveLength(1);
    expect(card.tokens[0]).toMatchObject({ name: 'battery', type: 'number' });
    expect(typeof card.tokens[0].example).toBe('number');
  });

  it('should_explainThatItFiresOnEveryChangeAboveTheNumber_butNotForTheNumberItself', () => {
    expect(card.hint.en).toContain('every change');
    expect(card.hint.en).toContain('80');
    expect(card.hint.en).toContain('81');
    expect(card.hint.en).toContain('82');
    expect(card.hint.en).toContain("doesn't fire for 80 itself");
    expect(card.hint.nl).toContain('elke wijziging');
    expect(card.hint.nl).toContain('80');
    expect(card.hint.nl).toContain('81');
    expect(card.hint.nl).toContain('82');
    expect(card.hint.nl).toContain('Bij 80 zelf gaat het niet af');
  });

  it('should_sayWhatToTickInTheBmwCarDataPortal', () => {
    for (const language of ['en', 'nl'] as const) {
      expect(card.hint[language]).toContain('BMW CarData');
      expect(card.hint[language]).toContain('vehicle.drivetrain.batteryManagement.header');
    }
    expect(card.hint.en).toContain('stream selection');
    expect(card.hint.nl).toContain('streamselectie');
  });

  it('should_notRequireACapabilityFilterBeyondTheDriver', () => {
    expect(card.$filter).toBeUndefined();
  });
});

describe('charging_status_change trigger card', () => {
  const card = readCard('triggers', 'charging_status_change');

  it('should_keepTheCardIdOfTheExistingFlows', () => {
    // Users already have flows built on charging_status_change
    expect(Flows.CHARGING_STATUS_CHANGE).toBe('charging_status_change');
    expect(card.id).toBe('charging_status_change');
  });

  it('should_keepTheChargingStatusTokenAsAString', () => {
    expect(card.tokens).toHaveLength(1);
    expect(card.tokens[0]).toMatchObject({ name: 'charging_status', type: 'string' });
  });

  it('should_giveAnExampleThatTheTokenCanReallyHold', () => {
    // The token carries the internal status, not the raw BMW value
    expect(['CHARGING', 'NOT_CHARGING', 'COMPLETE', 'PAUSED', 'INITIALIZING', 'ERROR']).toContain(
      card.tokens[0].example
    );
  });
});

describe('charging_status condition card', () => {
  const card = readCard('conditions', 'charging_status');
  const dropdown = card.args.find((arg: { name: string }) => arg.name === 'charging_state');

  it('should_offerEveryPluggedInStateAndPluggedOut', () => {
    expect(dropdown.values.map((value: { id: string }) => value.id)).toEqual([
      'plugged_in_charging',
      'plugged_in_paused',
      'plugged_in',
      'plugged_out',
    ]);
  });

  it('should_onlyOfferValuesOfTheHomeyEvChargingStateCapability', () => {
    // The system capability: plugged_in_charging, plugged_in_discharging, plugged_in_paused,
    // plugged_in and plugged_out
    const systemValues = [
      'plugged_in_charging',
      'plugged_in_discharging',
      'plugged_in_paused',
      'plugged_in',
      'plugged_out',
    ];

    for (const value of dropdown.values) {
      expect(systemValues).toContain(value.id);
    }
  });

  it('should_titleThePausedOptionInEnglishAndDutch', () => {
    const paused = dropdown.values.find(
      (value: { id: string }) => value.id === 'plugged_in_paused'
    );

    expect(paused.title).toEqual({
      en: 'Plugged in, charging paused',
      nl: 'Aangesloten, laden gepauzeerd',
    });
  });

  it('should_keepTheExistingOptionsUntouched', () => {
    const byId = (id: string) =>
      dropdown.values.find((value: { id: string }) => value.id === id).title;

    expect(byId('plugged_in_charging')).toEqual({
      en: 'Plugged in and charging',
      nl: 'Aangesloten en aan het laden',
    });
    expect(byId('plugged_in')).toEqual({
      en: 'Plugged in (not charging)',
      nl: 'Aangesloten (niet aan het laden)',
    });
    expect(byId('plugged_out')).toEqual({ en: 'Not plugged in', nl: 'Niet aangesloten' });
  });
});
