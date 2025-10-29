/**
 * Generate TelematicKeys.ts from TelematicKeys.json
 *
 * Creates TypeScript enums and data structures for BMW CarData telematic keys
 */

const fs = require('fs');
const path = require('path');

// Read JSON data
const jsonPath = path.join(__dirname, '..', 'lib', 'api', 'TelematicKeys.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log(`Loaded ${data.length} telematic keys`);

// Extract categories
const categoryMap = new Map();
data.forEach(item => {
  const parts = item.key.split('.');
  const category = parts[1]; // e.g., "body", "cabin", "drivetrain"

  if (!categoryMap.has(category)) {
    categoryMap.set(category, []);
  }
  categoryMap.get(category).push(item);
});

console.log(`Found ${categoryMap.size} categories:`, [...categoryMap.keys()].sort());

// Helper to convert key to enum name (e.g., "vehicle.body.hood.isOpen" -> "VEHICLE_BODY_HOOD_IS_OPEN")
function toEnumName(key) {
  return key.toUpperCase().replace(/\./g, '_');
}

// Helper to convert category to enum name (e.g., "body" -> "BODY")
function toCategoryEnumName(category) {
  // Convert camelCase to SCREAMING_SNAKE_CASE
  return category
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '');
}

// Helper to get category description
function getCategoryDescription(category) {
  const descriptions = {
    'body': 'Body elements (hood, trunk, lights, charging port)',
    'cabin': 'Cabin elements (doors, windows, seats, HVAC, infotainment)',
    'channel': 'Data channel information',
    'chassis': 'Chassis and tire information',
    'drivetrain': 'Drivetrain (engine, battery, fuel, transmission)',
    'electricalSystem': 'Electrical system (12V battery)',
    'electronicControlUnit': 'ECU diagnostic information',
    'isMoving': 'Vehicle movement status',
    'powertrain': 'Powertrain electric components',
    'status': 'Vehicle status and service information',
    'trip': 'Trip data and driving statistics',
    'vehicle': 'General vehicle information and settings'
  };
  return descriptions[category] || category;
}

// Generate TypeScript content
let tsContent = `/**
 * BMW CarData API Telematic Keys
 *
 * Auto-generated from TelematicKeys.json
 * Total keys: ${data.length}
 * Categories: ${categoryMap.size}
 *
 * @see https://api-cardata.bmwgroup.com
 * @generated ${new Date().toISOString()}
 */

/** Telematic key descriptor with category and description */
export interface TelematicKeyDescriptor {
  /** Full telematic key (e.g., "vehicle.body.hood.isOpen") */
  key: string;
  /** Human-readable description */
  description: string;
  /** Category enum value */
  category: TelematicCategory;
}

/** Telematic key categories */
export enum TelematicCategory {
`;

// Add category enum values
[...categoryMap.keys()].sort().forEach(category => {
  const enumName = toCategoryEnumName(category);
  const description = getCategoryDescription(category);
  const count = categoryMap.get(category).length;
  tsContent += `  /** ${description} (${count} keys) */\n`;
  tsContent += `  ${enumName} = '${category}',\n`;
});

tsContent += `}

/** All telematic keys as enum */
export enum TelematicKey {
`;

// Add key enum values (sorted by key name)
data.sort((a, b) => a.key.localeCompare(b.key)).forEach(item => {
  const enumName = toEnumName(item.key);
  // Add comment with description (truncate if too long)
  const desc = item.description.length > 100
    ? item.description.substring(0, 97) + '...'
    : item.description;
  tsContent += `  /** ${desc} */\n`;
  tsContent += `  ${enumName} = '${item.key}',\n`;
});

tsContent += `}

/** Telematic keys database (all ${data.length} keys) */
const KEYS_DB: Array<{ k: string; d: string; c: TelematicCategory }> = [\n`;

