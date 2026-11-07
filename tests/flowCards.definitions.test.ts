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