// Add compact data
data.sort((a, b) => a.key.localeCompare(b.key)).forEach(item => {
  const category = item.key.split('.')[1];
  const desc = item.description.replace(/"/g, '\\"').replace(/\n/g, ' ');
  tsContent += `  { k: '${item.key}', d: "${desc}", c: TelematicCategory.${toCategoryEnumName(category)} },\n`;
});

tsContent += `];

/** Get all telematic keys with full metadata */
export function getAllTelematicKeys(): TelematicKeyDescriptor[] {
  return KEYS_DB.map(({ k, d, c }) => ({ key: k, description: d, category: c }));
}

/** Get all available categories with metadata */
export function getCategories(): Array<{ category: TelematicCategory; description: string; keyCount: number }> {
  const categories = new Map<TelematicCategory, number>();
  KEYS_DB.forEach(({ c }) => {
    categories.set(c, (categories.get(c) ?? 0) + 1);
  });

  return Array.from(categories.entries()).map(([category, count]) => ({
    category,
    description: getCategoryDescription(category),
    keyCount: count
  }));
}

/** Get description for category */
function getCategoryDescription(category: TelematicCategory): string {
  const descriptions: Record<TelematicCategory, string> = {
`;

// Add category descriptions
[...categoryMap.keys()].sort().forEach(category => {
  const enumName = toCategoryEnumName(category);
  const description = getCategoryDescription(category);
  tsContent += `    [TelematicCategory.${enumName}]: '${description}',\n`;
});

tsContent += `  };
  return descriptions[category] || category;
}

/** Get keys for specific category */
export function getKeysByCategory(category: TelematicCategory): TelematicKeyDescriptor[] {
  return KEYS_DB
    .filter(({ c }) => c === category)
    .map(({ k, d, c }) => ({ key: k, description: d, category: c }));
}

/** Get description for specific key */
export function getKeyDescription(key: TelematicKey | string): string | undefined {
  const item = KEYS_DB.find(({ k }) => k === key);
  return item?.d;
}

/** Get category for specific key */
export function getKeyCategory(key: TelematicKey | string): TelematicCategory | undefined {
  const item = KEYS_DB.find(({ k }) => k === key);
  return item?.c;
}

/** Get all keys as simple string array (for container creation) */
export function getAllKeys(): string[] {
  return KEYS_DB.map(({ k }) => k);
}

/** Essential keys for basic vehicle monitoring (Homey integration) */
export const ESSENTIAL_KEYS = [
  // Electric Battery & Charging Status
  TelematicKey.VEHICLE_ELECTRICALSYSTEM_BATTERY_STATEOFCHARGE,
  TelematicKey.VEHICLE_BODY_CHARGINGPORT_STATUS,
  TelematicKey.VEHICLE_BODY_CHARGINGPORT_DCSTATUS,
  TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_REMAININGELECTRICRANGE,
  TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_HVSTATUS,
  TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_TIMEREMAINING,
  TelematicKey.VEHICLE_DRIVETRAIN_ELECTRICENGINE_CHARGING_TIMETOFULLYCHARGED,
  TelematicKey.VEHICLE_POWERTRAIN_ELECTRIC_BATTERY_STATEOFCHARGE_TARGET,

  // Combustion Fuel
  TelematicKey.VEHICLE_DRIVETRAIN_FUELSYSTEM_LEVEL,
  TelematicKey.VEHICLE_DRIVETRAIN_TOTALREMAININGRANGE,

  // Location
  TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LATITUDE,
  TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_LONGITUDE,
  TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_HEADING,
  TelematicKey.VEHICLE_CABIN_INFOTAINMENT_NAVIGATION_CURRENTLOCATION_ALTITUDE,

  // Doors
  TelematicKey.VEHICLE_CABIN_DOOR_ROW1_DRIVER_ISOPEN,
  TelematicKey.VEHICLE_CABIN_DOOR_ROW1_PASSENGER_ISOPEN,
  TelematicKey.VEHICLE_CABIN_DOOR_ROW2_DRIVER_ISOPEN,
  TelematicKey.VEHICLE_CABIN_DOOR_ROW2_PASSENGER_ISOPEN,

  // Windows
  TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_DRIVER_STATUS,
  TelematicKey.VEHICLE_CABIN_WINDOW_ROW1_PASSENGER_STATUS,
  TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_DRIVER_STATUS,
  TelematicKey.VEHICLE_CABIN_WINDOW_ROW2_PASSENGER_STATUS,

  // Trunk & Hood
  TelematicKey.VEHICLE_BODY_TRUNK_ISOPEN,
  TelematicKey.VEHICLE_BODY_TRUNK_ISLOCKED,
  TelematicKey.VEHICLE_BODY_HOOD_ISOPEN,

  // Sunroof
  TelematicKey.VEHICLE_CABIN_SUNROOF_STATUS,

  // Vehicle Status
  TelematicKey.VEHICLE_VEHICLE_TRAVELLEDDISTANCE,
  TelematicKey.VEHICLE_ISMOVING,
  TelematicKey.VEHICLE_DRIVETRAIN_ENGINE_ISACTIVE,

  // Climate
  TelematicKey.VEHICLE_VEHICLE_PRECONDITIONING_ACTIVITY,
  TelematicKey.VEHICLE_CABIN_HVAC_PRECONDITIONING_STATUS_COMFORTSTATE,

  // Service
  TelematicKey.VEHICLE_STATUS_CONDITIONBASEDSERVICESCOUNT,
] as const;

/** Type for essential keys */
export type EssentialKey = typeof ESSENTIAL_KEYS[number];
`;

// Write the generated file
const outputPath = path.join(__dirname, '..', 'lib', 'api', 'TelematicKeys.ts');
fs.writeFileSync(outputPath, tsContent, 'utf8');

console.log(`✅ Generated ${outputPath}`);
console.log(`   - ${data.length} telematic keys`);
console.log(`   - ${categoryMap.size} categories`);
console.log(`   - 33 essential keys`);
